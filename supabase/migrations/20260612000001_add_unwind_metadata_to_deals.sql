-- ============================================================
-- Migration 0006: add unwind metadata to deals
-- (timestamped filename, per the locked migration-naming convention)
-- ============================================================
-- The `unwound` pipeline_state needs structured metadata so an unwind is
-- auditable: when it happened, why, and what it cost. A CHECK constraint
-- guarantees a deal can never sit in `unwound` without all three.
--
-- Pre-check (run before applying): zero existing deals are `unwound` in dev,
-- so the new constraint is satisfiable for all current rows.
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN unwound_date  DATE,
  ADD COLUMN unwind_reason TEXT,
  ADD COLUMN unwind_cost   NUMERIC(12,2) CHECK (unwind_cost >= 0);

COMMENT ON COLUMN public.deals.unwound_date IS
  'Date the deal was unwound. Set together with unwind_reason and unwind_cost when pipeline_state becomes unwound.';

COMMENT ON COLUMN public.deals.unwind_reason IS
  'Free-text reason the deal was unwound (customer backed out, financing fell through, etc.).';

COMMENT ON COLUMN public.deals.unwind_cost IS
  'Dollar cost to the dealership of unwinding (lost gross, flooring, recon, etc.). >= 0.';

-- Unwound state implies all three metadata fields are present.
ALTER TABLE public.deals
  ADD CONSTRAINT unwound_state_requires_metadata
  CHECK (
    pipeline_state <> 'unwound'
    OR (unwound_date IS NOT NULL
        AND unwind_reason IS NOT NULL
        AND unwind_cost IS NOT NULL)
  );
