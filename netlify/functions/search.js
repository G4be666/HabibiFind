// netlify/functions/search.js
const https = require('https');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;

// Platforms we support – the search query will look for these domains + location
const PLATFORMS = [
  { name: 'Clover', domain: 'clover.com', queryTemplate: 'site:clover.com "{location}" restaurant order online' },
  { name: 'Menufy', domain: 'menufy.com', queryTemplate: 'site:menufy.com "{location}" restaurant' },
  { name: 'OrderSpotOn', domain: 'orderspot.online', queryTemplate: 'site:orderspot.online "{location}" restaurant' },
  { name: 'Thanx', domain: 'thanx.com', queryTemplate: 'site:thanx.com/ordering "{location}" restaurant' },
  { name: 'SmileDining', domain: 'smiledining.com', queryTemplate: 'site:smiledining.com "{location}" restaurant' },
  { name: 'TapMango', domain: 'tapmango.com', queryTemplate: 'site:tapmango.com "{location}" restaurant' }
];

// Helper to call Google Custom Search API
function googleSearch(query) {
  const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.error) reject(json.error.message);
          else resolve(json.items || []);
        } catch(e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Extract restaurant name from URL or title (heuristic)
function extractRestaurantName(item, platformDomain) {
  // Try to get from the title, removing platform name and location noise
  let title = item.title;
  // Many results have format: "Joe's Pizza | Clover" or "Joe's Pizza on Menufy"
  let name = title.split('|')[0].split('-')[0].split('–')[0].trim();
  // If name is too long or looks like a URL, fallback to URL path
  if (name.length > 50 || name.includes('http')) {
    const path = new URL(item.link).pathname;
    const parts = path.split('/').filter(p => p.length > 2);
    name = parts[parts.length-1]?.replace(/[_-]/g, ' ') || title;
  }
  return name;
}

exports.handler = async (event) => {
  // Only allow POST with location
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  const { location } = JSON.parse(event.body);
  if (!location || location.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Location required' }) };
  }

  const results = [];
  
  // Search each platform sequentially (to avoid hitting rate limits)
  for (const platform of PLATFORMS) {
    const query = platform.queryTemplate.replace('{location}', location);
    try {
      const items = await googleSearch(query);
      for (const item of items) {
        // Only include if the link actually contains the platform domain (safety)
        if (item.link.includes(platform.domain)) {
          results.push({
            name: extractRestaurantName(item, platform.domain),
            platform: platform.name,
            url: item.link,
            snippet: item.snippet,
          });
        }
      }
    } catch (err) {
      console.error(`Error searching ${platform.name}:`, err);
      // Continue with other platforms even if one fails
    }
    // Small delay to be nice to Google (optional)
    await new Promise(resolve => setTimeout(resolve, 200));
  }
  
  // Remove duplicates (same URL) and limit to 50 per location
  const unique = [];
  const seen = new Set();
  for (const r of results) {
    if (!seen.has(r.url)) {
      seen.add(r.url);
      unique.push(r);
    }
  }
  
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ location, count: unique.length, restaurants: unique.slice(0, 50) })
  };
};
