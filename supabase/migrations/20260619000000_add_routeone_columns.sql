-- ============================================================
-- RouteOne Contract Manager sync columns
-- ============================================================
-- Slice 3.2 of the extension integration. The RouteOne scraper batch-syncs
-- Contract Manager rows; these columns hold the funding-pipeline data per deal,
-- matched onto an existing FundDesk deal (RouteOne never auto-creates deals).
-- All routeone_* columns are independent of the taptosign_* columns so a deal
-- can carry data from both sources without one clobbering the other.
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN routeone_deal_id              TEXT,
  ADD COLUMN routeone_contract_number      TEXT,
  ADD COLUMN routeone_funding_lender_name  TEXT,
  ADD COLUMN routeone_funding_status       TEXT,
  ADD COLUMN routeone_has_unread_message   BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN routeone_amount_financed      NUMERIC(12,2),
  ADD COLUMN routeone_reserve_amount       NUMERIC(12,2),
  ADD COLUMN routeone_net_proceeds         NUMERIC(12,2),
  ADD COLUMN routeone_contract_date        DATE,
  ADD COLUMN routeone_is_dsp_originated    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN routeone_last_synced_at       TIMESTAMPTZ;

-- One FundDesk deal per (dealership, RouteOne deal). Partial unique mirrors the
-- taptosign upsert key (active, synced rows only).
CREATE UNIQUE INDEX idx_deals_routeone_deal_id
  ON public.deals (dealership_id, routeone_deal_id)
  WHERE routeone_deal_id IS NOT NULL AND deleted_at IS NULL;

COMMENT ON COLUMN public.deals.routeone_deal_id IS
  'RouteOne creditAppOID; upsert key (with dealership_id) for the RouteOne sync endpoint.';
COMMENT ON COLUMN public.deals.routeone_funding_lender_name IS
  'Raw funding lender text from RouteOne Contract Manager; always stored for provenance even when lender_id is matched.';
