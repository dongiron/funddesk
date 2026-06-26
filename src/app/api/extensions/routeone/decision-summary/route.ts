// ============================================================
// POST /api/extensions/routeone/decision-summary
// ============================================================
// Authoritative source for booked/funded deal events. The RouteOne Decision
// Summary's Decision History table reflects the true funding state even when the
// Contract Manager status cell stays sticky on "Contract Rejected" after a later
// booking — so this, not the CM sync, owns booked/funded (Slice 3.8.3.1).
//
// SECURITY INVARIANT — service-role client, BYPASSES RLS. EVERY query MUST filter
// by the `dealershipId` from the validated token. Never creates deals.
// ============================================================

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { recordDealEvent } from "@/lib/deal-events"
import {
  parseCustomerName,
  extractLastWord,
  firstNameMatches,
} from "@/lib/routeone-match"

const decisionSchema = z.object({
  decisionNumber: z.number(),
  eventAt: z.string().min(1), // ISO, parsed browser-side
  statusRaw: z.string(),
  eventType: z.enum(["booked", "funded"]),
})

const bodySchema = z.object({
  applicant: z.string().nullable().optional(),
  routeoneAppNumber: z.string().nullable().optional(),
  fsAppNumber: z.string().nullable().optional(),
  decisions: z.array(decisionSchema).min(1),
})

type MatchedDeal = {
  id: string
  routeone_deal_id: string | null
}

export async function POST(request: Request) {
  // 1. Authenticate.
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { dealershipId } = ctx

  // 2. Parse + validate.
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
  const body = parsed.data

  const supabase = createServiceRoleClient()

  // 3. Match the deal. Prefer an exact routeone_deal_id match against either app
  //    identifier on the page; fall back to fuzzy applicant-name match (same
  //    "Last, First" tightening as the Contract Manager sync).
  let deal: MatchedDeal | null = null

  const ids = [body.fsAppNumber, body.routeoneAppNumber]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s)
  if (ids.length > 0) {
    const { data } = await supabase
      .from("deals")
      .select("id, routeone_deal_id")
      .eq("dealership_id", dealershipId)
      .in("routeone_deal_id", ids)
      .is("deleted_at", null)
      .limit(1)
    if (data && data.length > 0) deal = data[0] as MatchedDeal
  }

  if (!deal && body.applicant) {
    const pn = parseCustomerName(body.applicant)
    const lastWord = pn ? extractLastWord(pn.last) : ""
    if (pn && lastWord) {
      const { data: candidates } = await supabase
        .from("deals")
        .select("id, routeone_deal_id, customer_first_name, customer_last_name")
        .eq("dealership_id", dealershipId)
        .is("deleted_at", null)
        .ilike("customer_last_name", `%${lastWord}%`)
        .limit(10)

      const target = lastWord.toLowerCase()
      const survivors = (candidates ?? []).filter((c) => {
        if (extractLastWord(c.customer_last_name as string).toLowerCase() !== target) {
          return false
        }
        if (pn.first) return firstNameMatches(c.customer_first_name as string, pn.first)
        return true
      })
      if (survivors.length === 1) deal = survivors[0] as MatchedDeal
    }
  }

  if (!deal) {
    return NextResponse.json({ matched: 0, inserted: 0, eventTypes: [] })
  }

  // 4. Record each booked/funded decision (idempotent via externalId). A matched-
  //    by-name deal may have no routeone_deal_id yet — fall back to its UUID so the
  //    dedup key is still stable.
  const dedupKey = deal.routeone_deal_id || deal.id
  let inserted = 0
  const eventTypes = new Set<string>()
  for (const d of body.decisions) {
    const { inserted: ins } = await recordDealEvent({
      supabase,
      dealId: deal.id,
      dealershipId,
      eventType: d.eventType,
      source: "routeone_decision_summary",
      eventAt: d.eventAt,
      externalId: `routeone_ds:${dedupKey}:${d.decisionNumber}`,
      metadata: { statusRaw: d.statusRaw, decisionNumber: d.decisionNumber },
    })
    if (ins) inserted++
    eventTypes.add(d.eventType)
  }

  if (inserted > 0) {
    revalidatePath("/")
    revalidatePath("/deals")
  }

  return NextResponse.json({ matched: 1, inserted, eventTypes: [...eventTypes] })
}
