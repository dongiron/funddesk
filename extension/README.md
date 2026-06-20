# FundDesk Sync

Manifest V3 Chrome extension that reads a deal off a supported site (TaptoSign
today, RouteOne next) and POSTs it to the FundDesk sync endpoint. Self-contained:
its own `package.json` and toolchain, separate from the FundDesk web app. Vercel
never builds this directory.

## Architecture

No declared content script. The popup, on user action, injects a function into
the active tab to read the site's deal data directly — no declared host
permissions for the scraped sites (`activeTab` + the popup click authorizes the
injection). TaptoSign reads a page JS global (MAIN world); RouteOne reads the
DOM (ISOLATED world).

**Multi-scraper pattern.** The popup is thin glue: `detectSite()` inspects the
active tab's host and routes to the matching module under `src/scrapers/`. Each
scraper owns its own site-specific scrape + mapping; the popup never contains
site logic.

- **popup/popup.ts** — token check, `detectSite()`, route to the scraper, render
  the preview, trigger the sync.
- **scrapers/taptosign.ts** — `getScrapedDeal()` runs
  `chrome.scripting.executeScript({ world: "MAIN", func })` to read
  `window.pdfSignData` (TaptoSign's injected deal record) on a `*.taptosign.com`
  tab; `mapScrape()` translates the flat scrape into the nested wire payload
  (`src/shared/types.ts`), splitting the buyer name on the first space.
- **scrapers/routeone.ts** — `getRouteoneScrape()` runs
  `chrome.scripting.executeScript({ world: "ISOLATED", func })` on a
  `*.routeone.net` tab to scrape the **Contract Manager** table, iterating
  `tr.contentOddColor` / `tr.contentEvenColor` rows into a batch of contracts.
  RouteOne is a batch sync (many contracts), matched server-side onto existing
  FundDesk deals — it never creates deals.
- **background/service-worker.ts** — owns all network calls to FundDesk (so they
  bypass page CORS). Handles `SYNC_DEAL`, `SYNC_ROUTEONE`, and `TEST_CONNECTION`.
- **lib/api.ts / lib/storage.ts** — fetch wrapper (per-site `…/api/extensions/
  ${source}/sync` endpoint) + `chrome.storage.local` helpers (token, server URL).

## Setup

```bash
cd extension
npm install
```

If `npm install` complains about the pinned versions, install the latest instead:

```bash
npm i -D vite@latest @crxjs/vite-plugin@beta @types/chrome@latest typescript@latest
```

## Develop

```bash
npm run dev      # Vite dev server with HMR; writes a dev build to dist/
```

## Build

```bash
npm run build    # type-check + production build to extension/dist/
```

## Load in Chrome

1. Visit `chrome://extensions`
2. Enable **Developer mode** (top-right)
3. **Load unpacked** → select `extension/dist/`
4. After a rebuild, click the extension's **reload** icon on that page. (No tab
   reload needed — there's no content script to re-inject; the popup injects on
   demand.)

## Connecting

1. Click the extension icon → **State 1 (connect)**.
2. Generate a token at `http://localhost:3000/settings/extensions`, paste it
   (`fde_…`), set the server URL (default `http://localhost:3000`).
3. **Save & Connect** — Chrome prompts to allow access to that server origin
   (this grants the optional host permission); approve it. The popup then pings
   `/api/extensions/taptosign/health` to confirm the token.

## Iterating the field maps

### TaptoSign

The field names read off `window.pdfSignData` in `scrapeFromMainWorld()`
(`src/scrapers/taptosign.ts`) are best guesses with fallback chains (e.g.
`SalesPrice ?? BottomLineSellPrice ?? VehiclePrice`). To refine after testing:

1. Open DevTools on a real TaptoSign deal page and inspect `window.pdfSignData`
   in the console to see the actual keys.
2. Update the field reads in `scrapeFromMainWorld()` — each is a one-line change.
   If a key maps to a new wire field, also add it to `mapScrape()` and the
   payload type.

The payload shape is in `src/shared/types.ts` and must stay in sync with the Zod
schema in the FundDesk app at `src/app/api/extensions/taptosign/sync/route.ts`.
Several scraped fields (customer email, co-buyer, mileage, sale price, down
payment, sales/finance manager, signed date) are sent and accepted but not yet
persisted server-side — columns come in a follow-up migration.

### RouteOne

`scrapeContractManager()` (`src/scrapers/routeone.ts`) reads the Contract Manager
table by **column position** — the selectors below are best guesses to confirm
against the real DOM:

- Rows: `tr.contentOddColor`, `tr.contentEvenColor`. The view is identified by
  cell count — Contract Manager rows have **12 cells**, Deal Manager **5**; a
  non-12 first row aborts the scrape.
- Cell map (0-based): `[0]` contract date (`MM/DD/YYYY`), `[1]` contract number,
  `[2]` customer `<a>` (its `href` carries `creditAppOID=` → `routeoneDealId`,
  **required**; `img[alt="from Dsp"]` → DSP-originated), `[3]` funding status,
  `[4]` funding lender (+ `a[href*="anchorTextMessages"]` → unread message),
  `[6]` amount financed, `[7]` reserve, `[8]` net proceeds, `[10]` transaction
  type. Money cells strip `$ , whitespace nbsp` → number or `null`.

To refine: open DevTools on Contract Manager, inspect a row's cells, and adjust
the indices / selectors. The server endpoint
(`src/app/api/extensions/routeone/sync/route.ts`) matches each row onto an
existing FundDesk deal by `routeone_deal_id`, then by an unambiguous
`customer_first_name`/`customer_last_name` match — it never creates deals.
