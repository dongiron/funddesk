// ============================================================
// POST /api/extensions/taptosign/bos-extract
// ============================================================
// Authoritative payment_method classification from the Bill of Sale. The BoS
// carries a RISC-vs-Cash indicator (typically a checkbox) that definitively
// says whether the dealer financed the deal (submitted to a lender) or was paid
// directly — regardless of any customer-side lien. This supersedes the
// heuristic/sticky detection in the basic sync route, which has mis-classified
// credit-union deals.
//
// Runs as second-stage extraction: the extension calls this with the signed PDF
// package after the basic sync. When the result is "financed" (RISC), the
// extension follows up with /pdf-extract for the RIC financial fields; cash
// deals skip that stage.
//
// SECURITY INVARIANT — service-role client, BYPASSES RLS. EVERY query MUST filter
// by the `dealershipId` from the validated token. The deal must already exist
// (created by the basic sync) — this route never creates deals.
// ============================================================

import { NextResponse } from "next/server"
import { z } from "zod"
import Anthropic from "@anthropic-ai/sdk"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { setIfPresent } from "@/lib/sync-helpers"
import { logExtraction } from "@/lib/extraction-log"
import { downloadStagedPdf, deleteStagedPdf } from "@/lib/pdf-staging"
import { STATES_BY_METHOD, TERMINAL_STATES } from "@/app/deals/deal-schema"

// Same cap as /pdf-extract — 20MB base64 (~15MB PDF). The BoS lives in the same
// signed package the extension already sends to /pdf-extract.
const MAX_PDF_BASE64_CHARS = 20_000_000

// The PDF arrives either as a staged Storage path (production — bypasses Vercel's
// 4.5MB request-body limit) or, as a fallback, inline base64 (dev / small files).
const bodySchema = z
  .object({
    taptosignDealId: z.string().min(1),
    pdfPath: z.string().min(1).optional(),
    pdfBase64: z.string().min(1).optional(),
  })
  .refine((b) => !!b.pdfPath || !!b.pdfBase64, {
    message: "Either pdfPath or pdfBase64 is required.",
  })

// Our own validation of Claude's structured output (the project's zod 4). The
// model is also constrained by BOS_JSON_SCHEMA below. 10 required + 4 nullable =
// 4 union-typed params, well under the structured-outputs limit of 16.
const bosSchema = z.object({
  payment_type: z.enum(["risc", "cash"]),
  customer_first_name: z.string(),
  customer_last_name: z.string(),
  vehicle_year: z.number(),
  vehicle_make: z.string(),
  vehicle_model: z.string(),
  vehicle_vin: z.string(),
  sale_price: z.number(),
  down_payment: z.number(),
  balance_due: z.number(),
  co_buyer_name: z.string().nullable(),
  stock_number: z.string().nullable(),
  outside_lender_name: z.string().nullable(),
  customer_business_name: z.string().nullable(),
})
type BosExtraction = z.infer<typeof bosSchema>

const STR = { type: "string" } as const
const NUM = { type: "number" } as const
const STR_OR_NULL = { type: ["string", "null"] } as const
const PAYMENT_TYPE = { type: "string", enum: ["risc", "cash"] } as const
const BOS_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "payment_type", "customer_first_name", "customer_last_name",
    "vehicle_year", "vehicle_make", "vehicle_model", "vehicle_vin",
    "sale_price", "down_payment", "balance_due",
    "co_buyer_name", "stock_number", "outside_lender_name", "customer_business_name",
  ],
  properties: {
    payment_type: PAYMENT_TYPE,
    customer_first_name: STR,
    customer_last_name: STR,
    vehicle_year: NUM,
    vehicle_make: STR,
    vehicle_model: STR,
    vehicle_vin: STR,
    sale_price: NUM,
    down_payment: NUM,
    balance_due: NUM,
    co_buyer_name: STR_OR_NULL,
    stock_number: STR_OR_NULL,
    outside_lender_name: STR_OR_NULL,
    customer_business_name: STR_OR_NULL,
  },
} as const

