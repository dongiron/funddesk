import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { DealsTable } from "./_components/deals-table"
import { DEAL_SELECT, type Deal, type LenderOption } from "./deal-schema"
import {
  BLOCK_SELECT,
  type DealBlock,
  type DealWithBlocks,
} from "./block-schema"

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

  const activeDeals = deals ?? []
  const dealIds = activeDeals.map((d) => d.id)

  // All blocks (active + resolved) for the visible deals, in one query. RLS
  // scopes blocks the same way as deals (finance managers see only their own).
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

  // Names for opened_by / resolved_by display (dealership users, RLS-scoped).
  const userNames: Record<string, string> = {}
  const { data: dealershipUsers } = await supabase
    .from("users")
    .select("id, full_name, email")
    .is("deleted_at", null)
    .returns<{ id: string; full_name: string | null; email: string }[]>()
  for (const u of dealershipUsers ?? []) {
    userNames[u.id] = u.full_name || u.email
  }

  const dealsWithBlocks: DealWithBlocks[] = activeDeals.map((d) => ({
    ...d,
    blocks: blocksByDeal[d.id] ?? [],
  }))

  return (
    <div className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-7xl">
        <DealsTable
          deals={dealsWithBlocks}
          lenders={lenders ?? []}
          canMutate={canMutate}
          userNames={userNames}
        />
      </div>
    </div>
  )
}
