# Prept — Recipe Import + Grocery List (Starter)

This is a beginner-friendly starter for **Prept**: paste a recipe link → extract ingredients (via Schema.org Recipe), scale servings, and build a grocery list.

## What's included
- Vanilla **HTML/CSS/JS** (no framework) so it's easy to read and learn.
- A test **sample recipe JSON** so you can play without any backend.
- (Optional) A **Cloudflare Worker** to fetch & parse recipe pages by URL (avoids CORS).
- GitHub Pages workflow for easy deployment.

## Quick Start (no backend)
1. Open `index.html` in your browser (double‑click).
2. Click **Load Sample** to see how parsing works.
3. Try changing **Servings** to see the scaling.

## Next: host on GitHub Pages
1. Create a new repo on GitHub called `prept` (or anything you like).
2. Upload all files in this folder to the repo (or push via Git).
3. Enable **Settings → Pages → Deploy from a branch**, pick `main` and `/` (root).
4. Your site will publish at `https://<your-username>.github.io/<repo-name>/`.

## Optional backend (to fetch real recipe URLs)
Most recipe sites embed **Schema.org Recipe** as JSON-LD. Browsers block cross‑site fetches, so you’ll need a tiny backend proxy:
- Use the **Cloudflare Worker** in `worker/worker.js` (free tier is enough).
- Set `VITE_WORKER_URL` (or edit `app.js`) to point to your Worker route, e.g. `https://prept.yourname.workers.dev/parse?url=`.

> ⚠️ Respect each website’s Terms of Service. Use this for personal projects or get permission for production use.

## Development notes
- No build step required.
- If you prefer a framework later, you can migrate to **React/Vite** easily.

## Roadmap ideas
- Account & saved lists
- Ingredient normalization (e.g., “tsp”, “teaspoon”, “t.”)
- Unit conversion (US ↔ metric)
- Grocery categories (produce, dairy, etc.)
- Share/export to Notes/Reminders
