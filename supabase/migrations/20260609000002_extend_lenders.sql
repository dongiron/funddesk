-- ============================================================
-- Migration: 20260609000002_extend_lenders
-- ============================================================
-- Extends lenders with bank-speed, behavior, and operational
-- metadata columns captured from real lender research.
-- RLS: no policy changes — new columns inherit existing policies.
-- ============================================================


-- ============================================================
-- lenders — bank-speed columns
-- ============================================================

ALTER TABLE public.lenders
  ADD COLUMN typical_days_clean           INTEGER,
  ADD COLUMN typical_days_blocked_max     INTEGER,
  ADD COLUMN overdue_threshold_days       INTEGER,
  ADD COLUMN days_to_bank_after_funding   INTEGER     NOT NULL DEFAULT 1;

COMMENT ON COLUMN public.lenders.typical_days_clean IS
  'Typical number of days from deal submission to funding when there are no issues. NULL means not yet configured for this lender — the UI should display this as empty and prompt the operator to configure it from the lender list document.';

COMMENT ON COLUMN public.lenders.typical_days_blocked_max IS
  'Maximum observed funding days when issues exist (stips, holds, etc.). NULL means indeterminate — this lender can hold indefinitely when blocked. Used to set urgency expectations.';

COMMENT ON COLUMN public.lenders.overdue_threshold_days IS
  'Days since submission after which the application flags this deal as abnormally slow for this lender. NULL means not yet configured — the UI should display this as empty and prompt the operator to configure it. When NULL, the application cannot compute overdue status for deals at this lender.';

COMMENT ON COLUMN public.lenders.days_to_bank_after_funding IS
  'Business days between lender marking the deal funded and money arriving in the dealership operating account. Typically 1 for ACH; used for cash-flow visibility.';


-- ============================================================
-- lenders — behavior flags
-- ============================================================

ALTER TABLE public.lenders
  ADD COLUMN clears_stips_upfront          BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN does_welcome_calls            BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN does_employment_verification  BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN can_increase_lender_fee       BOOLEAN     NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lenders.clears_stips_upfront IS
  'True when this lender reviews and clears stips before contract submission rather than after. Affects the ordering of pipeline steps in the UI.';

COMMENT ON COLUMN public.lenders.does_welcome_calls IS
  'True when this lender typically calls the customer to verify deal details before funding. When true, chase_welcome_call_escalation block type is relevant for this lender.';

COMMENT ON COLUMN public.lenders.does_employment_verification IS
  'True when this lender typically verifies the customer''s employment independently. When true, chase_employment_verification block type is relevant for this lender.';

COMMENT ON COLUMN public.lenders.can_increase_lender_fee IS
  'True when this lender adjusts their fee during funding to correct discrepancies (e.g., rate changes, rebooking). When true, the funded amount may differ slightly from the submitted amount.';


-- ============================================================
-- lenders — title and contract
-- ============================================================

ALTER TABLE public.lenders
  ADD COLUMN floating_title_limit        INTEGER,
  ADD COLUMN accepts_esign               BOOLEAN     NOT NULL DEFAULT true,
  ADD COLUMN requires_physical_contract  BOOLEAN     NOT NULL DEFAULT false;

COMMENT ON COLUMN public.lenders.floating_title_limit IS
  'Maximum number of deals this lender allows with outstanding (unperfected) titles simultaneously. NULL means no enforced limit. e.g. Westlake has a limit of 8. Exceeding this triggers a title chase.';

COMMENT ON COLUMN public.lenders.accepts_esign IS
  'True when this lender accepts electronically signed contracts. Most modern lenders do.';

COMMENT ON COLUMN public.lenders.requires_physical_contract IS
  'True when this lender requires a wet-ink contract mailed in even when e-sign is technically available. Drives physical_contract_required default on new deals with this lender.';


-- ============================================================
-- lenders — communication
-- ============================================================

ALTER TABLE public.lenders
  ADD COLUMN communication_platform  TEXT;

COMMENT ON COLUMN public.lenders.communication_platform IS
  'Free-text description of how deals are submitted and tracked with this lender. e.g. "CUDL", "DealerCenter via RouteOne", "Direct dealer portal at lendername.com".';


-- ============================================================
-- lenders — stip intelligence
-- ============================================================

ALTER TABLE public.lenders
  ADD COLUMN common_required_stips   JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN commonly_ghosted_stips  JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD CONSTRAINT common_required_stips_is_array  CHECK (jsonb_typeof(common_required_stips)  = 'array'),
  ADD CONSTRAINT commonly_ghosted_stips_is_array CHECK (jsonb_typeof(commonly_ghosted_stips) = 'array');

COMMENT ON COLUMN public.lenders.common_required_stips IS
  'Array of stip type strings this lender typically requires. e.g. ["paystub","proof_of_residence","insurance"]. Pre-populates stips_required when this lender is selected on a new deal.';

COMMENT ON COLUMN public.lenders.commonly_ghosted_stips IS
  'Array of stip type strings this lender''s customers tend to delay returning. Used by the triage brain to prioritize chase messages for high-ghost stips first.';


-- ============================================================
-- lenders — operator notes
-- ============================================================

ALTER TABLE public.lenders
  ADD COLUMN operator_notes  TEXT;

COMMENT ON COLUMN public.lenders.operator_notes IS
  'Markdown-friendly free-text catch-all for operational knowledge that does not fit structured columns. e.g. known quirks, escalation contacts, funding window hours, holiday behavior.';


-- ============================================================
-- Unique constraint — no duplicate active lender names
-- ============================================================
-- Partial unique index: applies only to non-deleted rows.
-- Soft-deleted lenders with the same name are allowed (historical).

CREATE UNIQUE INDEX lenders_dealership_name_unique
  ON public.lenders (dealership_id, name)
  WHERE deleted_at IS NULL;
