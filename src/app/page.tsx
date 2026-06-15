import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { daysSinceSold } from "./deals/deal-schema"
import { BLOCK_SELECT, blockCategory, type DealBlock } from "./deals/block-schema"
import type { BlocksSheetDeal } from "./deals/_components/blocks-sheet"
import { TriageDashboard, type TriageRow } from "./_components/triage-dashboard"

const DASHBOARD_SELECT =
  "id, customer_first_name, customer_last_name, vehicle_year, vehicle_make, " +
  "vehicle_model, lender_id, pipeline_state, sold_date, submitted_to_lender_date, " +
  "stips_required, stips_received, lender:lender_id(name, overdue_threshold_days)"

type DashRow = {
  id: string
  customer_first_name: string | null
  customer_last_name: string | null
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  lender_id: string | null
  pipeline_state: string
  sold_date: string
  submitted_to_lender_date: string | null
  stips_required: string[]
  stips_received: string[]
  lender: { name: string; overdue_threshold_days: number | null } | null
}

// Highest-priority tier the deal qualifies for (1 = most urgent).
function tierOf(r: TriageRow): number {
  if (r.activeBlocks.some((b) => blockCategory(b.block_type) === "I fix")) return 1
  if (r.activeBlocks.some((b) => blockCategory(b.block_type) === "Chase")) return 2
  if (r.isOverdue) return 3
  if (r.missingStipsCount > 0) return 4
  if (r.activeBlocks.some((b) => blockCategory(b.block_type) === "Lender")) return 5
  return 6
}

export default async function Home() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single()
  const currentUserRole = profile?.role ?? ""

  // Active deals + the lender fields we need for the overdue signal.
  const { data: dealsData } = await supabase
    .from("deals")
    .select(DASHBOARD_SELECT)
    .not("pipeline_state", "in", "(funded,unwound)")
    .is("deleted_at", null)
    .order("sold_date", { ascending: false })
    .returns<DashRow[]>()
  const activeDeals = dealsData ?? []
  const dealIds = activeDeals.map((d) => d.id)

  // All blocks (active + resolved) for the visible deals — active subset drives
  // signals, the full set feeds the reused Blocks Sheet.
  const blocksByDeal: Record<string, DealBlock[]> = {}
  if (dealIds.length > 0) {
    const { data: blocks } = await supabase
      .from("deal_blocks")
      .select(BLOCK_SELECT)
      .in("deal_id", dealIds)
      .order("opened_at", { ascending: false })
      .returns<DealBlock[]>()
    for (const b of blocks ?? []) {
      ;(blocksByDeal[b.deal_id] ??= []).push(b)
    }
  }

  // Names for opened_by / resolved_by in the sheet.
  const userNames: Record<string, string> = {}
  const { data: dealershipUsers } = await supabase
    .from("users")
    .select("id, full_name, email")
    .is("deleted_at", null)
    .returns<{ id: string; full_name: string | null; email: string }[]>()
  for (const u of dealershipUsers ?? []) {
    userNames[u.id] = u.full_name || u.email
  }

  // Compute signals and keep only deals that need attention.
  const rows: TriageRow[] = []
  let overdueCount = 0
  let missingStipsDeals = 0

  for (const d of activeDeals) {
    const allBlocks = blocksByDeal[d.id] ?? []
    const activeBlocks = allBlocks.filter((b) => b.resolved_at === null)

    // Overdue (skip lenders with a null threshold per the locked convention).
    const threshold = d.lender?.overdue_threshold_days ?? null
    let isOverdue = false
    let daysOverdue = 0
    if (threshold != null && d.submitted_to_lender_date) {
      const sinceSubmit = daysSinceSold(d.submitted_to_lender_date)
      if (sinceSubmit > threshold) {
        isOverdue = true
        daysOverdue = sinceSubmit - threshold
      }
    }

    // Missing stips — don't double-count when an active chase block exists.
    const hasChaseStip = activeBlocks.some(
      (b) => b.block_type === "chase_customer_stip"
    )
    const stipDiff = d.stips_required.length - d.stips_received.length
    const missingStipsCount = stipDiff > 0 && !hasChaseStip ? stipDiff : 0

    if (activeBlocks.length === 0 && !isOverdue && missingStipsCount === 0) {
      continue
    }
    if (isOverdue) overdueCount++
    if (missingStipsCount > 0) missingStipsDeals++

    const deal: BlocksSheetDeal = {
      id: d.id,
      customer_first_name: d.customer_first_name,
      customer_last_name: d.customer_last_name,
      vehicle_year: d.vehicle_year,
      vehicle_make: d.vehicle_make,
      vehicle_model: d.vehicle_model,
      pipeline_state: d.pipeline_state,
      lender: d.lender ? { name: d.lender.name } : null,
    }
    rows.push({
      deal,
      blocks: allBlocks,
      daysSinceSold: daysSinceSold(d.sold_date),
      activeBlocks,
      isOverdue,
      daysOverdue,
      missingStipsCount,
    })
  }

  // Tiered urgency, then oldest-first within a tier.
  rows.sort((a, b) => {
    const ta = tierOf(a)
    const tb = tierOf(b)
    if (ta !== tb) return ta - tb
    return b.daysSinceSold - a.daysSinceSold
  })

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Triage</h1>
          <p className="text-sm text-muted-foreground">
            {activeDeals.length} active deals · {rows.length} need attention ·{" "}
            {overdueCount} overdue · {missingStipsDeals} with missing stips
          </p>
        </header>

        <TriageDashboard
          rows={rows}
          currentUserRole={currentUserRole}
          userNames={userNames}
        />
      </div>
    </div>
  )
}
