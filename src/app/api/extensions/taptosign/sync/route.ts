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
import { phoenixToday } from "@/app/deals/deal-schema"

// States from which a freshly-signed deal advances to "ready_to_send". A deal
// further along the pipeline is never regressed by a sync.
const ADVANCE_FROM = new Set([
  "signed",
  "waiting_for_scan",
  "gathering_paperwork",
])

const syncSchema = z.object({
  taptosignDealId: z.string().min(1),
  customer: z.object({
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().optional(),
    email: z.string().optional(),
    address: z.string().optional(),
  }),
  vehicle: z.object({
    vin: z.string().min(1),
    year: z.string().min(1),
    make: z.string().min(1),
    model: z.string().min(1),
    miles: z.string().optional(),
  }),
  finance: z
    .object({
      amountFinanced: z.number().optional(),
      apr: z.number().optional(),
      cashDown: z.number().optional(),
      lenderName: z.string().optional(),
      term: z.number().optional(),
    })
    .optional()
    .default({}),
  signed: z.boolean(),
  signedAt: z.string().optional(),
})

function nextPipelineState(current: string | null, signed: boolean): string {
  const base = current ?? "signed"
  if (signed && ADVANCE_FROM.has(base)) return "ready_to_send"
  return base
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

  // 3. Lender matching — case-insensitive trimmed exact match, scoped to tenant.
  const rawLenderName = body.finance.lenderName?.trim()
  let lenderId: string | null = null
  if (rawLenderName) {
    const { data: lender } = await supabase
      .from("lenders")
      .select("id")
      .eq("dealership_id", dealershipId)
      .is("deleted_at", null)
      .ilike("name", rawLenderName)
      .limit(1)
      .maybeSingle()
    lenderId = (lender?.id as string | undefined) ?? null
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

  const year = Number.parseInt(body.vehicle.year, 10)

  // Fields written on both create and update. Columns that don't exist on deals
  // (phone/email/address, miles, cashDown, signedAt) are intentionally skipped.
  const mapped = {
    customer_first_name: body.customer.firstName,
    customer_last_name: body.customer.lastName,
    vehicle_year: Number.isNaN(year) ? null : year,
    vehicle_make: body.vehicle.make,
    vehicle_model: body.vehicle.model,
    vehicle_vin: body.vehicle.vin,
    amount_financed: body.finance.amountFinanced ?? null,
    apr: body.finance.apr ?? null,
    term_months: body.finance.term ?? null,
    lender_id: lenderId,
    taptosign_lender_name: lenderMapped ? null : (rawLenderName ?? null),
  }

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
      sold_date: phoenixToday(),
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
