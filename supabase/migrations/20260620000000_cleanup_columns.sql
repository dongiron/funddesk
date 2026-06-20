-- ============================================================
-- Cleanup columns — deferred fields from earlier extension slices
-- ============================================================
-- Slice 3.2.3. Columns the sync endpoints already scraped/accepted but had
-- nowhere to persist, plus RouteOne funding age + TaptoSign total gross.
-- front_gross / back_gross already exist (migration 20260609000000); only
-- total_gross is new here.
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN routeone_funding_age_days  INTEGER,
  ADD COLUMN customer_email             TEXT,
  ADD COLUMN vehicle_mileage            TEXT,
  ADD COLUMN sale_price                 NUMERIC(12,2),
  ADD COLUMN down_payment               NUMERIC(12,2),
  ADD COLUMN sales_person_name          TEXT,
  ADD COLUMN finance_manager_name       TEXT,
  ADD COLUMN signed_at                  TIMESTAMPTZ,
  ADD COLUMN co_buyer_name              TEXT,
  ADD COLUMN co_buyer_email             TEXT,
  ADD COLUMN co_buyer_signed            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN total_gross                NUMERIC(12,2);

COMMENT ON COLUMN public.deals.routeone_funding_age_days IS
  'Days the contract has been in RouteOne funding (Contract Manager cell 6).';
COMMENT ON COLUMN public.deals.signed_at IS
  'When the buyer signed in TaptoSign (BuyerSignedDate).';
COMMENT ON COLUMN public.deals.total_gross IS
  'Total deal gross from TaptoSign (front + back), when provided.';
