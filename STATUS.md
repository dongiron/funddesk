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

## Not Yet Built
- Lender list UI (read/create/edit)
- Deal list / board UI
- Customer message drafting via Claude API
- Multi-user invitation flow
- Onboarding flow for new dealerships (currently requires SQL bootstrap)

## Open Tech Debt
- First-user-at-new-dealership flow is currently manual SQL bootstrap — design a real onboarding server action before customer #2
- `users` insert policy requires existing owner/manager — chicken-and-egg for new dealerships (same issue as above)

## Next Session Plan
1. Migration 0004: extend `lenders` with typical_days_to_fund, overdue_threshold_days, ghost_patterns notes
2. Build lender list UI as first real feature page

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

## Onboarding Tech Debt

**First-user-at-new-dealership flow.** Current state: manually bootstrap via SQL editor in Supabase dashboard (insert `dealerships` row, then `users` row referencing the new dealership). This works for Don as tenant one but does not scale. Before onboarding customer two, design a proper server action that uses the Supabase service role key to atomically create a new dealership and its initial owner user, triggered by a signup flow that captures dealership name and other onboarding info. Estimate: half-day of work. Must be done before any new dealer can sign up.

**`users` insert policy creates chicken-and-egg.** Current insert policy on `public.users` requires the inserter to already be an owner or manager. Self-signup by a new user with no prior dealership cannot insert. The service-role onboarding flow above bypasses this. Document this dependency clearly in the onboarding code.

## Application-level Conventions

**`sold_date` must be set explicitly from the client's local timezone (America/Phoenix).** Do not rely on the database `CURRENT_DATE` default, which uses UTC and can be off by one day for late-evening Arizona deals. Always compute `sold_date` from the client's local date and pass it explicitly when creating a deal.

**Lender name normalization.** In server actions for creating or updating lenders, always trim whitespace before insert. The database unique constraint on `(dealership_id, name)` is case- and whitespace-sensitive; application-layer normalization prevents accidental duplicates like `"America First"` vs `"America First "`.

**Lender configuration completeness.** `typical_days_clean` and `overdue_threshold_days` are nullable. NULL means "not yet researched/configured." The triage brain should treat lenders with NULL speed columns as "unknown timing" and not generate overdue alerts until they're configured.
