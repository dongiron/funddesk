import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { LenderTable } from "./_components/lender-table"
import type { Lender } from "./lender-schema"

const LENDER_COLUMNS =
  "id, name, communication_platform, typical_days_clean, overdue_threshold_days, " +
  "clears_stips_upfront, does_welcome_calls, does_employment_verification, " +
  "can_increase_lender_fee, accepts_esign, requires_physical_contract, " +
  "common_required_stips, commonly_ghosted_stips, operator_notes"

export default async function LendersPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  // Role decides whether mutation controls render. RLS enforces it server-side
  // regardless; hiding the controls just avoids guaranteed-to-fail actions.
  const { data: profile } = await supabase
    .from("users")
    .select("role")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single()

  const canManage = profile?.role === "owner" || profile?.role === "manager"

  // RLS scopes to the caller's dealership; the explicit deleted_at filter matches
  // the SELECT policy. No dealership_id in the query — RLS owns tenant scoping.
  const { data: lenders } = await supabase
    .from("lenders")
    .select(LENDER_COLUMNS)
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<Lender[]>()

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-6xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Lenders</h1>
          <p className="text-muted-foreground">
            The banks you submit deals to and how each one behaves.
          </p>
        </header>

        <LenderTable lenders={lenders ?? []} canManage={canManage} />
      </div>
    </div>
  )
}
