// ============================================================
// POST /api/extensions/taptosign/pdf-extract
// ============================================================
// Second-stage TaptoSign sync: the extension sends the signed contract PDF
// (base64). We pass it to Claude for structured field extraction and apply the
// results to the already-synced deal. Authenticated by the per-user extension
// token (Authorization: Bearer fde_...), NOT a Supabase Auth session.
//
// SECURITY INVARIANT — this route uses the service-role client, which BYPASSES
// Row-Level Security. Tenant isolation depends entirely on this code: EVERY query
// MUST filter by the `dealershipId` resolved from the validated token. The deal
// must already exist (created by the basic sync) — this route never creates deals.
// ============================================================

import { NextResponse } from "next/server"
import { z } from "zod"
import Anthropic from "@anthropic-ai/sdk"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { setIfPresent } from "@/lib/sync-helpers"
import { matchLenderByName, type LenderRow } from "@/lib/lender-match"

// 20MB of base64 (~15MB PDF). TaptoSign signed packages reach ~10MB base64; the
// headroom covers larger multi-disclosure packages. Anthropic accepts PDFs up to
// 32MB, and the proxy body cap is raised to 25MB in next.config.ts.
const MAX_PDF_BASE64_CHARS = 20_000_000

const bodySchema = z.object({
  taptosignDealId: z.string().min(1),
  pdfBase64: z.string().min(1),
})

// Our own validation of Claude's structured output (zod 4, the project's zod).
// The model is also constrained by EXTRACTION_JSON_SCHEMA below, so this is a
// belt-and-suspenders parse.
// 13 required (non-null) + 3 nullable = 16 fields, 3 union types. Anthropic
// structured outputs caps nullable/union parameters at 16; keeping the always-
// present RIC fields non-null also improves extraction reliability.
const extractionSchema = z.object({
  customer_first_name: z.string(),
  customer_last_name: z.string(),
  co_buyer_name: z.string().nullable(),
  vehicle_year: z.number(),
  vehicle_make: z.string(),
  vehicle_model: z.string(),
  vehicle_vin: z.string(),
  vehicle_mileage: z.string().nullable(),
  stock_number: z.string().nullable(),
  sale_price: z.number(),
  down_payment: z.number(),
  amount_financed: z.number(),
  apr: z.number(),
  term_months: z.number(),
  monthly_payment: z.number(),
  lender_name: z.string(),
})
type Extraction = z.infer<typeof extractionSchema>

// JSON Schema handed to the structured-outputs API (output_config.format). Only
// the three optional fields use a null union; additionalProperties:false and all
// keys listed in `required` per the API contract.
const STR = { type: "string" } as const
const NUM = { type: "number" } as const
const STR_OR_NULL = { type: ["string", "null"] } as const
const EXTRACTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "customer_first_name", "customer_last_name", "co_buyer_name",
    "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_vin",
    "vehicle_mileage", "stock_number", "sale_price", "down_payment",
    "amount_financed", "apr", "term_months", "monthly_payment", "lender_name",
  ],
  properties: {
    customer_first_name: STR,
    customer_last_name: STR,
    co_buyer_name: STR_OR_NULL,
    vehicle_year: NUM,
    vehicle_make: STR,
    vehicle_model: STR,
    vehicle_vin: STR,
    vehicle_mileage: STR_OR_NULL,
    stock_number: STR_OR_NULL,
    sale_price: NUM,
    down_payment: NUM,
    amount_financed: NUM,
    apr: NUM,
    term_months: NUM,
    monthly_payment: NUM,
    lender_name: STR,
  },
} as const

const EXTRACTION_SYSTEM =
  "You extract structured data from a signed vehicle retail installment contract " +
  "(RIC) and bill of sale. The financial fields are TILA-mandated and always " +
  "present on a signed contract — extract them. Use null only for the three " +
  "optional fields (co-buyer name, mileage, stock number) when truly absent."

const EXTRACTION_PROMPT = `Extract these fields from the signed contract package (Retail Installment Contract + Bill of Sale).

Always present on a signed RIC — extract all of them:
- customer_first_name, customer_last_name
- vehicle_year (number), vehicle_make, vehicle_model, vehicle_vin (17 chars)
- sale_price, down_payment (total cash down), amount_financed (decimals)
- apr (percentage as a decimal, e.g. 10.99 not 0.1099)
- term_months (number), monthly_payment (decimal)
- lender_name (the funding source / creditor)

Optional — use null only if truly absent:
- co_buyer_name
- vehicle_mileage (as recorded)
- stock_number

Rules:
- APR is the disclosed Annual Percentage Rate from the TILA disclosure box, not the buy rate.
- amount_financed is the disclosed Amount Financed from the TILA disclosure, not the sale price.
- lender_name is the creditor / finance source / assignee, not the dealer.
- Currency values: just the number, no $ or commas.
- If a field appears in both the RIC and the Bill of Sale, prefer the RIC value.`

