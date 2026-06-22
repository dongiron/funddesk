import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import {
  AGING_BUCKETS,
  DEAL_SELECT,
  agingBucket,
  daysSinceSold,
  dealAgeDays,
  phoenixToday,
  type AgingBucket,
  type Deal,
} from "./deals/deal-schema"
import { BLOCK_SELECT, type DealBlock } from "./deals/block-schema"
import type { BlocksSheetDeal } from "./deals/_components/blocks-sheet"
import type {
  CitAgingRow,
  CitData,
  CitLenderRow,
} from "./deals/_components/cit-section"
import {
  TriageDashboard,
  type ActiveRow,
  type ActiveSection,
  type FundedRow,
  type FundedSection,
  type PipelineDistribution,
  type TriageMetrics,
} from "./_components/triage-dashboard"

const ACTIVE_SELECT =
  "id, customer_first_name, customer_last_name, vehicle_year, vehicle_make, " +
  "vehicle_model, lender_id, pipeline_state, sold_date, amount_financed, " +
  "payment_method, balance_due, signed_at, created_at, customer_business_name, " +
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
  payment_method: string
  balance_due: number | null
  signed_at: string | null
  created_at: string
  customer_business_name: string | null
  stips_required: string[]
  stips_received: string[]
  lender: { name: string; overdue_threshold_days: number | null } | null
}

const money = (v: number | null) => Number(v ?? 0)

const AWAITING_STATES = ["submitted", "awaiting_physical_delivery", "waiting_to_fund"]

