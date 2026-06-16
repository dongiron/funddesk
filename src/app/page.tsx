import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import {
  DEAL_SELECT,
  daysSinceSold,
  phoenixToday,
  type Deal,
} from "./deals/deal-schema"
import { BLOCK_SELECT, type DealBlock } from "./deals/block-schema"
import type { BlocksSheetDeal } from "./deals/_components/blocks-sheet"
import {
  TriageDashboard,
  type ActiveRow,
  type ActiveSection,
  type FundedRow,
  type FundedSection,
} from "./_components/triage-dashboard"

const ACTIVE_SELECT =
  "id, customer_first_name, customer_last_name, vehicle_year, vehicle_make, " +
  "vehicle_model, lender_id, pipeline_state, sold_date, amount_financed, " +
  "stips_required, stips_received, lender:lender_id(name, overdue_threshold_days)"

type ActiveDealRow = {
  id: string
  customer_first_name: string | null
  customer_last_name: string | null
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  lender_id: string | null
  pipeline_state: string
  sold_date: string
  amount_financed: number | null
  stips_required: string[]
  stips_received: string[]
  lender: { name: string; overdue_threshold_days: number | null } | null
}

const money = (v: number | null) => Number(v ?? 0)

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

  // Active deals (contracts in transit) + the lender fields the overdue rule needs.
  const { data: activeData } = await supabase
    .from("deals")
    .select(ACTIVE_SELECT)
    .not("pipeline_state", "in", "(funded,unwound)")
    .is("deleted_at", null)
    .returns<ActiveDealRow[]>()
  const activeDeals = activeData ?? []
  const dealIds = activeDeals.map((d) => d.id)

  // Recently funded (last 30 days, Phoenix). Full columns for the read-only form.
  const fundedCutoff = new Date(Date.parse(phoenixToday()) - 30 * 86_400_000)
    .toISOString()
    .slice(0, 10)
  const { data: fundedData } = await supabase
    .from("deals")
    .select(DEAL_SELECT)
    .eq("pipeline_state", "funded")
    .gte("funded_date", fundedCutoff)
    .is("deleted_at", null)
    .order("funded_date", { ascending: false })
    .returns<Deal[]>()
  const fundedDeals = fundedData ?? []

  // All blocks for the active deals — active subset drives sections, full set
  // feeds the reused Blocks Sheet.
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

  // Classify each active deal into exactly one section (top match wins).
  const overdueRows: ActiveRow[] = []
  const actionRows: ActiveRow[] = []
  const cleanRows: ActiveRow[] = []
  let inTransitTotal = 0
  let overdueTotal = 0

  for (const d of activeDeals) {
    const allBlocks = blocksByDeal[d.id] ?? []
    const activeBlocks = allBlocks.filter((b) => b.resolved_at === null)

    const hasChaseStip = activeBlocks.some(
      (b) => b.block_type === "chase_customer_stip"
    )
    const stipDiff = d.stips_required.length - d.stips_received.length
    const missingStipsCount = stipDiff > 0 && !hasChaseStip ? stipDiff : 0
    const actionNeeded = activeBlocks.length > 0 || missingStipsCount > 0

    const threshold = d.lender?.overdue_threshold_days ?? null
    const daysSold = daysSinceSold(d.sold_date)
    const isOverdue = threshold != null && daysSold > threshold
    const daysOverdue = isOverdue ? daysSold - threshold : 0

    const amount = money(d.amount_financed)
    inTransitTotal += amount
    if (isOverdue) overdueTotal += amount // any active overdue deal, any section

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
    const row: ActiveRow = {
      deal,
      blocks: allBlocks,
      amountFinanced: d.amount_financed,
      daysSinceSold: daysSold,
      activeBlocks,
      isOverdue,
      daysOverdue,
      missingStipsCount,
    }

    if (actionNeeded) actionRows.push(row)
    else if (isOverdue) overdueRows.push(row)
    else cleanRows.push(row)
  }

  // Longest-waiting first within active sections (sold_date asc).
  const byOldest = (a: ActiveRow, b: ActiveRow) =>
    b.daysSinceSold - a.daysSinceSold
  overdueRows.sort(byOldest)
  actionRows.sort(byOldest)
  cleanRows.sort(byOldest)

  const toSection = (deals: ActiveRow[]): ActiveSection => ({
    deals,
    count: deals.length,
    total: deals.reduce((s, r) => s + money(r.amountFinanced), 0),
  })

  const fundedRows: FundedRow[] = fundedDeals.map((d) => ({
    deal: d,
    daysAgo: d.funded_date ? daysSinceSold(d.funded_date) : 0,
    amountFinanced: d.amount_financed,
  }))
  const funded: FundedSection = {
    deals: fundedRows,
    count: fundedRows.length,
    total: fundedRows.reduce((s, r) => s + money(r.amountFinanced), 0),
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <header>
          <h1 className="text-2xl font-semibold">Triage</h1>
        </header>

        <TriageDashboard
          overdue={toSection(overdueRows)}
          action={toSection(actionRows)}
          clean={toSection(cleanRows)}
          funded={funded}
          inTransitTotal={inTransitTotal}
          overdueTotal={overdueTotal}
          currentUserRole={currentUserRole}
          userNames={userNames}
        />
      </div>
    </div>
  )
}
