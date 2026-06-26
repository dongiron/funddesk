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
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { matchLenderByName, type LenderRow } from "@/lib/lender-match"
import { setIfPresent } from "@/lib/sync-helpers"
import { recordDealEvent } from "@/lib/deal-events"
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

// Pipeline advance per payment method. Cash deals run a separate flow: a new or
// just-signed cash deal advances to awaiting_payment; an already-advanced cash
// deal is left as-is (funds_cleared → payment_cleared is handled by the
// setFundsCleared action, not the sync). Financed deals use nextPipelineState.
function nextPipeline(
  current: string | null,
  paymentMethod: "financed" | "cash",
  signed: boolean
): string {
  if (paymentMethod === "cash") {
    return current === null || current === "signed" ? "awaiting_payment" : current
  }
  return nextPipelineState(current, signed)
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

  const rawLenderName = body.finance.lenderName?.trim()

  // 3. Lender matching via the shared catalog matcher (exact, then prefix),
  //    scoped to tenant. Ambiguous matches stay unmatched (raw text retained).
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

  // 4. Look up the existing synced deal (tenant-scoped upsert key). Pull RouteOne
  //    provenance too — it's authoritative evidence the deal is financed.
  const { data: existingData } = await supabase
    .from("deals")
    .select(
      "id, pipeline_state, payment_method, lender_id, amount_financed, " +
        "routeone_funding_lender_name, routeone_deal_id, routeone_contract_number"
    )
    .eq("dealership_id", dealershipId)
    .eq("taptosign_deal_id", body.taptosignDealId)
    .is("deleted_at", null)
    .maybeSingle()
  const existing = existingData as {
    id: string
    pipeline_state: string
    payment_method: string
    lender_id: string | null
    amount_financed: number | null
    routeone_funding_lender_name: string | null
    routeone_deal_id: string | null
    routeone_contract_number: string | null
  } | null

  // 5. Cash detection (recomputed every sync). ANY financed signal from ANY
  //    source — RouteOne provenance, an existing lender, an existing financed
  //    amount, or a financed amount + named lender this sync — forces financed
  //    (D-routeone-authoritative), overriding TaptoSign's AssignToLender null
  //    gap. When no positive signal is present the classification is sticky
  //    (D-sticky, below): preserve the existing value, defaulting to cash only
  //    on a first sync.
  const hasRouteoneData = !!(
    existing?.routeone_funding_lender_name ||
    existing?.routeone_deal_id ||
    existing?.routeone_contract_number
  )
  const existingHasLender = !!existing?.lender_id
  const existingHasFinancedAmount = (existing?.amount_financed ?? 0) > 0
  // FUTURE: when CUDL sync ships, OR in its provenance signals here.
  const hasFinancedSignals =
    hasRouteoneData || existingHasLender || existingHasFinancedAmount
  const hasLenderName = !!rawLenderName
  const taptosignSuggestsFinanced =
    (body.finance.amountFinanced ?? 0) > 0 && hasLenderName
  // Sticky classification (D-sticky): a positive financed signal always wins.
  // This is the Stage-1 best guess only — the second-stage /bos-extract call
  // reads the authoritative RISC-vs-Cash checkbox and overwrites payment_method
  // (D-sticky-relegation), so any sticky-preserved value here is a fallback for
  // deals whose BoS extraction hasn't run yet.
  // Absent one, preserve the deal's existing payment_method on re-sync rather
  // than regressing to cash — TaptoSign returns a null AssignToLender on plenty
  // of real financed deals (e.g. credit-union deals routed via CUDL, not
  // RouteOne), so silence is not evidence of cash. Only a brand-new deal with no
  // signals anywhere defaults to cash. (Proper first-sync fix lands in 3.8.2 via
  // BoS RISC-vs-Cash extraction.)
  let paymentMethod: "financed" | "cash"
  if (taptosignSuggestsFinanced || hasFinancedSignals) {
    paymentMethod = "financed"
  } else if (existing) {
    paymentMethod = existing.payment_method === "cash" ? "cash" : "financed"
  } else {
    paymentMethod = "cash"
  }
  // TaptoSign's AmountFinanced carries the owed amount generically; fall back to
  // sale_price - down_payment. Routed to balance_due (cash) or amount_financed
  // (financed) below.
  const owedAmount =
    body.finance.amountFinanced ??
    (body.finance.salePrice != null
      ? body.finance.salePrice - (body.finance.downPayment ?? 0)
      : null)

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
  // payment_method recomputed every sync. The owed amount routes to balance_due
  // (cash) or amount_financed (financed); both written unconditionally so a
  // payment_method flip cleans up the unused column (D-flip). funds_cleared is
  // operator-owned — not touched here.
  mapped.payment_method = paymentMethod
  if (paymentMethod === "cash") {
    mapped.balance_due = owedAmount
    mapped.amount_financed = null // explicit clear on flip to cash
  } else {
    // Financed: only update amount_financed when this sync actually has a value —
    // a null TaptoSign field must not wipe a RouteOne-sourced amount (D-no-wipe).
    if (owedAmount != null) mapped.amount_financed = owedAmount
    mapped.balance_due = null // explicit clear on flip to financed
  }

  if (existing) {
    const pipeline_state = nextPipeline(
      existing.pipeline_state as string,
      paymentMethod,
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
    await emitSignedEvent(supabase, existing.id as string, dealershipId, userId, body)
    revalidatePath("/")
    revalidatePath("/deals")
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
      pipeline_state: nextPipeline(null, paymentMethod, body.signed),
    })
    .select("id")
    .single()

  if (error || !created) {
    return NextResponse.json(
      { error: "Could not create the deal." },
      { status: 500 }
    )
  }

  await emitSignedEvent(supabase, created.id as string, dealershipId, userId, body)
  revalidatePath("/")
  revalidatePath("/deals")
  return NextResponse.json({
    dealId: created.id as string,
    action: "created" as const,
    lenderMapped,
  })
}

// Record a 'signed' deal event when the package reports a buyer signature with a
// parseable date. Idempotent via the externalId — re-syncs don't duplicate it.
async function emitSignedEvent(
  supabase: ReturnType<typeof createServiceRoleClient>,
  dealId: string,
  dealershipId: string,
  userId: string,
  body: z.infer<typeof syncSchema>
): Promise<void> {
  if (!body.signed) return
  const signedAt = toTimestamp(body.signedAt)
  if (!signedAt) return
  await recordDealEvent({
    supabase,
    dealId,
    dealershipId,
    eventType: "signed",
    source: "taptosign_sync",
    eventAt: signedAt,
    externalId: `taptosign:${body.taptosignDealId}:signed`,
    createdBy: userId,
  })
}
