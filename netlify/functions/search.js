// SpotFinder — Netlify serverless function
// Calls Anthropic API server-side (no CORS issues, real web search works here)

const ANTHROPIC_API = "https://api.anthropic.com/v1/messages";
const MODEL_FAST    = "claude-haiku-4-5-20251001";
const MODEL_SMART   = "claude-sonnet-4-20250514";

// ── JSON extraction: tries <json> tags first, then raw brace scan ──────────
function extractJSON(text) {
  const tag = text.match(/<json>([\s\S]*?)<\/json>/i);
  if (tag) {
    try { return JSON.parse(tag[1].trim()); } catch {}
  }
  const a = text.indexOf("{"), b = text.lastIndexOf("}");
  if (a !== -1 && b > a) {
    try { return JSON.parse(text.slice(a, b + 1)); } catch {}
  }
  return null;
}

// ── Single Anthropic API call ──────────────────────────────────────────────
async function callAnthropic(apiKey, body) {
  const res = await fetch(ANTHROPIC_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data;
}

// ── Extract text blocks from content array ─────────────────────────────────
function getText(content) {
  return (content || []).filter(b => b.type === "text").map(b => b.text).join("");
}

// ── Build the search prompt ────────────────────────────────────────────────
function buildPrompt(location, platforms) {
  const platList = platforms.join(", ");
  return `Search the web and find real restaurants in ${location} that use these specific online ordering platforms on their OWN websites (not DoorDash/UberEats/GrubHub): ${platList}.

These are platforms that power the "Order Online" button on a restaurant's own site:
- Toast: ordering pages at toasttab.com/[restaurant] — very common, hundreds of restaurants per city
- SpotOn: spoton.com-powered restaurant websites
- Olo: olo.com-powered ordering embedded on restaurant sites
- Menufy: menufy.com restaurant directory pages
- BentoBox: bentobox.com restaurant website platform
- PopMenu: popmenu.com restaurant ordering pages
- Flipdish: flipdish.com online ordering
- Lunchbox: lunchbox.io restaurant ordering

For Toast specifically, search "site:toasttab.com ${location.split(",")[0]}" — there are usually many results.
For SpotOn, search "SpotOn online ordering ${location}" and look for restaurant sites.
Be thorough. Find as many real, currently-operating restaurants as possible for each platform.

Respond ONLY with a <json></json> block — no other text:
<json>
{
  "results": [
    {
      "platform": "Toast",
      "restaurants": [
        {
          "name": "Restaurant Name",
          "cuisine": "Italian",
          "address": "123 Main St, ${location}",
          "orderUrl": "https://www.toasttab.com/restaurant-slug/v3",
          "website": "https://restaurantname.com",
          "note": ""
        }
      ]
    }
  ]
}
</json>

Rules:
- Include ALL platforms in results: ${platList}
- Up to 10 restaurants per platform — more is better
- Empty array [] if none found for a platform
- cuisine: 1-3 words (e.g. "Mexican", "BBQ", "Sushi")
- orderUrl: direct link to their platform ordering page
- website: restaurant's own domain if known, otherwise same as orderUrl
- note: any useful detail (e.g. "local chain", "cash only pickup") — empty string if nothing
- Only include verifiable, real restaurants that are currently operating`;
}

// ── Agentic web search loop ────────────────────────────────────────────────
// web_search_20250305 is server-side: Anthropic executes searches automatically.
// We run up to 3 turns to let the model search thoroughly.
async function searchWithWebTool(apiKey, prompt) {
  let messages = [{ role: "user", content: prompt }];
  const tools = [{ type: "web_search_20250305", name: "web_search" }];

  for (let turn = 0; turn < 5; turn++) {
    const data = await callAnthropic(apiKey, {
      model: MODEL_SMART,
      max_tokens: 4096,
      tools,
      messages,
    });

    // Accumulate assistant turn
    messages.push({ role: "assistant", content: data.content });

    if (data.stop_reason === "end_turn") {
      return getText(data.content);
    }

    // If tool_use: Anthropic fills in tool_result server-side but we need
    // to pass back an empty user turn with tool_results to continue
    if (data.stop_reason === "tool_use") {
      const toolUseBlocks = data.content.filter(b => b.type === "tool_use");
      messages.push({
        role: "user",
        content: toolUseBlocks.map(b => ({
          type: "tool_result",
          tool_use_id: b.id,
          content: "",
        })),
      });
      continue;
    }

    // Any other stop reason — extract whatever text we have
    return getText(data.content);
  }

  return getText(messages[messages.length - 1]?.content || []);
}

// ── Main handler ───────────────────────────────────────────────────────────
exports.handler = async (event) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "ANTHROPIC_API_KEY environment variable not set. Add it in Netlify → Site settings → Environment variables.",
      }),
    };
  }

  let city, state, platforms;
  try {
    ({ city, state, platforms } = JSON.parse(event.body));
    if (!city || !state || !platforms?.length) throw new Error("Missing fields");
  } catch {
    return {
      statusCode: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Invalid request. Send { city, state, platforms[] }" }),
    };
  }

  const location = `${city.trim()}, ${state.trim()}`;
  const prompt = buildPrompt(location, platforms);

  let text = "";
  let usedWebSearch = false;

  // ── Attempt 1: Live web search (Haiku → Sonnet) ─────────────────────────
  try {
    text = await searchWithWebTool(apiKey, prompt);
    usedWebSearch = true;
  } catch (webErr) {
    console.error("Web search failed:", webErr.message);
    // Fall through to knowledge-based
  }

  // ── Attempt 2: Knowledge-based fallback ─────────────────────────────────
  if (!extractJSON(text)?.results) {
    try {
      const data = await callAnthropic(apiKey, {
        model: MODEL_SMART,
        max_tokens: 4096,
        messages: [{ role: "user", content: prompt }],
      });
      text = getText(data.content);
    } catch (knowledgeErr) {
      return {
        statusCode: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        body: JSON.stringify({ error: knowledgeErr.message }),
      };
    }
  }

  const parsed = extractJSON(text);
  if (!parsed?.results) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "Could not parse restaurant data. Try again.",
        rawPreview: text.slice(0, 300),
      }),
    };
  }

  return {
    statusCode: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ ...parsed, usedWebSearch }),
  };
};