const BOS_SYSTEM =
  "You extract structured data from a US auto-dealership Bill of Sale. These come " +
  "from different dealer management systems (Frazer, Autosoft, and others), so labels " +
  "and layout vary — identify each field by its MEANING, not by a fixed label or " +
  "position. The single most important field is payment_type: whether the deal is " +
  "financed (a Retail Installment Sale Contract) or a cash sale. Read the payment-" +
  "method checkbox — a named lien holder alone does NOT make a deal financed."

const BOS_PROMPT = `Extract these fields from the Bill of Sale. It may come from any dealer management system (e.g. Frazer or Autosoft), so labels and layout differ — find each field by what it MEANS, not by an exact label.

payment_type — the most important field. Find the payment-method indicator: a pair of checkboxes or marked boxes labeled some variation of "Cash" versus "Finance" / "Credit" / "RISC" / "Retail Installment".
- If the Finance / Credit / RISC / Retail-Installment box is the selected one → "risc"
- If the Cash box is the selected one → "cash"
The checkbox is authoritative. A named lien holder or finance company does NOT by itself make it "risc": a customer can pay the dealer cash while their own bank or credit union holds a lien — if the Cash box is selected, payment_type is "cash" even when a lien holder is listed.
- If no payment-method checkbox is present or legible: choose "risc" only when the document plainly shows dealer-arranged financing (an installment/finance section with an APR, a finance charge, or a scheduled monthly payment); otherwise "cash".

Always present — extract them:
- customer_first_name, customer_last_name — the buyer's name may be ALL CAPS or Mixed Case, and may be written "FIRST MIDDLE LAST", "FIRST LAST", or "LAST, FIRST MIDDLE". Put the first given name in customer_first_name and the remaining name(s) — including any middle name — in customer_last_name.
- vehicle_year (number), vehicle_make, vehicle_model, vehicle_vin (17-char alphanumeric)
- sale_price — total vehicle price including fees/taxes, BEFORE down payment and trade are applied (labels vary: "Vehicle Price", "Total Due", "Total Sale Price")
- down_payment — total cash down or deposit
- balance_due — amount still owed at signing after down payment and trade are applied (labels vary: "Balance Due", "Amount Financed", "Total Balance")

Optional — use null only if truly absent:
- co_buyer_name
- stock_number — labels vary ("Stock #", "Stock", "Account #"); the stock number and account number may be the same value
- outside_lender_name — ONLY when payment_type is "cash" AND a lien holder / finance company is named (e.g. "Navy Federal Credit Union" from a "Lien Holder" section on a cash-paid deal). Leave null on financed ("risc") deals and on cash deals with no lien holder.
- customer_business_name — if the buyer is a company rather than an individual; when set, use the contact/signer's name for customer_first_name / customer_last_name.

Rules:
- Currency values: return just the number, no "$" or commas (e.g. "$32,012.31" → 32012.31).`

// When BoS flips the classification, keep the pipeline_state consistent with the
// new payment_method (the dropdown filter + downstream logic assume validity).
// Terminal states are deliberate — never auto-regress them; flag for review.
function reconcilePipeline(
  current: string,
  method: "financed" | "cash"
): { next: string | null; terminal: boolean } {
  if ((TERMINAL_STATES as readonly string[]).includes(current)) {
    return { next: null, terminal: true }
  }
  if ((STATES_BY_METHOD[method] as readonly string[]).includes(current)) {
    return { next: null, terminal: false }
  }
  return {
    next: method === "cash" ? "awaiting_payment" : "gathering_paperwork",
    terminal: false,
  }
}

