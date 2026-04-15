# SpotFinder

Discover restaurants in any city that use **Toast, SpotOn, Olo, Menufy, BentoBox, PopMenu, Flipdish, and Lunchbox** for direct online ordering — completely invisible on DoorDash or UberEats.

---

## Deploy to Netlify (5 minutes)

### Option A — GitHub (recommended)

1. **Create a GitHub repo** and push these files:
   ```
   index.html
   netlify.toml
   netlify/functions/search.js
   ```

2. **Connect to Netlify:**
   - Go to [netlify.com](https://netlify.com) → "Add new site" → "Import from Git"
   - Select your repo
   - Build command: *(leave empty)*
   - Publish directory: `.`
   - Click **Deploy**

3. **Add your API key:**
   - Netlify dashboard → Site settings → Environment variables
   - Add: `ANTHROPIC_API_KEY` = your key from [console.anthropic.com](https://console.anthropic.com)

4. **Trigger a redeploy** (Deploys tab → Trigger deploy) and you're live.

---

### Option B — Netlify CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# From the project folder:
netlify init
netlify env:set ANTHROPIC_API_KEY your-key-here
netlify deploy --prod
```

---

## Local development

```bash
npm install -g netlify-cli
netlify env:set ANTHROPIC_API_KEY your-key-here
netlify dev
# Opens at http://localhost:8888
```

---

## How it works

1. You enter a city + state and choose platforms
2. The frontend calls `/api/search` (a Netlify serverless function)
3. The function calls the Anthropic API with **live web search** enabled
4. Results are returned as structured JSON and rendered as cards with direct ordering links

The serverless function tries live web search first (Claude searches the web in real-time), then falls back to Claude's trained knowledge if web search is unavailable.

---

## Cost

Each search uses approximately **2,000–6,000 tokens** depending on how many platforms you search. At Anthropic's current pricing this is less than $0.01 per search with Haiku, or ~$0.05 with Sonnet.

---

## Platforms supported

| Platform | What it is |
|----------|-----------|
| **Toast** | Most common — powers ordering on thousands of restaurant sites via toasttab.com |
| **SpotOn** | Restaurant management + online ordering platform |
| **Olo** | Enterprise ordering platform used by chains and independents |
| **Menufy** | Online ordering for independent restaurants |
| **BentoBox** | Restaurant website + ordering platform |
| **PopMenu** | Menu management + ordering for independent restaurants |
| **Flipdish** | Online ordering + loyalty platform |
| **Lunchbox** | Digital ordering for restaurants |

---

## File structure

```
spotfinder/
├── index.html                  ← Frontend (pure HTML/CSS/JS)
├── netlify.toml                ← Netlify config + redirects
├── README.md
└── netlify/
    └── functions/
        └── search.js           ← Serverless function (Node 18)
```
