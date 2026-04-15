const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";

exports.handler = async (event) => {
    const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
    };

    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers: corsHeaders, body: "" };

    try {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) throw new Error("Server configuration missing API key.");

        const { city, state, platforms } = JSON.parse(event.body);

        // System Instruction using Advanced Search Operators
        const prompt = `You are a strict data aggregator. Your job is to find verified, direct-ordering URLs for restaurants in ${city}, ${state}.
        You MUST use the Google Search tool to find exact matches for these platforms: ${platforms.join(", ")}.
        
        Search strategy examples:
        - site:toasttab.com "${city}" "${state}"
        - site:orderspoton.com "${city}" "${state}"
        - site:menufy.com "${city}" "${state}"
        
        CRITICAL RULES:
        1. Only return a URL if the search tool confirms it exists. Do not hallucinate links.
        2. Extract the restaurant name, cuisine type, and the direct ordering URL.`;

        // The API Call with Strict Schema Enforcement
        const fetchPromise = fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: {
                    temperature: 0.1, // Low temperature for high accuracy
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
                                                    orderUrl: { type: "string" },
                                                    address: { type: "string" }
                                                },
                                                required: ["name", "orderUrl"]
                                            }
                                        }
                                    }
                                }
                            }
                        },
                        required: ["results"]
                    }
                }
            })
        });

        // The Kill Switch: Force a graceful fail before Netlify crashes the function
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error("TIMEOUT")), 8500)
        );

        const response = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (!response.ok) {
            const errData = await response.json();
            throw new Error(`API Error: ${errData.error?.message || "Unknown error"}`);
        }

        const data = await response.json();
        
        // Return the strictly validated JSON string from Gemini
        return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: data.candidates[0].content.parts[0].text
        };

    } catch (err) {
        console.error("[Backend Error]:", err.message);
        
        let clientMessage = "An unexpected error occurred while aggregating data.";
        if (err.message === "TIMEOUT") {
            clientMessage = "The web search took too long. Try selecting fewer platforms at once to speed up the search.";
        }

        return { 
            statusCode: 500, 
            headers: { ...corsHeaders, "Content-Type": "application/json" }, 
            body: JSON.stringify({ error: clientMessage }) 
        };
    }
};
