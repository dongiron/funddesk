import type { SupabaseClient } from "@supabase/supabase-js"
import {
  TERMINAL_STATES,
  type DealEventSource,
  type DealEventType,
} from "@/app/deals/deal-schema"

// Event-sourced audit trail (Slice 3.8.3). Shared by the extension sync routes
// (service-role client) and the manual server action (cookie/RLS client) — the
// caller supplies whichever client, and recordDealEvent stays agnostic.

type RecordDealEventOpts = {
  supabase: SupabaseClient
  dealId: string
  dealershipId: string
  eventType: DealEventType
  source: DealEventSource
  eventAt: string // ISO timestamp
  description?: string | null
  metadata?: unknown
  externalId?: string | null
  createdBy?: string | null
}

// Insert an event idempotently. External-source events carry an externalId and
// are deduplicated by the partial unique index (deal_id, event_type, source,
// external_id); a duplicate surfaces as Postgres 23505, which we treat as a
// no-op skip. Manual events (externalId null) always insert. Funding status is
// re-derived afterward either way.
export async function recordDealEvent(
  opts: RecordDealEventOpts
): Promise<{ inserted: boolean }> {
  const row: Record<string, unknown> = {
    deal_id: opts.dealId,
    dealership_id: opts.dealershipId,
    event_type: opts.eventType,
    source: opts.source,
    event_at: opts.eventAt,
    description: opts.description ?? null,
    metadata: opts.metadata ?? null,
    external_id: opts.externalId ?? null,
    created_by: opts.createdBy ?? null,
  }

  let inserted = false
  const { error } = await opts.supabase.from("deal_events").insert(row)
  if (!error) {
    inserted = true
  } else if (error.code === "23505") {
    inserted = false // idempotent duplicate of an already-recorded event
  } else {
    console.error("[deal-events] insert failed:", error.code, error.message)
  }

  await deriveFundingStatus(opts.supabase, opts.dealId)
  return { inserted }
}

// Recompute the deal's funding_status pill from its event history, using the
// latest event_at per relevant type so a returned→booked recovery flips back to
// clean automatically (the booked event post-dates the return).
export async function deriveFundingStatus(
  supabase: SupabaseClient,
  dealId: string
): Promise<void> {
  const { data: events } = await supabase
    .from("deal_events")
    .select("event_type, event_at")
    .eq("deal_id", dealId)
  const rows = (events ?? []) as { event_type: string; event_at: string }[]

  const latest = (type: string): number | null => {
    let max: number | null = null
    for (const r of rows) {
      if (r.event_type !== type) continue
      const t = Date.parse(r.event_at)
      if (Number.isNaN(t)) continue
      if (max === null || t > max) max = t
    }
    return max
  }
  const fundedAt = latest("funded")
  const bookedAt = latest("booked")
  const returnedAt = latest("contract_returned")

  let status: "clean" | "returned" | "rejected" | null
  if (fundedAt !== null) {
    status = "clean"
  } else if (returnedAt !== null && (bookedAt === null || returnedAt >= bookedAt)) {
    status = "returned"
  } else if (bookedAt !== null) {
    status = "clean"
  } else {
    status = null
  }

  const update: Record<string, unknown> = {
    funding_status: status,
    funding_status_updated_at: new Date().toISOString(),
  }

  // Auto-advance to funded only for a non-terminal financed deal (D-pipeline-
  // auto-advance). Cash deals never reach funding-funded; terminal states are
  // deliberate and must not regress.
  if (fundedAt !== null) {
    const { data: dealRow } = await supabase
      .from("deals")
      .select("payment_method, pipeline_state")
      .eq("id", dealId)
      .maybeSingle()
    const d = dealRow as { payment_method: string; pipeline_state: string } | null
    if (
      d &&
      d.payment_method !== "cash" &&
      !(TERMINAL_STATES as readonly string[]).includes(d.pipeline_state)
    ) {
      update.pipeline_state = "funded"
    }
  }

  await supabase.from("deals").update(update).eq("id", dealId)
}
