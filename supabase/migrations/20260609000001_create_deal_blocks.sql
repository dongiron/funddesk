-- ============================================================
-- Migration: 20260609000001_create_deal_blocks
-- ============================================================
-- Creates the deal_blocks table for multi-block triage tracking.
-- A deal can have zero, one, or many blocks open simultaneously.
-- Resolved blocks are never deleted — resolved_at is set instead.
-- There is no soft delete (deleted_at) on this table: blocks are
-- permanent records once created, resolved or not.
-- RLS mirrors the role split on deals: finance managers see blocks
-- only on deals they created; managers and owners see all blocks.
-- ============================================================


-- ============================================================
-- Table
-- ============================================================

CREATE TABLE public.deal_blocks (
  id              UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  dealership_id   UUID        NOT NULL REFERENCES public.dealerships (id),
  deal_id         UUID        NOT NULL REFERENCES public.deals (id) ON DELETE CASCADE,

  block_type      TEXT        NOT NULL CHECK (block_type IN (
                                'i_fix_dl',
                                'i_fix_doc',
                                'i_fix_resign',
                                'chase_customer_stip',
                                'chase_customer_signature',
                                'chase_customer_insurance',
                                'chase_welcome_call_escalation',
                                'chase_employment_verification',
                                'chase_overnight_contract',
                                'chase_trade_payoff',
                                'wait_bank',
                                'bank_issue',
                                'lender_hold'
                              )),

  block_detail    TEXT,

  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  opened_by       UUID        NOT NULL REFERENCES auth.users (id),

  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID                 REFERENCES auth.users (id),
  resolution_note TEXT,

  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- resolved_at and resolved_by must both be set or both be null
  CONSTRAINT resolved_consistency CHECK (
    (resolved_at IS NULL AND resolved_by IS NULL)
    OR
    (resolved_at IS NOT NULL AND resolved_by IS NOT NULL)
  ),

  -- resolution cannot be backdated before the block was opened
  CONSTRAINT resolved_after_opened CHECK (
    resolved_at IS NULL OR resolved_at >= opened_at
  )
);

COMMENT ON TABLE public.deal_blocks IS
  'Triage blocks on a deal. Multiple blocks can be open simultaneously. Blocks are resolved by setting resolved_at/resolved_by, never deleted.';

COMMENT ON COLUMN public.deal_blocks.dealership_id IS
  'Tenant scoping column. Denormalized from deals for RLS efficiency.';

COMMENT ON COLUMN public.deal_blocks.deal_id IS
  'The deal this block belongs to. ON DELETE CASCADE means blocks are removed if their parent deal is hard-deleted (which RLS prevents for authenticated users).';

COMMENT ON COLUMN public.deal_blocks.block_type IS
  'Category of block. Prefix indicates owner: i_fix_ = finance manager must act, chase_ = waiting on external party, wait_/bank_/lender_ = waiting on lender.';

COMMENT ON COLUMN public.deal_blocks.block_detail IS
  'Optional free-text detail for this specific instance. e.g. for i_fix_doc: which document is wrong and why.';

COMMENT ON COLUMN public.deal_blocks.opened_at IS
  'Timestamp the block was created. Defaults to NOW(); set explicitly if logging a block that was identified earlier.';

COMMENT ON COLUMN public.deal_blocks.opened_by IS
  'User who created the block record.';

COMMENT ON COLUMN public.deal_blocks.resolved_at IS
  'Timestamp the block was resolved. NULL means the block is still open. Must be set together with resolved_by.';

COMMENT ON COLUMN public.deal_blocks.resolved_by IS
  'User who resolved the block. NULL while block is open. Must be set together with resolved_at.';

COMMENT ON COLUMN public.deal_blocks.resolution_note IS
  'Optional note explaining how the block was resolved. Useful for audit trail and pattern recognition.';


-- ============================================================
-- Indexes
-- ============================================================

-- Full index for joining all blocks on a deal (open and resolved)
CREATE INDEX ON public.deal_blocks (deal_id);

-- Partial index for the common hot query: open blocks on a deal
CREATE INDEX ON public.deal_blocks (deal_id) WHERE resolved_at IS NULL;

-- Tenant-scoped queries (e.g. "all open blocks at this dealership")
CREATE INDEX ON public.deal_blocks (dealership_id);


-- ============================================================
-- updated_at trigger
-- ============================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.deal_blocks
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE public.deal_blocks ENABLE ROW LEVEL SECURITY;


-- ── SELECT ───────────────────────────────────────────────────
-- Finance managers see blocks only on deals they created.
-- Managers and owners see all blocks at their dealership.
-- Joining through deals to check created_by mirrors the deals policy.

CREATE POLICY "deal_blocks: select by role"
ON public.deal_blocks FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = deal_blocks.deal_id
        AND deals.created_by = auth.uid()
    )
  )
);


-- ── INSERT ───────────────────────────────────────────────────
-- Any authenticated user at the dealership may open a block,
-- provided the parent deal belongs to the same dealership.
-- The EXISTS subquery prevents cross-tenant block insertion even
-- if dealership_id is forged in the payload.

CREATE POLICY "deal_blocks: insert own dealership"
ON public.deal_blocks FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
  AND EXISTS (
    SELECT 1 FROM public.deals
    WHERE deals.id = deal_id
      AND deals.dealership_id = public.get_user_dealership_id()
  )
);


-- ── UPDATE ───────────────────────────────────────────────────
-- Same visibility rules as SELECT: you can only resolve blocks
-- you can see. Finance managers can resolve blocks on their own
-- deals; managers and owners can resolve any block at their
-- dealership.

CREATE POLICY "deal_blocks: update by role"
ON public.deal_blocks FOR UPDATE TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR EXISTS (
      SELECT 1 FROM public.deals
      WHERE deals.id = deal_blocks.deal_id
        AND deals.created_by = auth.uid()
    )
  )
);


-- No DELETE policy — blocks are permanent records, resolved via resolved_at.
