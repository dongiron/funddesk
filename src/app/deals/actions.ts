"use server"

import { createClient } from "@/lib/supabase/server"
import { revalidatePath } from "next/cache"
import {
  phoenixToday,
  PIPELINE_STATES,
  type ActionResult,
  type DealInput,
  type UnwindInput,
} from "./deal-schema"
import type { AddBlockValues, ResolveBlockValues } from "./block-schema"

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
  if (Number.isNaN(input.grossProfit) || input.grossProfit < 0) {
    return { ok: false, error: "Gross profit lost must be a non-negative number." }
  }
  const unwoundDate = input.date?.trim() || phoenixToday()

  // The unwound_state_requires_metadata CHECK guarantees integrity at the DB.
  const { data, error } = await ctx.supabase
    .from("deals")
    .update({
      pipeline_state: "unwound",
      unwound_date: unwoundDate,
      unwind_reason: reason,
      unwind_gross_profit: input.grossProfit,
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

// Cash deals: toggle funds_cleared and auto-advance the pipeline. Clearing
// stamps funds_cleared_at and advances awaiting_payment → payment_cleared;
// un-clearing reverses both (symmetric undo). Only those two states move — never
// regress from unwound or any financed state.
export async function setFundsCleared(
  id: string,
  cleared: boolean
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const { data: current, error: readErr } = await ctx.supabase
    .from("deals")
    .select("pipeline_state")
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle()
  if (readErr) {
    console.error("setFundsCleared read failed:", readErr)
    return { ok: false, error: friendly(readErr) }
  }
  if (!current) {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  const state = current.pipeline_state as string
  const update: Record<string, unknown> = {
    funds_cleared: cleared,
    funds_cleared_at: cleared ? new Date().toISOString() : null,
  }
  if (cleared && state === "awaiting_payment") update.pipeline_state = "payment_cleared"
  if (!cleared && state === "payment_cleared") update.pipeline_state = "awaiting_payment"

  const { data, error } = await ctx.supabase
    .from("deals")
    .update(update)
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")

  if (error) {
    console.error("setFundsCleared failed:", error)
    return { ok: false, error: friendly(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  revalidatePath("/deals")
  revalidatePath("/")
  return { ok: true }
}

// Move a deal's pipeline_state directly (used by the immediate-write pipeline
// control, incl. read-only/history views — D-history-editing). 'unwound' is
// excluded: it requires metadata and goes through the unwind dialog.
export async function setPipelineState(
  id: string,
  state: string
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  if (!(PIPELINE_STATES as readonly string[]).includes(state)) {
    return { ok: false, error: "Invalid pipeline state." }
  }
  if (state === "unwound") {
    return { ok: false, error: "Use the Unwind action to unwind a deal." }
  }

  const { data, error } = await ctx.supabase
    .from("deals")
    .update({ pipeline_state: state })
    .eq("id", id)
    .is("deleted_at", null)
    .select("id")

  if (error) {
    console.error("setPipelineState failed:", error)
    return { ok: false, error: friendly(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "You don't have permission to perform this action." }
  }

  revalidatePath("/deals")
  revalidatePath("/deals/history")
  revalidatePath("/")
  return { ok: true }
}

// ── Deal blocks ──────────────────────────────────────────────────────────────
// Blocks are immutable after creation; resolution is the only mutation.
// opened_by / resolved_by / dealership_id are ALWAYS set from the auth context,
// never from the client payload.

export async function createBlock(
  dealId: string,
  values: AddBlockValues
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const detail = values.block_detail.trim()

  const { error } = await ctx.supabase.from("deal_blocks").insert({
    dealership_id: ctx.dealershipId,
    deal_id: dealId,
    block_type: values.block_type,
    block_detail: detail || null,
    opened_by: ctx.userId,
  })

  if (error) {
    console.error("createBlock failed:", error)
    if (error.code === "42501") {
      return {
        ok: false,
        error: "You don't have permission to add a block to this deal.",
      }
    }
    return { ok: false, error: "Could not add the block. Please try again." }
  }

  revalidatePath("/deals")
  return { ok: true }
}

export async function resolveBlock(
  blockId: string,
  values: ResolveBlockValues
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const note = values.resolution_note.trim()

  // Only resolve a still-open block. resolved_at + resolved_by are set together
  // (resolved_consistency CHECK). RLS enforces tenant + role on the row.
  const { data, error } = await ctx.supabase
    .from("deal_blocks")
    .update({
      resolved_at: new Date().toISOString(),
      resolved_by: ctx.userId,
      resolution_note: note || null,
    })
    .eq("id", blockId)
    .is("resolved_at", null)
    .select("id")

  if (error) {
    console.error("resolveBlock failed:", error)
    return { ok: false, error: friendly(error) }
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "Could not resolve this block. It may already be resolved.",
    }
  }

  revalidatePath("/deals")
  return { ok: true }
}

// ── Deal stips ───────────────────────────────────────────────────────────────
// Persists the stip checklist (JSONB arrays). DB shape unchanged.
export async function updateDealStips(
  dealId: string,
  input: { stips_required: string[]; stips_received: string[] }
): Promise<ActionResult> {
  const ctx = await requireDealActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const clean = (arr: string[]) =>
    (arr ?? []).map((s) => s.trim()).filter((s) => s.length > 0)
  const stips_required = clean(input.stips_required)
  const stips_received = clean(input.stips_received)

  const { data, error } = await ctx.supabase
    .from("deals")
    .update({ stips_required, stips_received })
    .eq("id", dealId)
    .is("deleted_at", null)
    .select("id")

  if (error) {
    console.error("updateDealStips failed:", error)
    return { ok: false, error: friendly(error) }
  }
  if (!data || data.length === 0) {
    return {
      ok: false,
      error: "You don't have permission to update this deal.",
    }
  }

  revalidatePath("/deals")
  revalidatePath("/") // refresh triage dashboard chips + missing-stips count
  return { ok: true }
}