export async function POST(request: Request) {
  // 1. Authenticate.
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { dealershipId } = ctx

  // 2. Parse + size-gate.
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

  const supabase = createServiceRoleClient()

  // Resolve the PDF: download the staged object (tenant-scoped) when a path was
  // sent, else use inline base64. `stagedPath` is non-null only when we downloaded
  // it — used to clean up the staged object once extraction is done.
  let pdfBase64: string
  let stagedPath: string | null = null
  if (parsed.data.pdfPath) {
    const dl = await downloadStagedPdf(supabase, dealershipId, parsed.data.pdfPath)
    if (!dl.ok) {
      return NextResponse.json({ error: dl.error }, { status: 400 })
    }
    pdfBase64 = dl.base64
    stagedPath = parsed.data.pdfPath
  } else {
    pdfBase64 = parsed.data.pdfBase64!
  }

  if (pdfBase64.length > MAX_PDF_BASE64_CHARS) {
    return NextResponse.json(
      { error: "PDF is too large to extract (must be under 20MB). Try a smaller package." },
      { status: 413 }
    )
  }
  console.log(`[bos-extract] pdf resolved length=${pdfBase64.length} staged=${!!stagedPath}`)

  // 3. Require an existing synced deal (tenant-scoped). Pull the columns we may
  //    write (for the change count) plus the signals that gate classification.
  const { data: dealData } = await supabase
    .from("deals")
    .select(
      "id, payment_method, pipeline_state, balance_due, amount_financed, " +
        "routeone_deal_id, routeone_contract_number, routeone_funding_lender_name, " +
        "customer_first_name, customer_last_name, customer_business_name, co_buyer_name, " +
        "vehicle_year, vehicle_make, vehicle_model, vehicle_vin, stock_number, " +
        "sale_price, down_payment, outside_lender_name"
    )
    .eq("dealership_id", dealershipId)
    .eq("taptosign_deal_id", parsed.data.taptosignDealId)
    .is("deleted_at", null)
    .maybeSingle()

  const deal = dealData as
    | {
        id: string
        payment_method: string
        pipeline_state: string
        routeone_deal_id: string | null
        routeone_contract_number: string | null
        routeone_funding_lender_name: string | null
        [key: string]: unknown
      }
    | null

  if (!deal) {
    return NextResponse.json(
      { error: "Deal not found. Run the basic sync first." },
      { status: 404 }
    )
  }

  // 4. Extract with Claude (structured outputs; 30s timeout).
  let extracted: BosExtraction
  try {
    const anthropic = new Anthropic({ timeout: 30_000 })
    const resp = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
      system: BOS_SYSTEM,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "document",
              source: {
                type: "base64",
                media_type: "application/pdf",
                data: pdfBase64,
              },
            },
            { type: "text", text: BOS_PROMPT },
          ],
        },
      ],
      output_config: { format: { type: "json_schema", schema: BOS_JSON_SCHEMA } },
    })

    console.log(
      `[bos-extract] claude-sonnet-4-6 in=${resp.usage.input_tokens} out=${resp.usage.output_tokens}`
    )

    if (resp.stop_reason === "refusal") {
      return NextResponse.json(
        { error: "The document could not be processed." },
        { status: 422 }
      )
    }

    const textBlock = resp.content.find((b) => b.type === "text")
    if (!textBlock || textBlock.type !== "text") {
      return NextResponse.json({ error: "Extraction returned no data." }, { status: 502 })
    }
    const validated = bosSchema.safeParse(JSON.parse(textBlock.text))
    if (!validated.success) {
      return NextResponse.json(
        { error: "Extraction returned an unexpected shape." },
        { status: 502 }
      )
    }
    extracted = validated.data
  } catch (err) {
    const e = err as {
      name?: string
      message?: string
      status?: number
      error?: unknown
      headers?: unknown
      stack?: string
    }
    console.error("[bos-extract] anthropic call failed:", {
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
        { error: "Bill of Sale extraction service is unavailable. Try again." },
        { status }
      )
    }
    return NextResponse.json({ error: "Bill of Sale extraction failed." }, { status: 502 })
  }

  // 5. Classification. The BoS checkbox is authoritative EXCEPT when RouteOne
  //    provenance is present — a deal already in RouteOne funding was demonstrably
  //    submitted to a lender, which beats an OCR'd checkbox (guards against a
  //    misread on a real financed deal). The checkbox decides every other deal.
  const hasRouteoneProvenance = !!(
    deal.routeone_deal_id ||
    deal.routeone_contract_number ||
    deal.routeone_funding_lender_name
  )
  const bosMethod: "financed" | "cash" =
    extracted.payment_type === "risc" ? "financed" : "cash"
  const paymentMethod: "financed" | "cash" = hasRouteoneProvenance ? "financed" : bosMethod

  logExtraction("bos-extract", pdfBase64, extracted, {
    payment_type: extracted.payment_type,
    paymentMethod,
    routeoneProvenance: hasRouteoneProvenance,
  })

  // 6. Build the update. payment_method is authoritative (always written). For
  //    cash, balance_due is authoritative and amount_financed is cleared; for
  //    financed, balance_due is cleared and amount_financed is left to the RIC
  //    extraction stage. Other fields are null-skip so a sparse read can't wipe
  //    data set by a fuller sync or a manual edit.
  const update: Record<string, unknown> = { payment_method: paymentMethod }
  if (paymentMethod === "cash") {
    update.balance_due = extracted.balance_due
    update.amount_financed = null
  } else {
    update.balance_due = null
  }
  setIfPresent(update, "customer_first_name", extracted.customer_first_name)
  setIfPresent(update, "customer_last_name", extracted.customer_last_name)
  setIfPresent(update, "customer_business_name", extracted.customer_business_name)
  setIfPresent(update, "co_buyer_name", extracted.co_buyer_name)
  setIfPresent(update, "vehicle_year", extracted.vehicle_year)
  setIfPresent(update, "vehicle_make", extracted.vehicle_make)
  setIfPresent(update, "vehicle_model", extracted.vehicle_model)
  setIfPresent(update, "vehicle_vin", extracted.vehicle_vin)
  setIfPresent(update, "stock_number", extracted.stock_number)
  setIfPresent(update, "sale_price", extracted.sale_price)
  setIfPresent(update, "down_payment", extracted.down_payment)
  setIfPresent(update, "outside_lender_name", extracted.outside_lender_name)

  // Reconcile pipeline only when the classification actually flips.
  if (paymentMethod !== deal.payment_method) {
    const r = reconcilePipeline(deal.pipeline_state, paymentMethod)
    if (r.terminal) {
      console.warn(
        `[bos-extract] deal ${deal.id}: BoS reclassified ${deal.payment_method}→${paymentMethod} ` +
          `but pipeline_state is terminal (${deal.pipeline_state}); left as-is for manual review.`
      )
    } else if (r.next) {
      update.pipeline_state = r.next
    }
  }

  // Count fields whose value actually changes (string-normalized — numeric
  // columns can come back as strings from the driver).
  const current = deal as Record<string, unknown>
  let fieldsUpdated = 0
  for (const [key, value] of Object.entries(update)) {
    if (String(current[key] ?? "") !== String(value ?? "")) fieldsUpdated++
  }

  const { error } = await supabase
    .from("deals")
    .update(update)
    .eq("id", deal.id)
    .eq("dealership_id", dealershipId)

  if (error) {
    return NextResponse.json({ error: "Could not save extracted data." }, { status: 500 })
  }

  // Clean up the staged PDF only for cash deals — a financed deal's RIC extraction
  // (/pdf-extract) runs next and reuses the same object, so it does the cleanup.
  if (stagedPath && paymentMethod === "cash") {
    await deleteStagedPdf(supabase, stagedPath)
  }

  return NextResponse.json({ extracted, fieldsUpdated, paymentMethod })
}
