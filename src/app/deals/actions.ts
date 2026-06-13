"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  phoenixToday,
  type ActionResult,
  type DealInput,
  type UnwindInput,
} from "./deal-schema"

const DEAL_ROLES = ["owner", "manager", "finance_manager"]

// Resolve the caller. All three roles may mutate deals; RLS enforces row-level
// scope (finance managers only their own). Cookie-session client only — never
// the service role under app/deals/.
async function requireDealActor(): Promise<
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>
      userId: string
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
  if (!DEAL_ROLES.includes(profile.role as string)) {
    return { error: "You don't have permission to perform this action." }
  }
  return { supabase, userId: user.id, dealershipId: profile.dealership_id as string }
}

// Build the DB row from a normalized input. Trade columns are forced null when
// has_trade is false; sold_date falls back to Phoenix-today if it arrived blank.
function toRow(input: DealInput) {
  const trade = input.has_trade
  return {
    customer_first_name: input.customer_first_name.trim(),
    customer_last_name: input.customer_last_name.trim(),
    lender_id: input.lender_id || null,
    pipeline_state: input.pipeline_state,
    vehicle_year: input.vehicle_year,
    vehicle_make: input.vehicle_make,
    vehicle_model: input.vehicle_model,
    vehicle_vin: input.vehicle_vin,
    stock_number: input.stock_number,
    amount_financed: input.amount_financed,
    term_months: input.term_months,
    apr: input.apr,
    monthly_payment: input.monthly_payment,
    front_gross: input.front_gross,
    back_gross: input.back_gross,
    pack: input.pack,
    reserve: input.reserve,
    sold_date: input.sold_date?.trim() || phoenixToday(),
    submitted_to_lender_date: input.submitted_to_lender_date,
    funded_date: input.funded_date,
    physical_contract_mailed_date: input.physical_contract_mailed_date,
    physical_contract_required: input.physical_contract_required,
    stips_required: input.stips_required ?? [],
    stips_received: input.stips_received ?? [],
    has_trade: trade,
    trade_year: trade ? input.trade_year : null,
    trade_make: trade ? input.trade_make : null,
    trade_model: trade ? input.trade_model : null,
    trade_vin: trade ? input.trade_vin : null,
    trade_acv: trade ? input.trade_acv : null,
    trade_allowance: trade ? input.trade_allowance : null,
    trade_payoff_quoted: trade ? input.trade_payoff_quoted : null,
    trade_payoff_lender: trade ? input.trade_payoff_lender : null,
    trade_payoff_sent_date: trade ? input.trade_payoff_sent_date : null,
    trade_payoff_received_date: trade ? input.trade_payoff_received_date : null,
    trade_title_received_date: trade ? input.trade_title_received_date : null,
  }
}

// Map a Postgres/Postgrest error to a short, user-facing message.
function friendly(error: { code?: string } | null): string {
  const code = error?.code
  if (code === "42501") return "You don't have permission to perform this action."
  if (code === "23514") {
    // CHECK violation — most likely a date before sold_date or a negative amount.
    return "Some values failed a validation rule (check that dates aren't before the sold date)."
  }
  if (code === "23503") return "The selected lender no longer exists."
  return "Something went wrong. Please try again."
}

export async function createDeal(input: DealInput): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  if (!input.customer_first_name.trim() || !input.customer_last_name.trim()) {
    return { ok: false, error: "Customer first and last name are required." }
  }
  if (!input.lender_id) return { ok: false, error: "Select a lender." }

  const row = toRow(input)

  const { error } = await ctx.supabase.from("deals").insert({
    dealership_id: ctx.dealershipId,
    created_by: ctx.userId,
    ...row,
  })

  if (error) {
    console.error("createDeal failed:", error)
    return { ok: false, error: friendly(error) }
  }

  revalidatePath("/deals")
  return { ok: true }
}

export async function updateDeal(
  id: string,
  input: DealInput
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  if (!input.lender_id) return { ok: false, error: "Select a lender." }

  const row = toRow(input)

  // .select() lets us detect an RLS-filtered no-op (finance manager editing a
  // deal that isn't theirs returns 0 rows with no error).
  const { data, error } = await ctx.supabase
    .from("deals")
    .update(row)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")

  if (error) {
    console.error("updateDeal failed:", error)
    return { ok: false, error: friendly(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  revalidatePath("/deals")
  return { ok: true }
}

export async function unwindDeal(
  id: string,
  input: UnwindInput
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const reason = input.reason.trim()
  if (!reason) return { ok: false, error: "An unwind reason is required." }
  if (Number.isNaN(input.cost) || input.cost < 0) {
    return { ok: false, error: "Unwind cost must be a non-negative number." }
  }
  const unwoundDate = input.date?.trim() || phoenixToday()

  // The unwound_state_requires_metadata CHECK guarantees integrity at the DB.
  const { data, error } = await ctx.supabase
    .from("deals")
    .update({
      pipeline_state: "unwound",
      unwound_date: unwoundDate,
      unwind_reason: reason,
      unwind_cost: input.cost,
    })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")

  if (error) {
    console.error("unwindDeal failed:", error)
    return { ok: false, error: friendly(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  revalidatePath("/deals")
  return { ok: true }
}
