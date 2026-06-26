// ============================================================
// POST /api/extensions/routeone/sync
// ============================================================
// External endpoint for the RouteOne Chrome extension. Authenticated by a
// per-user extension token (Authorization: Bearer fde_...), NOT a Supabase Auth
// session.
//
// Batch sync: the extension scrapes the RouteOne Contract Manager and POSTs every
// contract in funding. Each row is matched onto an EXISTING FundDesk deal — by
// routeone_deal_id first (instant on re-sync), then by an unambiguous customer
// name match. RouteOne never creates deals.
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
import {
  parseCustomerName,
  extractLastWord,
  firstNameMatches,
} from "@/lib/routeone-match"
import { PIPELINE_STATES } from "@/app/deals/deal-schema"

const contractSchema = z.object({
  routeoneDealId: z.string().min(1),
  contractNumber: z.string().nullable().optional(),
  contractDate: z.string().nullable().optional(),
  customerName: z.string().nullable().optional(),
  fundingLenderName: z.string().nullable().optional(),
  fundingStatus: z.string().nullable().optional(),
  contractReturned: z.boolean().optional().default(false),
  hasUnreadMessage: z.boolean().optional().default(false),
  amountFinanced: z.number().nullable().optional(),
  reserveAmount: z.number().nullable().optional(),
  netProceeds: z.number().nullable().optional(),
  isDspOriginated: z.boolean().optional().default(false),
  transactionType: z.string().nullable().optional(),
  fundingAgeDays: z.number().nullable().optional(),
})

const syncSchema = z.object({ contracts: z.array(contractSchema).min(1) })

