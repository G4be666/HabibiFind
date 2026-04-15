// HabibiFind — Gemini-Powered Free Search (v2.0)
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

        const prompt = `SEARCH GOOGLE to find real restaurants in ${location} using: ${platforms.join(", ")}.
        Look for these specific link types:
        - Clover: clover.com/online-ordering/
        - Menufy: menufy.com
        - SpotOn: orderspoton.com
        - Thanx: thanx.com
        - SmileDining: smiledining.com
        - TapMango: tapmango.com
        - Toast: toasttab.com

        Return ONLY a JSON object:
        {"results": [{"platform": "Name", "restaurants": [{"name": "N", "cuisine": "C", "orderUrl": "URL", "website": "URL"}]}]}`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: { response_mime_type: "application/json" }
            })
        });

        const data = await response.json();
        let rawText = data.candidates[0].content.parts[0].text;
        
        // Clean up any potential markdown code blocks the AI might have added
        const cleanJson = rawText.replace(/```json|```/g, "").trim();

        return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: cleanJson,
        };
    } catch (err) {
        return { 
            statusCode: 500, 
            headers: corsHeaders, 
            body: JSON.stringify({ error: "Search failed. Try a larger city or refresh." }) 
        };
    }
};
