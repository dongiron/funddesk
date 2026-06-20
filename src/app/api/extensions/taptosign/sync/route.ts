// ============================================================
// POST /api/extensions/taptosign/sync
// ============================================================
// External endpoint for the TaptoSign Chrome extension. Authenticated by a
// per-user extension token (Authorization: Bearer fde_...), NOT a Supabase Auth
// session.
//
// SECURITY INVARIANT — this route uses the service-role client, which BYPASSES
// Row-Level Security. Tenant isolation therefore depends entirely on this code:
// EVERY query below MUST filter by the `dealershipId` resolved from the validated
// token. Never derive tenant scope from the request body.
// ============================================================

import { NextResponse } from "next/server"
import { z } from "zod"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { matchLenderByName, type LenderRow } from "@/lib/lender-match"
import { setIfPresent } from "@/lib/sync-helpers"
import { phoenixToday } from "@/app/deals/deal-schema"

// States from which a freshly-signed deal advances to "ready_to_send". A deal
// further along the pipeline is never regressed by a sync.
const ADVANCE_FROM = new Set([
  "signed",
  "waiting_for_scan",
  "gathering_paperwork",
])

// Only taptosignDealId is required. A TaptoSign deal is partial at most sync
// moments, so everything else is optional — we land what we have and refine on a
// later sync rather than 422-ing on missing fields.
const syncSchema = z.object({
  taptosignDealId: z.string().min(1),
  customer: z
    .object({
      firstName: z.string().optional(),
      lastName: z.string().optional(),
      email: z.string().optional(),
    })
    .optional()
    .default({}),
  coBuyer: z
    .object({
      name: z.string().optional(),
      email: z.string().optional(),
      signed: z.boolean().optional(),
    })
    .optional(),
  vehicle: z
    .object({
      vin: z.string().optional(),
      year: z.string().optional(),
      make: z.string().optional(),
      model: z.string().optional(),
      miles: z.string().optional(),
      stockNumber: z.string().optional(),
    })
    .optional()
    .default({}),
  finance: z
    .object({
      salePrice: z.number().optional(),
      downPayment: z.number().optional(),
      amountFinanced: z.number().optional(),
      apr: z.number().optional(),
      term: z.number().optional(),
      monthlyPayment: z.number().optional(),
      lenderName: z.string().optional(),
      frontGross: z.number().nullable().optional(),
      backGross: z.number().nullable().optional(),
      totalGross: z.number().nullable().optional(),
    })
    .optional()
    .default({}),
  sales: z
    .object({
      salesPersonName: z.string().optional(),
      financeManagerName: z.string().optional(),
    })
    .optional(),
  signed: z.boolean().optional().default(false),
  signedAt: z.string().optional(),
  saleDate: z.string().optional(),
})

function nextPipelineState(current: string | null, signed: boolean): string {
  const base = current ?? "signed"
  if (signed && ADVANCE_FROM.has(base)) return "ready_to_send"
  return base
}

// saleDate from TaptoSign → a YYYY-MM-DD sold_date, else today (Phoenix). Format
// isn't pinned by TaptoSign, so accept an ISO prefix or anything Date can parse
// before falling back to today.
function toSoldDate(saleDate: string | undefined): string {
  if (saleDate) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(saleDate)
    if (m) return `${m[1]}-${m[2]}-${m[3]}`
    const d = new Date(saleDate)
    if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10)
  }
  return phoenixToday()
}

// TaptoSign's BuyerSignedDate format isn't pinned; normalize to ISO so a
// malformed value is skipped (returns undefined) rather than 500-ing the write
// when Postgres rejects it as a TIMESTAMPTZ.
function toTimestamp(v: string | undefined): string | undefined {
  if (!v) return undefined
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString()
}

