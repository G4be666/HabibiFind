// HabibiFind — Gemini-Powered Free Search
const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

exports.handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: "Missing GEMINI_API_KEY" }) };

    const { city, state, platforms } = JSON.parse(event.body);
    const location = `${city}, ${state}`;

    const prompt = `Search Google to find real restaurants in ${location} that use these platforms for direct ordering: ${platforms.join(", ")}. 
    Focus on finding direct ordering links (e.g., toasttab.com, spoton.com, menufy.com).
    Return ONLY a JSON object in this format: 
    {"results": [{"platform": "Name", "restaurants": [{"name": "N", "cuisine": "C", "orderUrl": "URL", "website": "URL"}]}]}`;

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }], // This triggers the FREE Google Search
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();
        const cleanJson = JSON.parse(data.candidates[0].content.parts[0].text);

        return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: JSON.stringify(cleanJson),
        };
    } catch (err) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
};
