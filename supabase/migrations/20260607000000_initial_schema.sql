-- ============================================================
-- Migration: 20260607000000_initial_schema
-- ============================================================
-- Architectural principles enforced here:
--   1. Multi-tenancy  — every business table has dealership_id
--   2. Soft delete    — every business table has deleted_at
--   3. Timestamps     — created_at / updated_at on every table,
--                       updated_at maintained by trigger
--   4. Append-only    — audit_log has INSERT + SELECT RLS only
--   5. RLS everywhere — database enforces tenancy, not just app
-- ============================================================


-- ============================================================
-- Trigger function (no table dependency — defined first)
-- ============================================================

-- Automatically sets updated_at = NOW() on every UPDATE.
-- Applied via trigger to all tables that have updated_at.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================
-- Tables
-- ============================================================

-- dealerships: one row per tenant
CREATE TABLE public.dealerships (
  id          UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT        NOT NULL,
  deleted_at  TIMESTAMPTZ,
  created_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at  TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- users: extends auth.users with dealership membership and role.
-- NOTE: rows here are created server-side using the service role
-- key after signup — the anon client cannot insert into this table.
CREATE TABLE public.users (
  id            UUID  PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  dealership_id UUID  NOT NULL REFERENCES public.dealerships (id),
  email         TEXT  NOT NULL,
  full_name     TEXT,
  role          TEXT  NOT NULL CHECK (role IN ('owner', 'manager', 'finance_manager')),
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- lenders: financing institutions configured per dealership
CREATE TABLE public.lenders (
  id            UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  dealership_id UUID  NOT NULL REFERENCES public.dealerships (id),
  name          TEXT  NOT NULL,
  deleted_at    TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- deals: core business record — one row per F&I deal.
-- created_by references the finance manager who opened the deal.
-- Additional columns (vehicle, customer PII, financials) will be
-- added in later migrations as features are built.
CREATE TABLE public.deals (
  id                  UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  dealership_id       UUID  NOT NULL REFERENCES public.dealerships (id),
  created_by          UUID  NOT NULL REFERENCES auth.users (id),
  lender_id           UUID  REFERENCES public.lenders (id),
  customer_first_name TEXT,
  customer_last_name  TEXT,
  deleted_at          TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at          TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- audit_log: append-only event record.
-- No updated_at — rows are never modified.
-- No deleted_at  — rows are never removed.
-- RLS allows INSERT and SELECT only (no UPDATE / DELETE policies).
CREATE TABLE public.audit_log (
  id            UUID  DEFAULT gen_random_uuid() PRIMARY KEY,
  dealership_id UUID  NOT NULL REFERENCES public.dealerships (id),
  deal_id       UUID  REFERENCES public.deals (id),
  user_id       UUID  NOT NULL REFERENCES auth.users (id),
  event_type    TEXT  NOT NULL,
  payload       JSONB NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT NOW() NOT NULL
);


-- ============================================================
-- Helper functions (defined after tables they reference)
-- ============================================================

-- Returns the dealership_id of the currently authenticated user.
-- SECURITY DEFINER bypasses RLS when reading public.users,
-- which avoids a circular dependency in policy evaluation.
CREATE OR REPLACE FUNCTION public.get_user_dealership_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dealership_id FROM public.users WHERE id = auth.uid()
$$;

-- Returns the role of the currently authenticated user.
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users WHERE id = auth.uid()
$$;


-- ============================================================
-- Indexes
-- ============================================================

CREATE INDEX ON public.users       (dealership_id);
CREATE INDEX ON public.lenders     (dealership_id);
CREATE INDEX ON public.deals       (dealership_id);
CREATE INDEX ON public.deals       (created_by);
CREATE INDEX ON public.audit_log   (dealership_id);
CREATE INDEX ON public.audit_log   (deal_id);


-- ============================================================
-- updated_at triggers
-- audit_log is intentionally excluded — it is append-only.
-- ============================================================

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.dealerships
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.lenders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- Row-Level Security
-- ============================================================

ALTER TABLE public.dealerships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lenders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log   ENABLE ROW LEVEL SECURITY;


-- ── dealerships ─────────────────────────────────────────────

-- A user can only see their own dealership (not soft-deleted).
CREATE POLICY "dealerships: select own"
ON public.dealerships FOR SELECT TO authenticated
USING (
  id = public.get_user_dealership_id()
  AND deleted_at IS NULL
);

-- Only owners may update dealership settings.
CREATE POLICY "dealerships: owner update"
ON public.dealerships FOR UPDATE TO authenticated
USING (
  id = public.get_user_dealership_id()
  AND public.get_user_role() = 'owner'
);

-- No hard deletes.
CREATE POLICY "dealerships: no delete"
ON public.dealerships FOR DELETE TO authenticated
USING (false);


-- ── users ────────────────────────────────────────────────────

-- All colleagues at the same dealership are visible (not soft-deleted).
CREATE POLICY "users: select same dealership"
ON public.users FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND deleted_at IS NULL
);

-- Only owners and managers may add users.
-- Initial user creation at signup uses the service role key (bypasses RLS).
CREATE POLICY "users: manager/owner insert"
ON public.users FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

-- Only owners and managers may update users.
CREATE POLICY "users: manager/owner update"
ON public.users FOR UPDATE TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

-- No hard deletes — use deleted_at instead.
CREATE POLICY "users: no delete"
ON public.users FOR DELETE TO authenticated
USING (false);


-- ── lenders ──────────────────────────────────────────────────

CREATE POLICY "lenders: select own dealership"
ON public.lenders FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND deleted_at IS NULL
);

CREATE POLICY "lenders: manager/owner insert"
ON public.lenders FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

CREATE POLICY "lenders: manager/owner update"
ON public.lenders FOR UPDATE TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

-- No hard deletes.
CREATE POLICY "lenders: no delete"
ON public.lenders FOR DELETE TO authenticated
USING (false);


-- ── deals ────────────────────────────────────────────────────

-- Finance managers see only their own deals.
-- Managers and owners see all deals at the dealership.
CREATE POLICY "deals: select by role"
ON public.deals FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND deleted_at IS NULL
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR created_by = auth.uid()
  )
);

-- Any authenticated user at the dealership may open a deal.
CREATE POLICY "deals: insert own dealership"
ON public.deals FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
);

-- Finance managers may update their own deals.
-- Managers and owners may update any deal at the dealership.
CREATE POLICY "deals: update by role"
ON public.deals FOR UPDATE TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND (
    public.get_user_role() IN ('owner', 'manager')
    OR created_by = auth.uid()
  )
);

-- No hard deletes.
CREATE POLICY "deals: no delete"
ON public.deals FOR DELETE TO authenticated
USING (false);


-- ── audit_log ────────────────────────────────────────────────

-- Any authenticated user at the dealership may append to the log.
CREATE POLICY "audit_log: insert own dealership"
ON public.audit_log FOR INSERT TO authenticated
WITH CHECK (
  dealership_id = public.get_user_dealership_id()
);

-- Only managers and owners may read the audit log.
CREATE POLICY "audit_log: manager/owner select"
ON public.audit_log FOR SELECT TO authenticated
USING (
  dealership_id = public.get_user_dealership_id()
  AND public.get_user_role() IN ('owner', 'manager')
);

-- No UPDATE or DELETE policies on audit_log — ever.
