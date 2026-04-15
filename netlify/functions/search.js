// HabibiFind — Gemini 2.0 High-Reliability Search
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

        // Hardened prompt to prevent the "talking" that causes the JSON error
        const prompt = `SEARCH GOOGLE for restaurants in ${location} using: ${platforms.join(", ")}.
        Find direct ordering links for: Clover, Menufy, SpotOn, Thanx, SmileDining, TapMango, Toast, Olo.
        Return ONLY valid JSON. No conversational text.
        Format: {"results": [{"platform": "Name", "restaurants": [{"name": "N", "cuisine": "C", "orderUrl": "URL", "website": "URL"}]}]}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: { 
                    response_mime_type: "application/json",
                    temperature: 0.1 // Low temperature makes it stick to the format better
                }
            })
        });

        const data = await response.json();
        
        // Safety check: sometimes Gemini wraps JSON in markdown blocks
        let rawText = data.candidates[0].content.parts[0].text;
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
            body: JSON.stringify({ error: "The AI failed to format data. Please try again." }) 
        };
    }
};
