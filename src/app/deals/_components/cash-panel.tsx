"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { relativeTime } from "../block-schema"
import { type Deal } from "../deal-schema"
import { setFundsCleared } from "../actions"
import { FormSection, ToggleRow } from "@/components/ui/form-section"
import { Switch } from "@/components/ui/switch"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const money = (v: number | null) => (v == null ? "—" : usd.format(Number(v)))

// Cash-deal counterpart to the RouteOne funding panel. Renders above the deal
// form for payment_method === "cash". The funds-cleared switch writes via the
// setFundsCleared action (auto-advances awaiting_payment ↔ payment_cleared).
export function CashPanel({ deal }: { deal: Deal }) {
  const router = useRouter()
  const [pending, setPending] = useState(false)

  async function onToggle(checked: boolean) {
    setPending(true)
    const result = await setFundsCleared(deal.id, checked)
    setPending(false)
    if (result.ok) {
      toast.success(checked ? "Funds marked cleared." : "Funds-cleared undone.")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="border-b border-line px-6 py-6">
      <FormSection title="cash">
        <div className="space-y-0.5">
          <div className="font-mono text-[10px] lowercase tracking-wider text-fg-tertiary">
            balance due
          </div>
          <div className="font-mono text-sm text-fg-primary">{money(deal.balance_due)}</div>
        </div>

        <ToggleRow
          label="Funds cleared"
          hint={
            deal.funds_cleared_at
              ? `cleared ${relativeTime(deal.funds_cleared_at)}`
              : undefined
          }
        >
          <Switch
            checked={deal.funds_cleared}
            onCheckedChange={onToggle}
            disabled={pending}
          />
        </ToggleRow>
      </FormSection>
    </div>
  )
}
