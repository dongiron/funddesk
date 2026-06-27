-- ============================================================
-- Lender messages — RouteOne text-message capture (Slice 3.8.4a)
-- ============================================================
-- Per-deal lender messages scraped from the RouteOne "View Related Text
-- Messages" modal, powering the Triage Notification Center. No native message
-- IDs exist, so duplicates are caught by a content hash unique per deal.

CREATE TABLE public.lender_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id             UUID NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  dealership_id       UUID NOT NULL REFERENCES public.dealerships(id) ON DELETE CASCADE,
  sender_name         TEXT NOT NULL,
  subject             TEXT,
  body                TEXT NOT NULL,
  received_at         TIMESTAMPTZ NOT NULL,
  routeone_app_number TEXT,
  content_hash        TEXT NOT NULL,
  read_at             TIMESTAMPTZ,
  read_by             UUID REFERENCES auth.users(id),
  completed_at        TIMESTAMPTZ,
  completed_by        UUID REFERENCES auth.users(id),
  scraped_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (deal_id, content_hash)
);

CREATE INDEX idx_lender_messages_dealership_received
  ON public.lender_messages(dealership_id, received_at DESC);
CREATE INDEX idx_lender_messages_unread
  ON public.lender_messages(dealership_id, received_at DESC)
  WHERE read_at IS NULL;
CREATE INDEX idx_lender_messages_deal
  ON public.lender_messages(deal_id, received_at DESC);

ALTER TABLE public.lender_messages ENABLE ROW LEVEL SECURITY;

-- SELECT: finance managers see messages only on deals they created; owners and
-- managers see all at their dealership (mirrors deal_events / deal_blocks).
CREATE POLICY "lender_messages: select by role"
ON public.lender_messages FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = lender_messages.deal_id
        AND deals.created_by = auth.uid()
    )
  )
);

-- INSERT: same-dealership, parent deal must belong to the dealership (the EXISTS
-- guard blocks a forged dealership_id). Service-role sync route bypasses RLS.
CREATE POLICY "lender_messages: insert own dealership"
ON public.lender_messages FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
  AND EXISTS (
    SELECT 1 FROM public.deals
    WHERE deals.id = deal_id
      AND deals.dealership_id = public.get_user_dealership_id()
  )
);

-- UPDATE: read/complete toggles only, under the same ownership gate as SELECT
-- (a finance manager can't mark another FM's deal's messages).
CREATE POLICY "lender_messages: update read/complete"
ON public.lender_messages FOR UPDATE TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = lender_messages.deal_id
        AND deals.created_by = auth.uid()
    )
  )
)
WITH CHECK (dealership_id = public.get_user_dealership_id());

-- No DELETE — messages are a permanent record.
