-- ============================================================
-- Deal events — event-sourced audit trail (Slice 3.8.3)
-- ============================================================
-- Captures dealership-meaningful events across sources (TaptoSign, RouteOne
-- Contract Manager, manual, future CUDL/Gmail). Events drive the funding_status
-- pill (clean/returned/rejected), pipeline auto-advance, and future blocks /
-- notifications. This is NOT message storage — messages are a later slice.

CREATE TABLE public.deal_events (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  dealership_id UUID NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  event_type    TEXT NOT NULL CHECK (event_type IN (
    'signed', 'contract_submitted', 'contract_returned', 'booked', 'funded',
    'manual_note', 'stip_received')),
  source        TEXT NOT NULL CHECK (source IN (
    'taptosign_sync', 'routeone_contract_manager', 'routeone_decision_summary',
    'manual', 'system')),
  event_at      TIMESTAMPTZ NOT NULL,
  description   TEXT,
  metadata      JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES auth.users(id),
  external_id   TEXT
);

CREATE INDEX idx_deal_events_deal_at
  ON public.deal_events(deal_id, event_at DESC);
CREATE INDEX idx_deal_events_dealership_at
  ON public.deal_events(dealership_id, event_at DESC);

-- Idempotency: an external source can't insert the same logical event twice.
-- Manual events (external_id IS NULL) are always allowed.
CREATE UNIQUE INDEX idx_deal_events_dedup
  ON public.deal_events(deal_id, event_type, source, external_id)
  WHERE external_id IS NOT NULL;

-- Derived funding status lives on the deal for cheap list rendering.
ALTER TABLE public.deals
  ADD COLUMN funding_status TEXT
    CHECK (funding_status IS NULL OR funding_status IN ('clean', 'returned', 'rejected')),
  ADD COLUMN funding_status_updated_at TIMESTAMPTZ;

-- ── Row-Level Security ───────────────────────────────────────
ALTER TABLE public.deal_events ENABLE ROW LEVEL SECURITY;

-- SELECT: finance managers see events only on deals they created; owners and
-- managers see all events at their dealership (mirrors deal_blocks).
CREATE POLICY "deal_events: select by role"
ON public.deal_events FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = deal_events.deal_id
        AND deals.created_by = auth.uid()
    )
  )
);

-- INSERT: same-dealership, and the parent deal must belong to the dealership
-- (the EXISTS guard blocks a forged dealership_id). Service-role sync routes
-- bypass RLS entirely and set dealership_id explicitly.
CREATE POLICY "deal_events: insert own dealership"
ON public.deal_events FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
  AND EXISTS (
    SELECT 1 FROM public.deals
    WHERE deals.id = deal_id
      AND deals.dealership_id = public.get_user_dealership_id()
  )
);

-- No UPDATE / DELETE — events are immutable.
