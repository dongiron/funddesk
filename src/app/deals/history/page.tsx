import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import {
  DEAL_SELECT,
  isRangeValue,
  rangeStartDate,
  type Deal,
  type RangeValue,
} from "../deal-schema"
import { DateRangeFilter } from "./_components/date-range-filter"
import {
  HistoryTabs,
  type FundedSummary,
  type HistoryTab,
  type UnwoundSummary,
} from "./_components/history-tabs"

export default async function DealHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
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
  const isOwner = profile?.role === "owner"

  const { range: rangeParam } = await searchParams
  const range: RangeValue = isRangeValue(rangeParam) ? rangeParam : "all"
  const cutoff = rangeStartDate(range)

  // Unwound is owner-only; the value-add (gross profit lost) lives there.
  const visibleTabs: HistoryTab[] = isOwner ? ["unwound", "funded"] : ["funded"]
  const defaultTab: HistoryTab = isOwner ? "unwound" : "funded"

  // Funded — all roles (RLS scopes finance managers to their own deals).
  let fundedQuery = supabase
    .from("deals")
    .select(DEAL_SELECT)
    .eq("pipeline_state", "funded")
    .is("deleted_at", null)
    .order("funded_date", { ascending: false })
  if (cutoff) fundedQuery = fundedQuery.gte("funded_date", cutoff)
  const { data: fundedData } = await fundedQuery.returns<Deal[]>()
  const fundedDeals = fundedData ?? []

  // Unwound — fetched only for owners (not sent to anyone else).
  let unwoundDeals: Deal[] = []
  if (isOwner) {
    let unwoundQuery = supabase
      .from("deals")
      .select(DEAL_SELECT)
      .eq("pipeline_state", "unwound")
      .is("deleted_at", null)
      .order("unwound_date", { ascending: false })
    if (cutoff) unwoundQuery = unwoundQuery.gte("unwound_date", cutoff)
    const { data } = await unwoundQuery.returns<Deal[]>()
    unwoundDeals = data ?? []
  }

  const fundedTotal = fundedDeals.reduce(
    (sum, d) => sum + Number(d.amount_financed ?? 0),
    0
  )
  const fundedSummary: FundedSummary = {
    total: fundedTotal,
    count: fundedDeals.length,
    avg: fundedDeals.length ? fundedTotal / fundedDeals.length : 0,
  }

  const unwoundTotal = unwoundDeals.reduce(
    (sum, d) => sum + Number(d.unwind_gross_profit ?? 0),
    0
  )
  const unwoundSummary: UnwoundSummary = {
    total: unwoundTotal,
    count: unwoundDeals.length,
    recentReasons: unwoundDeals.slice(0, 5).map((d) => ({
      date: d.unwound_date,
      reason: d.unwind_reason,
      amount: d.unwind_gross_profit,
    })),
  }

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Deal history</h1>
          <p className="text-muted-foreground">
            Funded and unwound deals. Click a row to view the full deal.
          </p>
        </header>

        <DateRangeFilter currentRange={range} />

        <HistoryTabs
          visibleTabs={visibleTabs}
          defaultTab={defaultTab}
          fundedDeals={fundedDeals}
          unwoundDeals={unwoundDeals}
          fundedSummary={fundedSummary}
          unwoundSummary={unwoundSummary}
        />
      </div>
    </div>
  )
}
