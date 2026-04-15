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

        // The "Expert Scraper" Prompt
        const systemPrompt = `You are a professional local business data aggregator. 
        Your task: Find verified direct-ordering URLs for restaurants in ${city}, ${state}.
        Target Platforms: ${platforms.join(", ")}.
        Instruction: Use the Google Search tool to find actual ordering domains. 
        Look for URLs containing: toasttab.com, orderspoton.com, menufy.com, chownow.com, bentobox.com.
        Return ONLY valid JSON. If no results found, return an empty array for that platform.`;

        // We use a Promise.race to ensure we beat the 10-second Netlify timeout
        const searchTask = fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: [{ parts: [{ text: systemPrompt }] }],
                tools: [{ google_search: {} }],
                generationConfig: {
                    temperature: 0.1,
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
                        }
                    }
                }
            })
        });

        // 8.5 second timeout to allow for headers/processing before Netlify's 10s kill
        const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8500));

        const response = await Promise.race([searchTask, timeout]);
        const data = await response.json();

        if (!data.candidates || !data.candidates[0].content.parts[0].text) {
            throw new Error("No data returned from search engine.");
        }

        return {
            statusCode: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
            body: data.candidates[0].content.parts[0].text
        };

    } catch (err) {
        console.error("Search Engine Error:", err);
        return {
            statusCode: 500,
            headers: corsHeaders,
            body: JSON.stringify({ 
                error: err.message === "Timeout" ? "Search took too long. Try narrowing your platforms." : err.message 
            })
        };
    }
};
