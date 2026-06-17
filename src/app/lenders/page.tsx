import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LenderTable } from "./_components/lender-table"
import type { Lender } from "./lender-schema"

const LENDER_COLUMNS =
  "id, name, communication_platform, typical_days_clean, overdue_threshold_days, " +
  "clears_stips_upfront, does_welcome_calls, does_employment_verification, " +
  "can_increase_lender_fee, accepts_esign, requires_physical_contract, " +
  "days_to_bank_after_funding, common_required_stips, commonly_ghosted_stips, " +
  "operator_notes"

export default async function LendersPage() {
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
  const canManage = profile?.role === "owner" || profile?.role === "manager"

  const { data: lenders } = await supabase
    .from("lenders")
    .select(LENDER_COLUMNS)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Lender[]>()

  // Active deals per lender (RLS-scoped) for the "active" column.
  const { data: activeDealRows } = await supabase
    .from("deals")
    .select("lender_id")
    .not("pipeline_state", "in", "(funded,unwound)")
    .is("deleted_at", null)
    .returns<{ lender_id: string | null }[]>()
  const activeCounts: Record<string, number> = {}
  for (const r of activeDealRows ?? []) {
    if (r.lender_id) activeCounts[r.lender_id] = (activeCounts[r.lender_id] ?? 0) + 1
  }

  return (
    <div className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-6xl">
        <LenderTable
          lenders={lenders ?? []}
          canManage={canManage}
          activeCounts={activeCounts}
        />
      </div>
    </div>
  )
}
