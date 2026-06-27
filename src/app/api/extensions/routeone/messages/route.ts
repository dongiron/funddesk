// ============================================================
// POST /api/extensions/routeone/messages
// ============================================================
// Stores RouteOne lender text messages scraped from one deal's "View Related
// Text Messages" modal (Slice 3.8.4a). No native message IDs exist, so each row
// is deduplicated by a server-computed content hash, unique per deal.
//
// SECURITY INVARIANT — service-role client, BYPASSES RLS. EVERY query MUST filter
// by the `dealershipId` from the validated token. Never creates deals.
// ============================================================

import { NextResponse } from "next/server"
import { revalidatePath } from "next/cache"
import { createHash } from "crypto"
import { z } from "zod"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import {
  parseCustomerName,
  extractLastWord,
  firstNameMatches,
} from "@/lib/routeone-match"

const messageSchema = z.object({
  routeoneAppNumber: z.string().nullable().optional(),
  senderName: z.string().min(1),
  body: z.string().min(1),
  receivedAt: z.string().min(1), // ISO, parsed browser-side
})

const bodySchema = z.object({
  dealMatch: z.object({
    routeoneDealId: z.string().nullable().optional(),
    applicantName: z.string().nullable().optional(),
  }),
  messages: z.array(messageSchema),
})

type MatchedDeal = { id: string; routeone_deal_id: string | null }

export async function POST(request: Request) {
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { dealershipId } = ctx

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
  const { dealMatch, messages } = parsed.data

  const supabase = createServiceRoleClient()

  // Match the deal: exact routeone_deal_id, then fuzzy applicant-name fallback.
  let deal: MatchedDeal | null = null
  const wantedId = dealMatch.routeoneDealId?.trim()
  if (wantedId) {
    const { data } = await supabase
      .from("deals")
      .select("id, routeone_deal_id")
      .eq("dealership_id", dealershipId)
      .eq("routeone_deal_id", wantedId)
      .is("deleted_at", null)
      .limit(1)
    if (data && data.length > 0) deal = data[0] as MatchedDeal
  }
  if (!deal && dealMatch.applicantName) {
    const pn = parseCustomerName(dealMatch.applicantName)
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
    return NextResponse.json({ matched: 0, inserted: 0 })
  }

  if (messages.length === 0) {
    return NextResponse.json({ matched: 1, inserted: 0 })
  }

  // Content hash dedups identical messages per deal. Keyed on the stable scraped
  // app id (falling back to our stored id) + sender + timestamp + body prefix.
  const hashKey = dealMatch.routeoneDealId?.trim() || deal.routeone_deal_id || deal.id
  const rows = messages.map((m) => ({
    deal_id: deal!.id,
    dealership_id: dealershipId,
    sender_name: m.senderName,
    subject: null,
    body: m.body,
    received_at: m.receivedAt,
    routeone_app_number: m.routeoneAppNumber ?? null,
    content_hash: createHash("sha256")
      .update(`${hashKey}|${m.senderName}|${m.receivedAt}|${m.body.slice(0, 200)}`)
      .digest("hex"),
  }))

  const { data: insertedRows, error } = await supabase
    .from("lender_messages")
    .upsert(rows, { onConflict: "deal_id,content_hash", ignoreDuplicates: true })
    .select("id")

  if (error) {
    return NextResponse.json({ error: "Could not save messages." }, { status: 500 })
  }

  const inserted = insertedRows?.length ?? 0
  if (inserted > 0) revalidatePath("/")

  return NextResponse.json({ matched: 1, inserted })
}
