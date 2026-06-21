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
import { HistoryTabs, type HistoryTab } from "./_components/history-tabs"

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const sum = (deals: Deal[]) =>
  deals.reduce((s, d) => s + Number(d.amount_financed ?? 0), 0)

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

  const visibleTabs: HistoryTab[] = isOwner ? ["unwound", "funded"] : ["funded"]
  const defaultTab: HistoryTab = isOwner ? "unwound" : "funded"

  // Funded tab also holds cleared cash deals (payment_cleared — the cash analog
  // of funded). Cash deals have no funded_date, so they sort last (nullsFirst:
  // false) and a date-range cutoff naturally limits them to "all time".
  let fundedQuery = supabase
    .from("deals")
    .select(DEAL_SELECT)
    .in("pipeline_state", ["funded", "payment_cleared"])
    .is("deleted_at", null)
    .order("funded_date", { ascending: false, nullsFirst: false })
  if (cutoff) fundedQuery = fundedQuery.gte("funded_date", cutoff)
  const { data: fundedData } = await fundedQuery.returns<Deal[]>()
  const fundedDeals = fundedData ?? []

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

  return (
    <div className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-medium tracking-tight">History</h1>
            <p className="mt-1 text-xs text-fg-secondary">
              <span className="font-mono">{fundedDeals.length}</span> funded ·{" "}
              <span className="font-mono">{usd.format(sum(fundedDeals))}</span>
              {isOwner && (
                <>
                  , + <span className="font-mono">{unwoundDeals.length}</span> unwound ·{" "}
                  <span className="font-mono">{usd.format(sum(unwoundDeals))}</span>
                </>
              )}
            </p>
          </div>
          <DateRangeFilter currentRange={range} />
        </header>

        <HistoryTabs
          visibleTabs={visibleTabs}
          defaultTab={defaultTab}
          fundedDeals={fundedDeals}
          unwoundDeals={unwoundDeals}
        />
      </div>
    </div>
  )
}
