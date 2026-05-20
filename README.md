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
VITE_CMS_TOKEN=
VITE_CMS_CACHE_TTL_MS=300000
VITE_API_BASE=http://127.0.0.1:8000
VITE_ENABLE_LOCAL_ADMIN_API=false
VITE_ADMIN_API_KEY=
VITE_ADMIN_API_BASE=
```

If CMS env vars are **not** set or CMS fails, the app automatically falls back to local JSON.
Do not put private tokens in `VITE_*` variables: Vite embeds them in the browser bundle.

### GitHub Pages deployment
This repo is configured to deploy with GitHub Actions using `.github/workflows/pages.yml`.

Setup:
- In GitHub, open **Settings → Pages**.
- Set **Source** to **GitHub Actions**.
- Push to `main`; the workflow builds the Vite app and publishes `dist`.

### Admin editor (SE Member)
- After unlocking `SE Member`, a `Content editor` entry appears in nav, plus `+ Add test` and `Edit test`.
- On GitHub Pages, the editor runs in static mode: changes are saved in browser `localStorage`.
- To publish edits with no backend/cost, the technician uses `Copy tests.json`, opens `Open GitHub editor`, replaces `public/data/tests.json`, and commits with their own GitHub user.
- A technician needs write access to commit directly to `main`; otherwise GitHub will guide them to create a fork/pull request.

### Document access model
- `public/assets/clients_guide_lab.pdf` is intentionally public and powers the main `Export PDF` action.
- Standards PDFs are restricted documents. They must not be stored under `public/` because GitHub Pages serves every file there without authentication.
- Keep restricted standards in `private/standards/` for local reference only, or host them in an authenticated Schneider repository such as SharePoint and wire the HTTPS links in `TRUSTED_STANDARD_URLS`.
- After the commit lands on `main`, GitHub Actions redeploys the site.
- You can edit test cards (title/summary/why/how/tags/category/standard fields), set `Where is this performed` labs, and create new tests.

### GitHub-only editing limitation
GitHub Pages is static hosting. A public browser app cannot create commits with a hidden repository token because any `VITE_*` token is bundled into public JavaScript.

Safe GitHub-only options:
- Self-service commit flow: users edit in the app, copy `tests.json`, open the GitHub file editor, and commit with their own GitHub account.
- Pull request flow: users edit in the app, copy `tests.json`, open the GitHub file editor, and submit a PR if they do not have write access.
- Authenticated contributor flow: implement GitHub OAuth/device login so each user commits with their own GitHub permissions. This requires GitHub App/OAuth setup and should not use a shared token in the frontend.

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
