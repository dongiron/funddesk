# FundDesk — Project Status

## What's Working
- Next.js 16 scaffolding with TypeScript, Tailwind, shadcn/ui
- Supabase Auth (email/password sign-in, sign-up, sign-out)
- Multi-tenant schema with RLS enforced (dealerships, users, lenders, deals, audit_log, deal_blocks)
- Migration 0001 applied to funddesk-dev — initial schema (5 tables, RLS, triggers)
- Migration 0002 applied to funddesk-dev — dealership signing config, pipeline state, vehicle/financial/date/trade fields
- Migration 0003 applied to funddesk-dev — deal_blocks (multi-block triage, verified with test open + resolution)
- First user bootstrapped (owner role)
- Protected dashboard route at /dashboard (placeholder UI)
- Session middleware refreshing auth on every request

## TaptoSign Extension Integration
- **Slice 1 — extension plumbing (FundDesk side): COMPLETE.** Per-user API tokens (SHA-256 hashed, shown once) managed at `/settings/extensions`; `POST /api/extensions/taptosign/sync` (service-role client + explicit `dealership_id` filter on every query) upserting deals by `(dealership_id, taptosign_deal_id)`; case-insensitive lender-name matching; null-lender UI handling. Migration `20260618000000` added `extension_tokens`, `deals.taptosign_deal_id`, nullable `deals.lender_id`, and `deals.taptosign_lender_name`.
- **Slice 2 — TaptoSign Chrome extension: COMPLETE.** MV3 extension in `extension/` (separate toolchain, Vite + @crxjs; excluded from the Next.js build). Pivoted to **MAIN-world script injection**: the popup triggers `chrome.scripting.executeScript({ world: "MAIN" })` on a user gesture (popup open) and reads TaptoSign's internal `window.pdfSignData` directly — no declared `content_scripts`, no declared host permission for taptosign.com (`activeTab` + gesture handles access). `GET /api/extensions/taptosign/health` added for token verification. Field map covers customer, vehicle, finance, lender, signing status, and sales team, with fallback chains for fields that have multiple TaptoSign candidates.

