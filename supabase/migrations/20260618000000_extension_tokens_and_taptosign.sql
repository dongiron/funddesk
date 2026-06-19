-- ============================================================
-- Extension tokens + TaptoSign sync plumbing
-- ============================================================
-- Slice 1 of the TaptoSign Chrome extension integration. Adds:
--   1. extension_tokens — per-user API tokens (only the SHA-256 hash is stored)
--   2. deals.taptosign_deal_id — external id for idempotent upsert
--   3. deals.lender_id nullable — synced deals can land before a lender is mapped
--   4. deals.taptosign_lender_name — raw lender text when no FundDesk lender matches
-- ============================================================

-- 1. extension_tokens -----------------------------------------------------------
-- A token is authenticated by SHA-256 hash only; the plaintext is shown once at
-- generation and never persisted. The hash carries a UNIQUE constraint so a
-- collision (or a re-inserted hash) is rejected at the database layer.
CREATE TABLE public.extension_tokens (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  dealership_id  UUID        NOT NULL REFERENCES public.dealerships (id) ON DELETE CASCADE,
  token_hash     TEXT        NOT NULL UNIQUE,
  label          TEXT        NOT NULL DEFAULT 'extension token',
  last_used_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at     TIMESTAMPTZ
);

-- Lookup index for the hot path: validating a token on every sync request.
-- Partial on active tokens so revoked rows don't bloat the index.
CREATE INDEX idx_extension_tokens_hash
  ON public.extension_tokens (token_hash)
  WHERE revoked_at IS NULL;

ALTER TABLE public.extension_tokens ENABLE ROW LEVEL SECURITY;

-- Each user manages only their own tokens. The sync endpoint reads tokens via
-- the service-role client (bypasses RLS), so these policies only govern the
-- user-facing Settings UI.
CREATE POLICY "users see own tokens" ON public.extension_tokens
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "users create own tokens" ON public.extension_tokens
  FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY "users update own tokens" ON public.extension_tokens
  FOR UPDATE USING (user_id = auth.uid());

-- 2. deals.taptosign_deal_id ----------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN taptosign_deal_id TEXT;

-- One FundDesk deal per (dealership, TaptoSign deal). Partial unique so the
-- upsert key only applies to active, synced deals.
CREATE UNIQUE INDEX idx_deals_taptosign_deal_id
  ON public.deals (dealership_id, taptosign_deal_id)
  WHERE taptosign_deal_id IS NOT NULL AND deleted_at IS NULL;

-- 3. deals.lender_id nullable ---------------------------------------------------
-- Synced deals may arrive before the lender is mapped to a FundDesk lender.
ALTER TABLE public.deals
  ALTER COLUMN lender_id DROP NOT NULL;

-- 4. deals.taptosign_lender_name ------------------------------------------------
-- Raw lender text from TaptoSign, retained when no FundDesk lender matches so the
-- operator can see who the deal is with and map it later.
ALTER TABLE public.deals
  ADD COLUMN taptosign_lender_name TEXT;

COMMENT ON COLUMN public.deals.taptosign_deal_id IS
  'External TaptoSign deal id; upsert key (with dealership_id) for the sync endpoint.';
COMMENT ON COLUMN public.deals.taptosign_lender_name IS
  'Raw lender name from TaptoSign when no FundDesk lender matched; NULL once mapped.';
