# FundDesk — Project Status

## What's Working
- Next.js 16 scaffolding with TypeScript, Tailwind, shadcn/ui
- Supabase Auth (email/password sign-in, sign-up, sign-out)
- Multi-tenant schema with RLS enforced (dealerships, users, lenders, deals, audit_log)
- Migration 0001 applied to funddesk-dev
- First user bootstrapped (owner role)
- Protected dashboard route at /dashboard (placeholder UI)
- Session middleware refreshing auth on every request

## Not Yet Built
- Lender list UI (read/create/edit)
- Deal list / board UI
- Triage state model (will be migration 0002)
- Customer message drafting via Claude API
- Multi-user invitation flow
- Onboarding flow for new dealerships (currently requires SQL bootstrap)

## Open Tech Debt
- First-user-at-new-dealership flow is currently manual SQL bootstrap — design a real onboarding server action before customer #2
- `users` insert policy requires existing owner/manager — chicken-and-egg for new dealerships (same issue as above)

## Next Session Plan
1. Migration 0002: extend `deals` with full state model (pipeline_state, triage_block_state, financial fields, vehicle fields, dates)
2. Migration 0003: extend `lenders` with typical_days_to_fund, overdue_threshold_days, ghost_patterns notes
3. Build lender list UI as first real feature page

## Future Premium Features (Not in Phase One)

These features represent significant value-add beyond the core funding workflow. Each is large enough to justify its own premium tier or per-use pricing. Capture here so they're not forgotten, but do not build until phase one is shipped and validated with paying customers.

**Identity verification at deal creation.** DL scanning with anti-counterfeiting, SSN validation against death index and consistency checks, OFAC screening, optional live selfie-vs-DL face matching for higher-confidence verification. Triggers at signing; re-verify on demand when documents look off. Vendor candidates to evaluate: Intellicheck, Mitek, Persona, Jumio, Veriff, AutoVerify (dealership-specific). Pricing model: per-verification fee passed through, or bundled into premium tier.

**Document authenticity verification.** ML-based detection of digitally altered paystubs, bank statements, and other customer-provided documents. Triggers when stips are uploaded. Distinct from identity verification — focuses on document tampering rather than identity validity. Vendor candidates: Mitek, Persona, Jumio, Inscribe (specializes in financial docs), Ocrolus (specializes in income verification). Same pricing model considerations as above.

**Pricing strategy implication.** These features support a tiered pricing model from day one — "FundDesk Core" at base price with the funding workflow, "FundDesk Pro" or "FundDesk + Verification" at a premium tier with identity + document verification bundled. Plan tier structure during phase one customer conversations; don't commit to specific tier names or prices until we have signal from real prospects.
