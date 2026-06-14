import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DealsTable } from "./_components/deals-table"
import { DEAL_SELECT, type Deal, type LenderOption } from "./deal-schema"

const DEAL_ROLES = ["owner", "manager", "finance_manager"]

export default async function DealsPage() {
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

  const canMutate = DEAL_ROLES.includes(profile?.role ?? "")

  // Active deals: everything except the terminal states. RLS scopes by tenant
  // and (for finance managers) created_by. deleted_at filtered at the app layer.
  const { data: deals } = await supabase
    .from("deals")
    .select(DEAL_SELECT)
    .not("pipeline_state", "in", "(funded,unwound)")
    .is("deleted_at", null)
    .order("sold_date", { ascending: false })
    .returns<Deal[]>()

  // Active lenders for the form's Select + create-time pre-fill.
  const { data: lenders } = await supabase
    .from("lenders")
    .select("id, name, requires_physical_contract, common_required_stips")
    .is("deleted_at", null)
    .order("name", { ascending: true })
    .returns<LenderOption[]>()

  return (
    <div className="min-h-screen bg-background px-6 py-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="space-y-1">
          <h1 className="text-2xl font-semibold">Active deals</h1>
          <p className="text-muted-foreground">
            Deals still working through the funding pipeline. Funded and unwound
            deals drop off this list.
          </p>
        </header>

        <DealsTable
          deals={deals ?? []}
          lenders={lenders ?? []}
          canMutate={canMutate}
        />
      </div>
    </div>
  )
}
