-- ============================================================
-- Cash deal foundation
-- ============================================================
-- Slice 3.8.0. Data model for cash deals: payment method, balance due,
-- funds-cleared tracking, two cash pipeline states, and a funds_uncleared block
-- type. CIT dashboard (3.8.1) and BoS PDF extraction (3.8.2) build on this.
-- ============================================================

-- 1. Cash columns on deals ------------------------------------------------------
ALTER TABLE public.deals
  ADD COLUMN payment_method   TEXT        NOT NULL DEFAULT 'financed'
    CHECK (payment_method IN ('financed', 'cash')),
  ADD COLUMN balance_due      NUMERIC(12,2),
  ADD COLUMN funds_cleared    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN funds_cleared_at TIMESTAMPTZ;

-- 2. Two cash pipeline states. The pipeline_state CHECK is an inline column
--    constraint from migration 0002 (auto-named deals_pipeline_state_check).
--    Drop + recreate with the cash states appended before 'unwound'.
ALTER TABLE public.deals DROP CONSTRAINT deals_pipeline_state_check;
ALTER TABLE public.deals ADD CONSTRAINT deals_pipeline_state_check
  CHECK (pipeline_state IN (
    'signed', 'waiting_for_scan', 'gathering_paperwork', 'gathering_stips',
    'ready_to_send', 'submitted', 'awaiting_physical_delivery', 'waiting_to_fund',
    'funds_in_transit', 'funded', 'awaiting_payment', 'payment_cleared', 'unwound'
  ));

-- 3. funds_uncleared block type (both payment methods). block_type CHECK is
--    inline from migration 0003 (auto-named deal_blocks_block_type_check).
ALTER TABLE public.deal_blocks DROP CONSTRAINT deal_blocks_block_type_check;
ALTER TABLE public.deal_blocks ADD CONSTRAINT deal_blocks_block_type_check
  CHECK (block_type IN (
    'i_fix_dl', 'i_fix_doc', 'i_fix_resign',
    'chase_customer_stip', 'chase_customer_signature', 'chase_customer_insurance',
    'chase_welcome_call_escalation', 'chase_employment_verification',
    'chase_overnight_contract', 'chase_trade_payoff',
    'wait_bank', 'bank_issue', 'lender_hold',
    'funds_uncleared'
  ));

COMMENT ON COLUMN public.deals.payment_method IS
  'financed (default) or cash. Recomputed on every TaptoSign sync from amount_financed + lender presence.';
COMMENT ON COLUMN public.deals.balance_due IS
  'Cash deals: sale_price - down_payment. NULL for financed deals.';
COMMENT ON COLUMN public.deals.funds_cleared IS
  'Cash deals: operator marks true when payment clears; advances pipeline_state to payment_cleared.';