// Scraper already emits YYYY-MM-DD; defensively keep only the date prefix.
function toContractDate(v: string | null | undefined): string | null {
  if (!v) return null
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

// RouteOne funding status → pipeline_state target, or null for statuses that
// shouldn't auto-advance (Conditioned, Rejected, Pending, …).
function routeoneStatusToPipeline(routeoneStatus: string): string | null {
  const s = (routeoneStatus ?? "").toLowerCase().trim()
  if (s.includes("funded")) return "funded"
  if (s.includes("booked")) return "funds_in_transit"
  return null
}

// Advance-only: returns the new state when RouteOne's status maps to a later
// pipeline position than the deal's current one, else null (never regress —
// 'unwound' is last in the order, so a funded/booked target can't override it).
function nextPipelineFromRouteone(
  current: string | null,
  routeoneStatus: string
): string | null {
  const target = routeoneStatusToPipeline(routeoneStatus)
  if (!target) return null
  const order = PIPELINE_STATES as readonly string[]
  const currentIdx = current ? order.indexOf(current) : -1
  if (order.indexOf(target) > currentIdx) return target
  return null
}

type UnmatchedRow = {
  customerName: string | null
  routeoneDealId: string
  lenderName: string | null
  status: string | null
}
type ErroredRow = { routeoneDealId: string; customerName: string | null; error: string }

export async function POST(request: Request) {
  // 1. Authenticate via extension token.
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { dealershipId } = ctx

  // 2. Parse + validate the batch.
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

  const supabase = createServiceRoleClient()

  // 3. Lender catalog (one fetch, reused per row) for the shared matcher.
  const { data: lenderData } = await supabase
    .from("lenders")
    .select("id, name")
    .eq("dealership_id", dealershipId)
    .is("deleted_at", null)
  const lenderRows = (lenderData ?? []) as LenderRow[]

  let matched = 0
  const unmatchedRows: UnmatchedRow[] = []
  const erroredRows: ErroredRow[] = []

  for (const c of parsed.data.contracts) {
    // a. Instant match by routeone_deal_id (set on a prior sync).
    const { data: byId } = await supabase
      .from("deals")
      .select("id, pipeline_state")
      .eq("dealership_id", dealershipId)
      .eq("routeone_deal_id", c.routeoneDealId)
      .is("deleted_at", null)
      .maybeSingle()
    let dealId = (byId?.id as string | undefined) ?? null
    let currentPipeline = (byId?.pipeline_state as string | undefined) ?? null

    // b. Fallback: fuzzy customer-name match. RouteOne shows "Last, First" (no
    //    middle, sometimes a truncated first like "Steve"); FundDesk often stores
    //    middle names in last_name ("Anthony Cardona"). Match on a substring of
    //    last_name, then tighten in TS by last-word equality + bidirectional
    //    first-name prefix. Skip-as-unmatched on 0 or 2+ survivors — a wrong
    //    match silently corrupts data, so we'd rather surface it for manual fix.
    if (!dealId) {
      const pn = parseCustomerName(c.customerName)
      const lastWord = pn ? extractLastWord(pn.last) : ""
      if (pn && lastWord) {
        const { data: candidates } = await supabase
          .from("deals")
          .select("id, customer_first_name, customer_last_name, pipeline_state")
          .eq("dealership_id", dealershipId)
          .is("deleted_at", null)
          .ilike("customer_last_name", `%${lastWord}%`)
          .limit(10)

        const target = lastWord.toLowerCase()
        const survivors = (candidates ?? []).filter((cand) => {
          // Reject ILIKE substring false positives ("Cardonas" vs "Cardona").
          if (extractLastWord(cand.customer_last_name as string).toLowerCase() !== target) {
            return false
          }
          // First-name check only when RouteOne gave us one.
          if (pn.first) return firstNameMatches(cand.customer_first_name as string, pn.first)
          return true
        })

        if (survivors.length === 1) {
          dealId = survivors[0].id as string
          currentPipeline = (survivors[0].pipeline_state as string | undefined) ?? null
        }
      }
    }

    if (!dealId) {
      unmatchedRows.push({
        customerName: c.customerName ?? null,
        routeoneDealId: c.routeoneDealId,
        lenderName: c.fundingLenderName ?? null,
        status: c.fundingStatus ?? null,
      })
      continue
    }

    // c. Lender catalog match via the shared matcher (exact, then prefix). Raw
    //    text is ALWAYS stored for provenance; lender_id is set only on a match
    //    (RouteOne is the source of truth for the funding lender, so a match
    //    overwrites any prior lender_id). Never null an existing lender_id.
    const rawLender = c.fundingLenderName?.trim() || null
    let matchedLenderId: string | null = null
    if (rawLender) {
      const r = matchLenderByName(rawLender, lenderRows)
      if (r.matched) matchedLenderId = r.lenderId
    }

    // Always-write fields: the match key, the two NOT NULL booleans, and the
    // sync timestamp. Everything else is null-skip so a partial re-sync doesn't
    // clobber existing data.
    const update: Record<string, unknown> = {
      routeone_deal_id: c.routeoneDealId,
      routeone_has_unread_message: c.hasUnreadMessage,
      routeone_is_dsp_originated: c.isDspOriginated,
      routeone_last_synced_at: new Date().toISOString(),
      // RouteOne deals are financed by definition — set it unconditionally so a
      // prior cash mis-classification can't survive (D-routeone-explicit).
      payment_method: "financed",
    }
    setIfPresent(update, "routeone_contract_number", c.contractNumber)
    setIfPresent(update, "routeone_funding_lender_name", rawLender)
    setIfPresent(update, "routeone_funding_status", c.fundingStatus)
    setIfPresent(update, "routeone_amount_financed", c.amountFinanced)
    setIfPresent(update, "routeone_reserve_amount", c.reserveAmount)
    setIfPresent(update, "routeone_net_proceeds", c.netProceeds)
    setIfPresent(update, "routeone_contract_date", toContractDate(c.contractDate))
    setIfPresent(update, "routeone_funding_age_days", c.fundingAgeDays)

    // Canonical fields (authoritative — intentionally NOT null-skip, from 3.2.2):
    // RouteOne owns the funded amount, the funding lender, and pipeline advance.
    if (matchedLenderId) update.lender_id = matchedLenderId
    if (c.amountFinanced != null) update.amount_financed = c.amountFinanced
    const nextState = c.fundingStatus
      ? nextPipelineFromRouteone(currentPipeline, c.fundingStatus)
      : null
    if (nextState) update.pipeline_state = nextState

    const { error } = await supabase
      .from("deals")
      .update(update)
      .eq("id", dealId)
      .eq("dealership_id", dealershipId)

    if (error) {
      erroredRows.push({
        routeoneDealId: c.routeoneDealId,
        customerName: c.customerName ?? null,
        error: error.message,
      })
    } else {
      matched++
      await emitContractManagerEvents(supabase, dealId, dealershipId, c)
    }
  }

  // Refresh the triage CIT section + deals list to reflect synced funding state.
  if (matched > 0) {
    revalidatePath("/")
    revalidatePath("/deals")
  }

  return NextResponse.json({
    matched,
    unmatched: unmatchedRows.length,
    unmatchedRows,
    errored: erroredRows.length,
    erroredRows,
  })
}

// Contract Manager row date (YYYY-MM-DD) → ISO timestamp; falls back to now when
// the row has no parseable date. Used as the event_at so a later booked event
// chronologically post-dates an earlier contract_returned (recovery logic).
function cmEventAt(contractDate: string | null | undefined): string {
  if (contractDate) {
    const t = Date.parse(`${contractDate}T00:00:00Z`)
    if (!Number.isNaN(t)) return new Date(t).toISOString()
  }
  return new Date().toISOString()
}

// Emit the deal_events implied by a matched Contract Manager row. Idempotent via
// externalId. CM only owns submitted (deal is in funding, once ever) and
// returned (carries the row date so a re-rejection on a later date records a
// fresh transition). Booked/funded come exclusively from the Decision Summary
// scraper (D-scrape-source) — CM's status cell stays sticky on "Contract
// Rejected" even after a later booking, so it can't be trusted for recovery.
async function emitContractManagerEvents(
  supabase: ReturnType<typeof createServiceRoleClient>,
  dealId: string,
  dealershipId: string,
  c: z.infer<typeof contractSchema>
): Promise<void> {
  const eventAt = cmEventAt(c.contractDate)
  const dateSuffix = c.contractDate ?? "nodate"
  const emit = (eventType: "contract_submitted" | "contract_returned", externalId: string) =>
    recordDealEvent({
      supabase,
      dealId,
      dealershipId,
      eventType,
      source: "routeone_contract_manager",
      eventAt,
      externalId,
    })

  await emit("contract_submitted", `routeone_cm:${c.routeoneDealId}:submitted`)

  if (c.contractReturned) {
    await emit("contract_returned", `routeone_cm:${c.routeoneDealId}:returned:${dateSuffix}`)
  }
}