function phoenixSubtitle(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Phoenix",
    weekday: "long",
    month: "short",
    day: "numeric",
  }).formatToParts(new Date())
  const get = (t: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === t)?.value ?? ""
  return `${get("weekday")} · ${get("month")} ${get("day")} · phoenix`.toLowerCase()
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

  const { data: activeData } = await supabase
    .from("deals")
    .select(ACTIVE_SELECT)
    .not("pipeline_state", "in", "(funded,payment_cleared,unwound)")
    .is("deleted_at", null)
    .returns<ActiveDealRow[]>()
  const activeDeals = activeData ?? []
  const dealIds = activeDeals.map((d) => d.id)

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

  const userNames: Record<string, string> = {}
  const { data: dealershipUsers } = await supabase
    .from("users")
    .select("id, full_name, email")
    .is("deleted_at", null)
    .returns<{ id: string; full_name: string | null; email: string }[]>()
  for (const u of dealershipUsers ?? []) {
    userNames[u.id] = u.full_name || u.email
  }

  // ── Sections (existing assignment logic, top match wins) ───────────────────
  const overdueRows: ActiveRow[] = []
  const actionRows: ActiveRow[] = []
  const cleanRows: ActiveRow[] = []

  // ── Metrics (independent of section assignment; intentional overlap) ───────
  let inTransitTotal = 0
  let inTransitCount = 0
  let overdueTotal = 0
  let overdueCount = 0
  let overdueMinDays = Infinity
  let overdueMaxDays = 0
  let awaitingTotal = 0
  let awaitingCount = 0

  // ── Pipeline distribution (active states only) ─────────────────────────────
  const dist = { gathering: 0, ready: 0, submitted: 0, waiting: 0, inTransit: 0 }
  let totalAmount = 0

  for (const d of activeDeals) {
    const amount = money(d.amount_financed)
    totalAmount += amount

    // distribution buckets
    if (
      ["signed", "waiting_for_scan", "gathering_paperwork", "gathering_stips"].includes(
        d.pipeline_state
      )
    )
      dist.gathering++
    else if (d.pipeline_state === "ready_to_send") dist.ready++
    else if (["submitted", "awaiting_physical_delivery"].includes(d.pipeline_state))
      dist.submitted++
    else if (d.pipeline_state === "waiting_to_fund") dist.waiting++
    else if (d.pipeline_state === "funds_in_transit") dist.inTransit++

    // metrics
    if (d.pipeline_state === "funds_in_transit") {
      inTransitTotal += amount
      inTransitCount++
    }
    if (AWAITING_STATES.includes(d.pipeline_state)) {
      awaitingTotal += amount
      awaitingCount++
    }

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

    if (isOverdue) {
      overdueTotal += amount
      overdueCount++
      overdueMinDays = Math.min(overdueMinDays, daysOverdue)
      overdueMaxDays = Math.max(overdueMaxDays, daysOverdue)
    }

    const deal: BlocksSheetDeal = {
      id: d.id,
      customer_first_name: d.customer_first_name,
      customer_last_name: d.customer_last_name,
      customer_business_name: d.customer_business_name,
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
      thresholdDays: threshold,
      activeBlocks,
      isOverdue,
      daysOverdue,
      missingStipsCount,
      missingStips:
        missingStipsCount > 0
          ? d.stips_required.filter(
              (s) => !d.stips_received.some((r) => r.toLowerCase() === s.toLowerCase())
            )
          : [],
    }

    if (actionNeeded) actionRows.push(row)
    else if (isOverdue) overdueRows.push(row)
    else cleanRows.push(row)
  }

  const byOldest = (a: ActiveRow, b: ActiveRow) => b.daysSinceSold - a.daysSinceSold
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

  // ── Contracts-in-transit (CIT) aggregates ──────────────────────────────────
  // Aging is measured from signed_at (falling back to created_at). Per-deal
  // amount is balance_due for cash, amount_financed otherwise. "overdue" = 15+
  // days; "critical" = 30+ days (the danger bucket). Cash deals collapse into a
  // single synthetic lender row.
  const agingAgg: Record<AgingBucket, { count: number; amount: number }> = {
    "0-7": { count: 0, amount: 0 },
    "8-14": { count: 0, amount: 0 },
    "15-30": { count: 0, amount: 0 },
    "30+": { count: 0, amount: 0 },
  }
  const lenderAgg = new Map<
    string,
    { label: string; href: string | null; count: number; amount: number; oldest: number }
  >()
  let citAmount = 0
  let citAgeSum = 0
  let citOverdue = 0
  let citCritical = 0

  for (const d of activeDeals) {
    const amount = money(d.payment_method === "cash" ? d.balance_due : d.amount_financed)
    const age = dealAgeDays(d.signed_at, d.created_at)
    const bucket = agingBucket(age)

    citAmount += amount
    citAgeSum += age
    if (age >= 15) citOverdue += amount
    if (age > 30) citCritical += amount
    agingAgg[bucket].count++
    agingAgg[bucket].amount += amount

    let key: string
    let label: string
    let href: string | null
    if (d.payment_method === "cash") {
      key = "__cash__"
      label = "Cash deals"
      href = "/deals?payment_method=cash"
    } else if (d.lender_id) {
      key = d.lender_id
      label = d.lender?.name ?? "—"
      href = `/deals?lender_id=${d.lender_id}`
    } else {
      key = "__unmapped__"
      label = "— unmapped lender"
      href = null
    }
    const row = lenderAgg.get(key) ?? { label, href, count: 0, amount: 0, oldest: 0 }
    row.count++
    row.amount += amount
    row.oldest = Math.max(row.oldest, age)
    lenderAgg.set(key, row)
  }

  const citAging: CitAgingRow[] = AGING_BUCKETS.map((bucket) => ({
    bucket,
    count: agingAgg[bucket].count,
    amount: agingAgg[bucket].amount,
  }))
  const citLenders: CitLenderRow[] = [...lenderAgg.entries()]
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.amount - a.amount)

  const cit: CitData = {
    generatedAt: new Date().toISOString(),
    totalCount: activeDeals.length,
    totalAmount: citAmount,
    avgAge: activeDeals.length ? Math.round(citAgeSum / activeDeals.length) : 0,
    overdueAmount: citOverdue,
    criticalAmount: citCritical,
    aging: citAging,
    lenders: citLenders,
  }

  const metrics: TriageMetrics = {
    inTransit: { total: inTransitTotal, count: inTransitCount },
    overdue: {
      total: overdueTotal,
      count: overdueCount,
      minDays: overdueCount > 0 ? overdueMinDays : 0,
      maxDays: overdueMaxDays,
    },
    awaiting: { total: awaitingTotal, count: awaitingCount },
  }
  const distribution: PipelineDistribution = {
    ...dist,
    totalActive: activeDeals.length,
    totalAmount,
  }

  return (
    <div className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-5xl">
        <TriageDashboard
          subtitle={phoenixSubtitle()}
          metrics={metrics}
          distribution={distribution}
          overdue={toSection(overdueRows)}
          action={toSection(actionRows)}
          clean={toSection(cleanRows)}
          funded={funded}
          cit={cit}
          currentUserRole={currentUserRole}
          userNames={userNames}
        />
      </div>
    </div>
  )
}
