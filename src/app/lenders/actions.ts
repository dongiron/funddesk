"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import type { ActionResult, LenderInput } from "./lender-schema"

// Resolve the caller and require an owner/manager role. RLS also enforces this
// on every insert/update, but we check here so finance managers get a clean
// message instead of a silent policy failure. Cookie-session server client only
// — never the service role under app/lenders/.
async function requireManager(): Promise<
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>
      dealershipId: string
    }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." }

  const { data: profile, error } = await supabase
    .from("users")
    .select("dealership_id, role")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single()

  if (error || !profile) return { error: "Could not load your account." }
  if (profile.role !== "owner" && profile.role !== "manager") {
    return { error: "Only owners and managers can manage lenders." }
  }
  return { supabase, dealershipId: profile.dealership_id as string }
}

// Defensive re-normalization (the client already normalized via toLenderInput).
// name is trimmed again per the locked convention; blank numbers stay null
// (not 0/''); stip columns are always arrays for the jsonb CHECK constraint.
function toRow(input: LenderInput) {
  return {
    name: input.name.trim(),
    communication_platform: input.communication_platform?.trim() || null,
    typical_days_clean: input.typical_days_clean ?? null,
    overdue_threshold_days: input.overdue_threshold_days ?? null,
    clears_stips_upfront: !!input.clears_stips_upfront,
    does_welcome_calls: !!input.does_welcome_calls,
    does_employment_verification: !!input.does_employment_verification,
    can_increase_lender_fee: !!input.can_increase_lender_fee,
    accepts_esign: !!input.accepts_esign,
    requires_physical_contract: !!input.requires_physical_contract,
    common_required_stips: input.common_required_stips ?? [],
    commonly_ghosted_stips: input.commonly_ghosted_stips ?? [],
    operator_notes: input.operator_notes?.trim() || null,
  }
}

export async function createLender(input: LenderInput): Promise<ActionResult> {
  const ctx = await requireManager()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const row = toRow(input)
  if (!row.name) return { ok: false, error: "Lender name is required." }

  const { error } = await ctx.supabase
    .from("lenders")
    .insert({ dealership_id: ctx.dealershipId, ...row })

  if (error) {
    console.error("createLender failed:", error)
    if (error.code === "23505") {
      return { ok: false, error: `A lender named "${row.name}" already exists.` }
    }
    return { ok: false, error: "Could not create lender. Please try again." }
  }

  revalidatePath("/lenders")
  return { ok: true }
}

export async function updateLender(
  id: string,
  input: LenderInput
): Promise<ActionResult> {
  const ctx = await requireManager()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const row = toRow(input)
  if (!row.name) return { ok: false, error: "Lender name is required." }

  const { error } = await ctx.supabase
    .from("lenders")
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)

  if (error) {
    console.error("updateLender failed:", error)
    if (error.code === "23505") {
      return { ok: false, error: `A lender named "${row.name}" already exists.` }
    }
    return { ok: false, error: "Could not update lender. Please try again." }
  }

  revalidatePath("/lenders")
  return { ok: true }
}

export async function softDeleteLender(id: string): Promise<ActionResult> {
  const ctx = await requireManager()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  // Soft delete only — set deleted_at, never a hard DELETE (RLS forbids it anyway).
  const { error } = await ctx.supabase
    .from("lenders")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null)

  if (error) {
    console.error("softDeleteLender failed:", error)
    return { ok: false, error: "Could not delete lender. Please try again." }
  }

  revalidatePath("/lenders")
  return { ok: true }
}
