# Schneider Electric — Lab Tests (Vanilla Vite + TypeScript)

This project is a refactor of the original single‑file SPA into a modular Vite + TypeScript app, preserving the existing UI/UX and features while making the codebase maintainable and extensible.

## Phase 1 — Local JSON + Modularization (Completed)

### What’s included
- Vite + TypeScript vanilla app (no frameworks)
- Modular folder structure under `src/`
- Typed models (Labs, Tests, Categories, UI strings, App state)
- Data moved to JSON in `/public/data` and `/public/i18n`
- Leaflet map encapsulated in `/src/map`
- Store with persisted state and deep‑links (`#testId` and `#lab:<labId>`)
- ESLint + Prettier

### Folder structure
```
/src
  /assets
  /styles
  /i18n
  /models
  /data
  /services
  /store
  /ui
  /map
  /export
  main.ts
/public
  /data
    labs.json
    categories.json
    tests.json
  /i18n
    en.json
    es.json
    fr.json
    ca.json
```

### Run locally
```bash
npm install
npm run dev
```

### Build
```bash
npm run build
npm run preview
```

### Lint / format
```bash
npm run lint
npm run format
```

## Phase 2 — Headless CMS (Directus) + Fallback (Completed)

### CMS choice: **Directus** (REST)

Why Directus:
- Simple REST API, self‑host friendly
- Easy to model collections with per‑language fields
- Fast to prototype and easy to swap later

### Environment configuration
Create `.env` from `.env.example`:
```
VITE_CMS_PROVIDER=directus
VITE_CMS_URL=https://your-directus-instance.example
VITE_CMS_TOKEN=your_api_token
VITE_CMS_CACHE_TTL_MS=300000
VITE_API_BASE=http://127.0.0.1:8000
VITE_ADMIN_API_KEY=change-me
```

If CMS env vars are **not** set or CMS fails, the app automatically falls back to local JSON.

### Admin editor (SE Member)
- After unlocking `SE Member`, a `Content editor` entry appears in nav, plus `+ Add test` and `Edit test`.
- If `VITE_ADMIN_API_KEY` is configured, these actions call the admin endpoint configured in `VITE_ADMIN_API_BASE`.
- If no admin API key/backend is configured, the editor runs in static mode: changes are saved in browser `localStorage` and can be exported with `Download tests.json`.
- For GitHub Pages/Netlify static hosting, use static mode to prepare edits, then replace `public/data/tests.json` with the downloaded file and commit it.
- You can edit test cards (title/summary/why/how/tags/category/standard fields), set `Where is this performed` labs, and create new tests.

### GitHub-backed editing with Netlify
The repo includes a Netlify Function at `/.netlify/functions/admin-tests`. In this mode, user edits become commits to `public/data/tests.json` in GitHub.

Client-side variables:
```
VITE_ADMIN_API_KEY=change-me
VITE_ADMIN_API_BASE=/.netlify/functions/admin-tests
```

Server-only Netlify environment variables:
```
ADMIN_API_KEY=change-me
GITHUB_TOKEN=github_pat_or_fine_grained_token
GITHUB_OWNER=your-github-user-or-org
GITHUB_REPO=your-repo-name
GITHUB_BRANCH=main
GITHUB_CONTENT_PATH=public/data/tests.json
ALLOWED_ORIGIN=https://your-site.netlify.app
```

Security note:
- `GITHUB_TOKEN` must only be stored in Netlify environment variables.
- Do not prefix `GITHUB_TOKEN` with `VITE_`; that would expose it in the browser bundle.
- The GitHub token needs repository Contents read/write access.
- If Netlify is connected to the same GitHub repo, each commit triggers a new deploy and updates the public page.

### Directus content model
Create 3 collections: `labs`, `categories`, `tests`.

**labs**
- `id` (string, primary key)
- `color` (string, hex)
- `coords_lat` (number)
- `coords_lng` (number)
- `img` (string, optional)
- `name_en`, `name_es`, `name_fr`, `name_ca` (string)
- `address_en`, `address_es`, `address_fr`, `address_ca` (string)
- `desc_en`, `desc_es`, `desc_fr`, `desc_ca` (string)
- `overview_en`, `overview_es`, `overview_fr`, `overview_ca` (string)
- `location_en`, `location_es`, `location_fr`, `location_ca` (string)

**categories**
- `id` (string, primary key)
- `icon` (string / emoji)
- `order` (number, optional)
- `title_en`, `title_es`, `title_fr`, `title_ca` (string)
- `subtitle_en`, `subtitle_es`, `subtitle_fr`, `subtitle_ca` (string)

**tests**
- `id` (string, primary key)
- `category_id` (string, foreign key to categories)
- `icon` (string / emoji)
- `title_en`, `title_es`, `title_fr`, `title_ca` (string)
- `summary_en`, `summary_es`, `summary_fr`, `summary_ca` (string)
- `why_en`, `why_es`, `why_fr`, `why_ca` (string)
- `how_en`, `how_es`, `how_fr`, `how_ca` (string)
- `tags` (array of strings)
- `labs` (array of lab ids)
- `refStdId` (string, optional)
- `refClause` (string, optional)

### CMS behavior
- The app checks CMS first if configured.
- CMS content **wins** over local JSON.
- If CMS is unavailable, local JSON is used automatically.

## Phase 3 — Export to PDF and Excel (Completed)

### PDF Export (Test Sheet)
- Button: **Export PDF** appears in test detail view
- Generates a PDF with:
  - Header (title + date/time + language)
  - Test title + summary
  - WHY and HOW blocks
  - Related labs list (name + address)
  - Footer (test ID + "Generated from web app")

### Excel Export (Catalog)
- Button: **Export Excel** in the header
- Generates an `.xlsx` with columns:
  - `id`, `categoryId`, `categoryTitle`, `title`, `summary`, `why`, `how`,
    `tags`, `labs`, `refStdId`, `refClause`

## Notes
- All HTML rendering escapes content to prevent unsafe injection.
- Styling and UX remain consistent with the original dark UI.
- Deep links and localStorage persistence remain intact.