### Deferred from Slice 2
- **Follow-up migration — add columns to `deals`:** `customer_email`, `vehicle_mileage`, `sale_price`, `down_payment`, `sales_person_name`, `finance_manager_name`, `signed_at`, `co_buyer_name`, `co_buyer_email`, `co_buyer_signed`. These are already scraped and accepted as optional by the sync endpoint's Zod schema, but not persisted (no column yet) — they're silently dropped until the migration lands.
- **Null-skip-on-update upsert logic.** The sync upsert currently overwrites mapped columns with `null` when a field is absent from a partial sync. Add null-skip so a later partial sync (or an early-stage deal) can't wipe data a fuller earlier sync — or the operator — already set.
- **Field-mapping iteration from real-world TaptoSign deals.** Refine `scrapeFromMainWorld` fallback priority order, date parsing (`saleDate` format isn't pinned by TaptoSign), and lender-name normalization based on observed real deal pages.

## Not Yet Built
- Lender list UI (read/create/edit)
- Deal list / board UI
- Customer message drafting via Claude API
- Multi-user invitation flow
- Onboarding flow for new dealerships (currently requires SQL bootstrap)

## Open Tech Debt
- First-user-at-new-dealership flow is currently manual SQL bootstrap — design a real onboarding server action before customer #2
- `users` insert policy requires existing owner/manager — chicken-and-egg for new dealerships (same issue as above)

## Parked Items
- `unwind_gross_profit`: relax the `>= 0` CHECK to allow negatives, change semantics to **positive = recovered / negative = additional loss**. Requires a migration + updating the unwind dialog label/validation. Parked during the design overhaul (commit 3) — the field stays non-negative ("gross profit lost") for now.
- **MoveMetal-gap items (deferred until after Slice 3):**
  - Stip expiration tracking
  - Document storage
  - Audit log wiring
  - Document status nuance
  - AI document parsing
  - Compliance positioning
- **TaptoSign PDF extraction (Slice 3.7) — deploy/prod follow-ups:**
  - **Vercel production body limit** — the ~4.5MB serverless function request cap will reject ~10MB base64 PDFs in prod (works on localhost/dev). Resolve before deploy: `vercel.json` config bump, Supabase Storage staging, or the Anthropic Files API upload path.
  - **`ANTHROPIC_API_KEY` missing in Vercel env** — add when deploying (only in local `.env.local` today).
  - **`proxy.ts` middleware deprecation** — Next 16 warns on the `middleware.ts` convention; rename `src/middleware.ts` → `src/proxy.ts` (cosmetic, not blocking).
  - **PDF hash caching** — a re-synced deal re-extracts and re-bills the Anthropic call; add a cache key on the PDF hash to skip unchanged PDFs (deferred per the Slice 3.7 plan).
  - **`PdfUrlCompressed` empty on signed deals** — TaptoSign reality, not a bug; the `Base64Pdf → PdfUrlCompressed → SignedPdf → PdfUrl` priority chain falls through correctly.

## Completed since last STATUS.md update (f9c0dc5)
- **3.1 — Extension multi-scraper refactor.** Generalized the extension to host multiple site scrapers (TaptoSign + RouteOne) behind a shared structure.
- **3.2 — RouteOne Contract Manager scraper + sync endpoint.** ISOLATED-world DOM scrape of the RouteOne Contract Manager; `POST /api/extensions/routeone/sync` batch-matches each contract onto an existing FundDesk deal (by `routeone_deal_id`, then fuzzy customer name). RouteOne never creates deals.
- **3.2.1 — RouteOne funding panel + list status indicator.** Per-deal funding panel and a funding-status chip on the deals list.
- **3.2.2 — Shared fuzzy lender matching + RouteOne canonical writes.** `src/lib/lender-match.ts` (`matchLenderByName`, normalized exact then bidirectional prefix, ambiguous→unmatched); RouteOne owns the funded amount + funding lender + pipeline advance (authoritative, not null-skip).
- **3.2.3 — Cleanup migration + null-skip + gross/age scrapes.** `20260620000000_cleanup_columns.sql` (adds `signed_at` and more); `setIfPresent` null-skip writer so partial re-syncs don't wipe data; gross/funding-age scrapes.
- **3.7 — TaptoSign RIC PDF extraction via Claude API.** `POST /api/extensions/taptosign/pdf-extract` extracts signed-contract fields from the PDF via `claude-sonnet-4-6` (base64 document block, raw JSON-schema structured output validated with zod).
- **3.8.0 — Cash deal workflow.** `payment_method` + `balance_due` + funds-clearing tracking; `CashPanel` UI; `awaiting_payment` / `payment_cleared` pipeline states; `funds_uncleared` block type; cash detection at sync time via composite financed-signals. Migration `20260620000001_cash_deals.sql`.
- **3.8.1 — CIT section on Triage + /deals drill-down filters.** Full-width "Contracts in transit" section (avg-age / overdue-15+ / critical-30+ cards, aging-bucket table, by-lender breakdown with synthetic Cash-deals row); client-side URL filters on `/deals` (`aging`, `lender_id`, `payment_method`) with removable chips; `revalidatePath("/")`/`"/deals"` in both sync routes. Shared aging helpers in `deal-schema.ts`.
- **3.8.1.1 — Cash check precedence in CIT bucketing.** `payment_method === "cash"` is tested before the `lender_id` branch so cash deals (legitimately `lender_id=null`) route to the Cash-deals row, not the unmapped-lender bucket. (Already in place; confirmed.)
- **3.8.1.2 — Sticky `payment_method` on TaptoSign re-sync.** When no positive financed signal is present, preserve the deal's existing classification instead of regressing to cash — fixes financed→cash flips on CUDL credit-union deals that return a null TaptoSign `AssignToLender`.
- **3.8.2 — BoS PDF extraction.** Authoritative `payment_method` from the Bill of Sale RISC-vs-Cash checkbox (`/api/extensions/taptosign/bos-extract`); RouteOne-provenance guard; pipeline reconcile on flip; `customer_business_name` + `outside_lender_name` columns; shared `displayName()`.
- **3.8.3 (+.1/.2/.3/.4) — Event-sourced deal audit trail.** `deal_events` table + `funding_status` pill; events from TaptoSign (signed), RouteOne Contract Manager (submitted/returned), and RouteOne Decision Summary (booked/funded); new `/decision-summary` endpoint; `scrapeDecisionSummary` (DS scraper + the four selector/extraction fixes); manual events + timeline section.
- **3.8.4a — Lender messages Notification Center.** `lender_messages` table (content-hash dedup, ownership-gated RLS); `/api/extensions/routeone/messages` endpoint; message capture folded into the DS scrape; full-width Notification Center below CIT (unread badge, all/unread/completed filters, row→`/deals?dealId=` deep link, mark read/complete). **Manual refresh only — no background polling.**

Shipped in commits up to `f35c236` (3.8.3); 3.8.4a pending this commit.

### Migrations — all applied to funddesk-dev as of 3.8.4a
`20260620000000_cleanup_columns` (signed_at), `20260620000001_cash_deals`, `20260622000000_bos_columns`, `20260623000000_deal_events`, `20260626000000_lender_messages`, plus the cash backfill + the one-time CM booked/funded `deal_events` cleanup. A fresh checkout pointed at a new database must apply all of these (DDL is run manually by Don in the Supabase SQL editor).

## Next
**Slice 3.8.4b — Background message polling.** Promote 4a's manual refresh to automatic capture: `chrome.alarms` (5-min default, user-configurable off/5/15), a **granted host permission for `*://*.routeone.net/*`** (4a deliberately avoided this — manual scrape uses `activeTab` + the popup gesture), a multi-deal navigation strategy (open each flagged deal's Decision Summary), session-expiry detection (login-page selectors → stop + notify), and an extension settings page. Note: **4a's Notification Center "Refresh" is `router.refresh()` (re-pull from DB), NOT a live scrape** — live scrape requires the active tab to be RouteOne, which is exactly what 4b's host permission + polling enable.

