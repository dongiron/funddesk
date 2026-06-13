-- ============================================================
-- Migration 0005: remove deleted_at from SELECT policies
-- (file timestamped to preserve supabase db push ordering)
-- ============================================================
-- Soft-delete via UPDATE was blocked by RLS: PostgreSQL refuses to
-- UPDATE a row into a state the SELECT policy can no longer see. Our
-- SELECT policies filtered `deleted_at IS NULL`, so setting deleted_at
-- to a timestamp produced "new row violates row-level security policy".
--
-- Decision: soft-delete visibility is an application concern, not an RLS
-- concern. RLS continues to enforce tenant (dealership) + role isolation;
-- the app filters out soft-deleted rows via `.is('deleted_at', null)` on
-- every read. We drop `deleted_at IS NULL` from the three SELECT policies
-- and recreate them with all other checks preserved exactly.
--
-- Scope: lenders, deals, users SELECT policies only. INSERT/UPDATE/DELETE
-- policies are unchanged (none reference deleted_at). dealerships has the
-- same pattern but is intentionally left untouched (out of scope).
-- ============================================================


-- ── lenders ──────────────────────────────────────────────────
DROP POLICY IF EXISTS "lenders: select own dealership" ON public.lenders;

CREATE POLICY "lenders: select own dealership"
ON public.lenders FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
);


-- ── users ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "users: select same dealership" ON public.users;

CREATE POLICY "users: select same dealership"
ON public.users FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
);


-- ── deals ────────────────────────────────────────────────────
-- Preserve the finance-manager role split; only the deleted_at term is removed.
DROP POLICY IF EXISTS "deals: select by role" ON public.deals;

CREATE POLICY "deals: select by role"
ON public.deals FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR created_by = auth.uid()
  )
);