export async function POST(request: Request) {
  // 1. Authenticate via extension token.
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { userId, dealershipId } = ctx

  // 2. Parse + validate the body.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }

  const parsed = syncSchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid payload.", details: parsed.error.flatten() },
      { status: 422 }
    )
  }
  const body = parsed.data

  const supabase = createServiceRoleClient()

  // 3. Lender matching via the shared catalog matcher (exact, then prefix),
  //    scoped to tenant. Ambiguous matches stay unmatched (raw text retained).
  const rawLenderName = body.finance.lenderName?.trim()
  let lenderId: string | null = null
  if (rawLenderName) {
    const { data: lenders } = await supabase
      .from("lenders")
      .select("id, name")
      .eq("dealership_id", dealershipId)
      .is("deleted_at", null)
    const result = matchLenderByName(rawLenderName, (lenders ?? []) as LenderRow[])
    if (result.matched) lenderId = result.lenderId
  }
  const lenderMapped = lenderId !== null

  // 4. Look up an existing synced deal (tenant-scoped upsert key).
  const { data: existing } = await supabase
    .from("deals")
    .select("id, pipeline_state")
    .eq("dealership_id", dealershipId)
    .eq("taptosign_deal_id", body.taptosignDealId)
    .is("deleted_at", null)
    .maybeSingle()

  const year = body.vehicle.year ? Number.parseInt(body.vehicle.year, 10) : NaN

  // Null-skip every data field: a partial re-sync must not clobber an existing
  // non-null DB value (incl. a manually-set or RouteOne-set lender_id) with null
  // from a missing payload field. taptosign_lender_name is written unconditionally
  // so a newly-matched lender clears stale raw text; co_buyer_signed is NOT NULL.
  const mapped: Record<string, unknown> = {}
  setIfPresent(mapped, "customer_first_name", body.customer.firstName)
  setIfPresent(mapped, "customer_last_name", body.customer.lastName)
  setIfPresent(mapped, "vehicle_year", Number.isNaN(year) ? null : year)
  setIfPresent(mapped, "vehicle_make", body.vehicle.make)
  setIfPresent(mapped, "vehicle_model", body.vehicle.model)
  setIfPresent(mapped, "vehicle_vin", body.vehicle.vin)
  setIfPresent(mapped, "stock_number", body.vehicle.stockNumber)
  setIfPresent(mapped, "amount_financed", body.finance.amountFinanced)
  setIfPresent(mapped, "apr", body.finance.apr)
  setIfPresent(mapped, "term_months", body.finance.term)
  setIfPresent(mapped, "monthly_payment", body.finance.monthlyPayment)
  setIfPresent(mapped, "customer_email", body.customer.email)
  setIfPresent(mapped, "vehicle_mileage", body.vehicle.miles)
  setIfPresent(mapped, "sale_price", body.finance.salePrice)
  setIfPresent(mapped, "down_payment", body.finance.downPayment)
  setIfPresent(mapped, "sales_person_name", body.sales?.salesPersonName)
  setIfPresent(mapped, "finance_manager_name", body.sales?.financeManagerName)
  setIfPresent(mapped, "signed_at", toTimestamp(body.signedAt))
  setIfPresent(mapped, "co_buyer_name", body.coBuyer?.name)
  setIfPresent(mapped, "co_buyer_email", body.coBuyer?.email)
  setIfPresent(mapped, "front_gross", body.finance.frontGross)
  setIfPresent(mapped, "back_gross", body.finance.backGross)
  setIfPresent(mapped, "total_gross", body.finance.totalGross)
  // lender_id: set only on a catalog match, never null (D-lenderoverwrite).
  setIfPresent(mapped, "lender_id", lenderId)
  mapped.taptosign_lender_name = lenderMapped ? null : (rawLenderName ?? null)
  if (body.coBuyer?.signed !== undefined) mapped.co_buyer_signed = body.coBuyer.signed

  if (existing) {
    const pipeline_state = nextPipelineState(
      existing.pipeline_state as string,
      body.signed
    )
    const { error } = await supabase
      .from("deals")
      .update({ ...mapped, pipeline_state })
      .eq("id", existing.id)
      .eq("dealership_id", dealershipId)

    if (error) {
      return NextResponse.json(
        { error: "Could not update the deal." },
        { status: 500 }
      )
    }
    return NextResponse.json({
      dealId: existing.id as string,
      action: "updated" as const,
      lenderMapped,
    })
  }

  const { data: created, error } = await supabase
    .from("deals")
    .insert({
      ...mapped,
      dealership_id: dealershipId,
      created_by: userId,
      taptosign_deal_id: body.taptosignDealId,
      sold_date: toSoldDate(body.saleDate),
      pipeline_state: nextPipelineState(null, body.signed),
    })
    .select("id")
    .single()

  if (error || !created) {
    return NextResponse.json(
      { error: "Could not create the deal." },
      { status: 500 }
    )
  }

  return NextResponse.json({
    dealId: created.id as string,
    action: "created" as const,
    lenderMapped,
  })
}
