-- ============================================================
-- Migration: 20260611000000_fix_lenders_update_with_check
-- ============================================================
-- Fixes soft-delete on lenders. The deployed UPDATE policy's WITH CHECK
-- (inherited from an earlier policy draft) rejected any row whose new value
-- set deleted_at to a non-null timestamp — i.e. the soft delete itself —
-- raising "new row violates row-level security policy for table lenders".
--
-- The intended rule: an owner/manager at the dealership may update any of
-- their lenders, INCLUDING setting deleted_at. Tenant + role are the only
-- gate; visibility (deleted_at IS NULL) belongs to the SELECT policy, not
-- to UPDATE's WITH CHECK.
--
-- We drop and recreate the UPDATE policy with an explicit WITH CHECK that
-- references tenant + role only, so soft-deletes (and future restores) pass.
-- ============================================================

DROP POLICY IF EXISTS "lenders: manager/owner update" ON public.lenders;

CREATE POLICY "lenders: manager/owner update"
ON public.lenders FOR UPDATE TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
)
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
);
