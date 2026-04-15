const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

exports.handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

    try {
        const { city, state, platforms } = JSON.parse(event.body);
        const apiKey = process.env.GEMINI_API_KEY;

        const prompt = `Act as a high-precision local data scraper. Use Google Search to find restaurants in ${city}, ${state} that use ${platforms.join(", ")} for direct online ordering. 
        Focus on identifying specific URLs from: toasttab.com, orderspoton.com, menufy.com, chownow.com, and bentobox.com. 
        Verify that the URLs are active ordering pages. Return a structured list categorized by platform.`;

        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: {
                    temperature: 0.1,
                    // This is the professional way to force JSON format
                    response_mime_type: "application/json",
                    response_schema: {
                        type: "object",
                        properties: {
                            results: {
                                type: "array",
                                items: {
                                    type: "object",
                                    properties: {
                                        platform: { type: "string" },
                                        restaurants: {
                                            type: "array",
                                            items: {
                                                type: "object",
                                                properties: {
                                                    name: { type: "string" },
                                                    cuisine: { type: "string" },
                                                    address: { type: "string" },
                                                    orderUrl: { type: "string" },
                                                    website: { type: "string" }
                                                },
                                                required: ["name", "orderUrl"]
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            })
        });

        const data = await response.json();
        
        // Error handling for API limits or search failures
        if (!data.candidates) {
            return { statusCode: 429, headers: corsHeaders, body: JSON.stringify({ error: "Search quota reached." }) };
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: data.candidates[0].content.parts[0].text
        };
    } catch (err) {
        return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ error: err.message }) };
    }
};
