// netlify/functions/search.js
const https = require('https');

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const SEARCH_ENGINE_ID = process.env.SEARCH_ENGINE_ID;

// --- Improved Platform Configurations ---
const PLATFORMS = [
  { 
    name: 'Clover', 
    queryTemplate: '{location} restaurant', 
    siteSearch: 'clover.com' // Use siteSearch for domains
  },
  { 
    name: 'Menufy', 
    queryTemplate: '{location} restaurant', 
    siteSearch: 'menufy.com'
  },
  { 
    name: 'OrderSpotOn', 
    queryTemplate: '{location} restaurant', 
    inurl: 'orderspot.online' // Use inurl: for subdomains
  },
  { 
    name: 'Thanx', 
    queryTemplate: '{location} restaurant', 
    inurl: 'thanx.com/ordering'
  },
  { 
    name: 'SmileDining', 
    queryTemplate: '{location} restaurant', 
    siteSearch: 'smiledining.com'
  },
  { 
    name: 'TapMango', 
    queryTemplate: '{location} restaurant', 
    siteSearch: 'tapmango.com'
  }
];

// Helper: Google Custom Search API call
function googleSearch(query, siteSearch = null, inurl = null) {
  let params = new URLSearchParams({
    key: GOOGLE_API_KEY,
    cx: SEARCH_ENGINE_ID,
    q: query,
    num: 20  // Request more results per platform
  });

  if (siteSearch) {
    params.append('siteSearch', siteSearch);
  }
  if (inurl) {
    // Append inurl: operator to the search query
    params.set('q', `${query} inurl:${inurl}`);
  }

  const url = `https://www.googleapis.com/customsearch/v1?${params.toString()}`;
  console.log(`Searching with URL: ${url}`); // Helpful for debugging

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

// Helper: Extract restaurant name (improved)
function extractRestaurantName(item, platformName) {
  let name = item.title.split('|')[0].split('-')[0].split('–')[0].trim();
  if (name.length > 50 || name.includes('http')) {
    try {
      const path = new URL(item.link).pathname;
      const parts = path.split('/').filter(p => p.length > 2);
      name = parts.pop()?.replace(/[_-]/g, ' ') || name;
    } catch (e) { /* fallback to title */ }
  }
  // Remove platform name if it accidentally got included
  name = name.replace(new RegExp(`\\s*[|(]?\\s*${platformName}\\s*[)|]?`, 'i'), '').trim();
  return name;
}

// --- Main Netlify Function Handler ---
exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }
  
  const { location } = JSON.parse(event.body);
  if (!location || location.trim() === '') {
    return { statusCode: 400, body: JSON.stringify({ error: 'Location required' }) };
  }

  const results = [];
  
  for (const platform of PLATFORMS) {
    const query = platform.queryTemplate.replace('{location}', location);
    try {
      const items = await googleSearch(
        query, 
        platform.siteSearch || null, 
        platform.inurl || null
      );
      
      for (const item of items) {
        const link = item.link;
        const isValid = platform.siteSearch ? link.includes(platform.siteSearch) : link.includes('orderspot.online') || link.includes('thanx.com');
        if (isValid) {
          results.push({
            name: extractRestaurantName(item, platform.name),
            platform: platform.name,
            url: link,
            snippet: item.snippet,
          });
        }
      }
    } catch (err) {
      console.error(`Error searching ${platform.name}:`, err);
    }
    // Delay to avoid hitting API rate limits
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // --- Deduplicate Results ---
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
    body: JSON.stringify({ 
      location, 
      count: unique.length, 
      restaurants: unique.slice(0, 50) 
    })
  };
};