export async function POST(request: Request) {
  // 1. Authenticate.
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { dealershipId } = ctx

  // 2. Parse + size-gate the body.
  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 422 })
  }
  if (parsed.data.pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return NextResponse.json(
      { error: "PDF is too large to extract (must be under 20MB). Try a smaller package." },
      { status: 413 }
    )
  }
  console.log(`[pdf-extract] pdfBase64 length=${parsed.data.pdfBase64.length}`)

  const supabase = createServiceRoleClient()

  // 3. Require an existing synced deal (tenant-scoped). Pull the columns we may
  //    write so we can count what actually changed.
  const { data: deal } = await supabase
    .from("deals")
    .select(
      "id, customer_first_name, customer_last_name, customer_email, co_buyer_name, " +
        "vehicle_year, vehicle_make, vehicle_model, vehicle_vin, vehicle_mileage, " +
        "stock_number, sale_price, down_payment, amount_financed, apr, term_months, " +
        "monthly_payment, front_gross, back_gross, total_gross, lender_id, " +
        "taptosign_lender_name"
    )
    .eq("dealership_id", dealershipId)
    .eq("taptosign_deal_id", parsed.data.taptosignDealId)
    .is("deleted_at", null)
    .maybeSingle()

  if (!deal) {
    return NextResponse.json(
      { error: "Deal not found. Run the basic sync first." },
      { status: 404 }
    )
  }

  // 4. Extract with Claude (structured outputs; 30s timeout).
  let extracted: Extraction
  try {
    const anthropic = new Anthropic({ timeout: 30_000 })
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 4096,
      system: EXTRACTION_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: parsed.data.pdfBase64,
              },
            },
            { type: "text", text: EXTRACTION_PROMPT },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: EXTRACTION_JSON_SCHEMA } },
    })

    // Cost log — model + token counts only, no document content or PII.
    console.log(
      `[pdf-extract] claude-sonnet-4-6 in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`
    )

    if (resp.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The document could not be processed." },
        { status: 422 }
      )
    }

    const textBlock = resp.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json(
        { error: "Extraction returned no data." },
        { status: 502 }
      )
    }
    const validated = extractionSchema.safeParse(JSON.parse(textBlock.text))
    if (!validated.success) {
      return NextResponse.json(
        { error: "Extraction returned an unexpected shape." },
        { status: 502 }
      )
    }
    extracted = validated.data
  } catch (err) {
    // Diagnostic: surface the full upstream error so a 504/502 is traceable.
    const e = err as {
      name?: string
      message?: string
      status?: number
      error?: unknown
      headers?: unknown
      stack?: string
    }
    console.error("[pdf-extract] anthropic call failed:", {
      name: e?.name,
      message: e?.message,
      status: e?.status,
      error: e?.error,
      headers: e?.headers,
      stack: e?.stack,
    })
    if (err instanceof Anthropic.APIError) {
      const status = err.status && err.status >= 500 ? 502 : 504
      return NextResponse.json(
        { error: "Contract extraction service is unavailable. Try again." },
        { status }
      )
    }
    return NextResponse.json(
      { error: "Contract extraction failed." },
      { status: 502 }
    )
  }

  // 5. Lender catalog match (shared util). Raw text stored for provenance; cleared
  //    on a catalog hit (consistent with the basic sync route).
  const { data: lenderData } = await supabase
    .from("lenders")
    .select("id, name")
    .eq("dealership_id", dealershipId)
    .is("deleted_at", null)
  const lenderRows = (lenderData ?? []) as LenderRow[]

  const rawLender = extracted.lender_name?.trim() || null
  let matchedLenderId: string | null = null
  if (rawLender) {
    const r = matchLenderByName(rawLender, lenderRows)
    if (r.matched) matchedLenderId = r.lenderId
  }

  // 6. Build the update — null-skip every field so a missing extraction never
  //    clobbers existing data (incl. manual edits). sold_date is intentionally
  //    NOT written (NOT NULL DEFAULT CURRENT_DATE makes a "only if null" guard a
  //    no-op). lender_id only on a match, never null.
  const update: Record<string, unknown> = {}
  setIfPresent(update, "customer_first_name", extracted.customer_first_name)
  setIfPresent(update, "customer_last_name", extracted.customer_last_name)
  setIfPresent(update, "co_buyer_name", extracted.co_buyer_name)
  setIfPresent(update, "vehicle_year", extracted.vehicle_year)
  setIfPresent(update, "vehicle_make", extracted.vehicle_make)
  setIfPresent(update, "vehicle_model", extracted.vehicle_model)
  setIfPresent(update, "vehicle_vin", extracted.vehicle_vin)
  setIfPresent(update, "vehicle_mileage", extracted.vehicle_mileage)
  setIfPresent(update, "stock_number", extracted.stock_number)
  setIfPresent(update, "sale_price", extracted.sale_price)
  setIfPresent(update, "down_payment", extracted.down_payment)
  setIfPresent(update, "amount_financed", extracted.amount_financed)
  setIfPresent(update, "apr", extracted.apr)
  setIfPresent(update, "term_months", extracted.term_months)
  setIfPresent(update, "monthly_payment", extracted.monthly_payment)
  if (matchedLenderId) update.lender_id = matchedLenderId
  if (rawLender) update.taptosign_lender_name = matchedLenderId ? null : rawLender

  // Count fields whose value actually changes (string-normalized — numeric columns
  // can come back as strings from the driver).
  const current = deal as unknown as Record<string, unknown>
  let fieldsUpdated = 0
  for (const [key, value] of Object.entries(update)) {
    if (String(current[key] ?? "") !== String(value ?? "")) fieldsUpdated++
  }

  const { error } = await supabase
    .from("deals")
    .update(update)
    .eq("id", current.id as string)
    .eq("dealership_id", dealershipId)

  if (error) {
    return NextResponse.json({ error: "Could not save extracted data." }, { status: 500 })
  }

  return NextResponse.json({ extracted, fieldsUpdated })
}
