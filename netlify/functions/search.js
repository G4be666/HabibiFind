// HabibiFind — Gemini 2.0 High-Reliability Search (v3.0)
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

exports.handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Missing GEMINI_API_KEY" }) };

    try {
        const { city, state, platforms } = JSON.parse(event.body);
        const location = `${city}, ${state}`;

        // Strictly instructed prompt to prevent conversational "noise"
        const prompt = `SEARCH GOOGLE for real restaurants in ${location} using: ${platforms.join(", ")}.
        Focus on these specific URL patterns:
        - Clover (clover.com/online-ordering/)
        - Menufy (menufy.com)
        - SpotOn (orderspoton.com)
        - Thanx (thanx.com)
        - SmileDining (smiledining.com)
        - TapMango (tapmango.com)
        - Toast (toasttab.com)
        - Olo (olo.com)
        
        Return ONLY valid JSON. No text before or after.
        Format: {"results": [{"platform": "Name", "restaurants": [{"name": "N", "cuisine": "C", "address": "A", "orderUrl": "URL", "website": "URL", "note": ""}]}]}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: { 
                    response_mime_type: "application/json",
                    temperature: 0
                }
            })
        });

        const data = await response.json();
        
        if (!data.candidates || !data.candidates[0].content.parts[0].text) {
          throw new Error("AI returned an empty response.");
        }

        let rawText = data.candidates[0].content.parts[0].text;
        
        // Manual scrub: Removes markdown code blocks if the AI accidentally uses them
        const cleanJson = rawText.replace(/```json|```/g, "").trim();

        return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: cleanJson,
        };
    } catch (err) {
        console.error("Search Error:", err);
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: "The search engine stuttered. Please try again in 5 seconds." }) 
        };
    }
};
