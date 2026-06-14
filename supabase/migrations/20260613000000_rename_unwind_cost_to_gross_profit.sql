-- ============================================================
-- Migration 0007: rename deals.unwind_cost -> unwind_gross_profit
-- (timestamped filename, per the locked migration-naming convention)
-- ============================================================
-- The field captures the gross profit LOST on an unwound deal, not a generic
-- cost. The accounting term drives the history view's labels and Don's analysis.
--
-- Postgres rewrites column references in dependent objects (the
-- unwound_state_requires_metadata CHECK, the unwind_cost >= 0 column CHECK,
-- and the COMMENT) automatically when a column is renamed. After applying,
-- verify with \d+ deals that the constraint expressions reference the new name.
-- ============================================================

ALTER TABLE public.deals RENAME COLUMN unwind_cost TO unwind_gross_profit;

COMMENT ON COLUMN public.deals.unwind_gross_profit IS
  'Gross profit lost to the dealership on the unwound deal (lost front/back gross, flooring, recon, etc.). >= 0.';

-- Fallback for older Postgres that does NOT auto-rewrite the named CHECK
-- (Supabase/PG15 does, so this is normally a no-op). Uncomment only if the
-- verification shows unwound_state_requires_metadata still references unwind_cost:
--
-- ALTER TABLE public.deals DROP CONSTRAINT unwound_state_requires_metadata;
-- ALTER TABLE public.deals ADD CONSTRAINT unwound_state_requires_metadata
--   CHECK (
--     pipeline_state <> 'unwound'
--     OR (unwound_date IS NOT NULL
--         AND unwind_reason IS NOT NULL
--         AND unwind_gross_profit IS NOT NULL)
--   );