## Upcoming
- **3.8.5 — Keyword detection / auto-block creation** from message content (deferred from 3.8.4 per D-pipeline-effects).
- **3.9 — Notifications panel polish.** Side-by-side CIT/Notification-Center split (4a is stacked full-width) with a proper responsive pass; message archive page (the deferred "view all messages →").

## Deferred / Known Issues
- **CUDL integration** — parallel to RouteOne for credit-union financing. The 3.8.1.2 composite-signal logic already accommodates it via `existingHasLender`; wire CUDL provenance into `hasFinancedSignals` when it ships.
- **Vercel production body limit — IN PROGRESS (Slice 3.9.1).** Vercel's 4.5MB serverless request-body cap is fixed/non-configurable, so the extraction endpoints now use **Supabase Storage staging**: the extension uploads the PDF directly to a private `deal-pdfs` bucket via a signed upload URL (`/api/extensions/taptosign/pdf-upload-url`), then calls bos-extract/pdf-extract with the storage path; the routes download server-side. Shipped code; **not yet verified in production** — pending (a) Don creating the `deal-pdfs` bucket in Supabase, and (b) a real Frazer sync confirming 200 instead of 413. Mark **resolved** once that passes. Possible follow-up: Supabase Storage CORS may need to allow the extension origin for the direct upload.
- **`proxy.ts` middleware deprecation** — Next 16 cosmetic warning; rename `src/middleware.ts` → `src/proxy.ts`.
- **Manual `payment_method` override UI** — revisit only if 3.8.2 BoS extraction proves insufficient for edge cases.
- **PDF hash caching** — cache on PDF hash so a re-synced deal doesn't re-extract and re-bill the Anthropic call.

## Future Premium Features (Not in Phase One)

These features represent significant value-add beyond the core funding workflow. Each is large enough to justify its own premium tier or per-use pricing. Capture here so they're not forgotten, but do not build until phase one is shipped and validated with paying customers.

**Identity verification at deal creation.** DL scanning with anti-counterfeiting, SSN validation against death index and consistency checks, OFAC screening, optional live selfie-vs-DL face matching for higher-confidence verification. Triggers at signing; re-verify on demand when documents look off. Vendor candidates to evaluate: Intellicheck, Mitek, Persona, Jumio, Veriff, AutoVerify (dealership-specific). Pricing model: per-verification fee passed through, or bundled into premium tier.

**Document authenticity verification.** ML-based detection of digitally altered paystubs, bank statements, and other customer-provided documents. Triggers when stips are uploaded. Distinct from identity verification — focuses on document tampering rather than identity validity. Vendor candidates: Mitek, Persona, Jumio, Inscribe (specializes in financial docs), Ocrolus (specializes in income verification). Same pricing model considerations as above.

**Pricing strategy implication.** These features support a tiered pricing model from day one — "FundDesk Core" at base price with the funding workflow, "FundDesk Pro" or "FundDesk + Verification" at a premium tier with identity + document verification bundled. Plan tier structure during phase one customer conversations; don't commit to specific tier names or prices until we have signal from real prospects.

## Architecture Decisions Log

Significant architectural decisions made during the build, with rationale. Add to this list whenever a decision is made that future-Don or a future engineer might need to understand the reasoning behind.

**Decision: Multi-tenancy via row-level security on every business table.** RLS policies enforce tenant isolation at the database layer rather than only at the application layer. Cost: more complex policy writing. Benefit: tenant data isolation cannot be bypassed by an application bug. Decided at migration 0001.

**Decision: Soft delete with `deleted_at` on all business tables.** Hard deletes prohibited by RLS policies returning silent failure. Cost: every query must filter `deleted_at IS NULL`. Benefit: right-to-delete, undo-ability, audit-trail preservation. Decided at migration 0001.

**Decision: Append-only audit log.** No UPDATE or DELETE policies on `audit_log`. Rows are insert-only forever. Benefit: tamper-evident audit trail, compliance asset, legal defense in disputes. Decided at migration 0001.

**Decision: Multiple simultaneous deal blocks via separate `deal_blocks` table (not a single `current_block` column on deals).** Subprime deals routinely have multiple things wrong simultaneously; single-block model loses information. Cost: more complex queries. Benefit: accurate operational reality. Decided at migration 0003.

**Decision: Signing method (e-sign vs paper) as dealership-level configuration, not per-deal.** Dealerships don't switch methods deal-by-deal. Cost: rare edge case where a dealer occasionally does both (`mixed` value handles this). Benefit: cleaner per-deal workflow. Decided at migration 0002.

**Decision: Lender holds tracked as block type, not pipeline state.** A lender hold doesn't change the deal's pipeline position (the deal is still funded-in-transit); it's an exception condition that gets resolved. Cost: requires inspecting blocks to know "is this deal actually clear?" Benefit: holds tied to specific reasons, multiple deals can share a root cause. Decided during migration 0002 design.

**Decision: Soft-delete visibility enforced at the application layer, not RLS.** The original design put `deleted_at IS NULL` in every SELECT policy. This silently broke soft-delete: Postgres rejects an `UPDATE` that moves a row out of its SELECT policy's visibility ("new row violates row-level security policy for table …"), so setting `deleted_at` to a timestamp always failed — inserts and edits worked, deletes didn't. Fix (migration `20260612000000`, conceptually 0005): drop `deleted_at IS NULL` from the `lenders`, `deals`, and `users` SELECT policies while keeping all tenant/role checks. RLS still owns tenant + role isolation; hiding soft-deleted rows is now the app's job via `.is('deleted_at', null)` on every read. Cost: a query that forgets the filter will surface deleted rows (mitigation: add a shared query helper once more soft-deletable tables appear). Benefit: soft-delete actually works. `dealerships` still carries the old pattern but is out of scope until it's ever soft-deleted. Decided at migration 0005.

## Onboarding Tech Debt

**First-user-at-new-dealership flow.** Current state: manually bootstrap via SQL editor in Supabase dashboard (insert `dealerships` row, then `users` row referencing the new dealership). This works for Don as tenant one but does not scale. Before onboarding customer two, design a proper server action that uses the Supabase service role key to atomically create a new dealership and its initial owner user, triggered by a signup flow that captures dealership name and other onboarding info. Estimate: half-day of work. Must be done before any new dealer can sign up.

**`users` insert policy creates chicken-and-egg.** Current insert policy on `public.users` requires the inserter to already be an owner or manager. Self-signup by a new user with no prior dealership cannot insert. The service-role onboarding flow above bypasses this. Document this dependency clearly in the onboarding code.

## Application-level Conventions

**`sold_date` must be set explicitly from the client's local timezone (America/Phoenix).** Do not rely on the database `CURRENT_DATE` default, which uses UTC and can be off by one day for late-evening Arizona deals. Always compute `sold_date` from the client's local date and pass it explicitly when creating a deal.

**Lender name normalization.** In server actions for creating or updating lenders, always trim whitespace before insert. The database unique constraint on `(dealership_id, name)` is case- and whitespace-sensitive; application-layer normalization prevents accidental duplicates like `"America First"` vs `"America First "`.

**Lender configuration completeness.** `typical_days_clean` and `overdue_threshold_days` are nullable. NULL means "not yet researched/configured." The triage brain should treat lenders with NULL speed columns as "unknown timing" and not generate overdue alerts until they're configured.

**Soft-delete filtering is the app's responsibility.** RLS no longer filters `deleted_at` (see the soft-delete decision above). Every read of a soft-deletable table (`lenders`, `deals`, `users`, …) MUST include `.is('deleted_at', null)`. UPDATE guards that target only active rows should also include it (e.g. don't edit/re-delete an already-deleted row). When a second/third soft-deletable table's queries proliferate, introduce a shared query helper so the filter can't be forgotten.

**Migration file naming.** Migration files use timestamp prefixes `YYYYMMDDHHMMSS_description.sql` (e.g. `20260612000000_remove_deleted_at_from_select_policies.sql`); `supabase db push` applies them in lexicographic order. Do NOT use sequential numeric prefixes like `0005_` — they sort before the timestamped files and break apply order. "Migration NNNN" is a conceptual label only; the file is always named by timestamp.
