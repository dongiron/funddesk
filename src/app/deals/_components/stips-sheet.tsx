"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import { stipsMatch } from "../deal-schema"
import { updateDealStips } from "../actions"
import { StipsChecklist } from "./stips-checklist"
import { Button } from "@/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type StipsSheetDeal = {
  id: string
  customer_first_name: string | null
  customer_last_name: string | null
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  lender: { name: string } | null
  stips_required: string[]
  stips_received: string[]
}

function vehicleTitle(d: StipsSheetDeal): string {
  return (
    [d.vehicle_year, d.vehicle_make, d.vehicle_model]
      .filter(Boolean)
      .join(" ")
      .trim() || "deal"
  )
}
function customerName(d: StipsSheetDeal): string {
  return (
    [d.customer_first_name, d.customer_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}

function StipsSheetBody({
  deal,
  canMutate,
  onClose,
}: {
  deal: StipsSheetDeal
  canMutate: boolean
  onClose: () => void
}) {
  // Seed with the promoted (effective) required list so saving from here
  // persists any legacy received-not-required entries.
  const initialRequired = useMemo(() => {
    const result = [...deal.stips_required]
    for (const r of deal.stips_received) {
      if (!result.some((x) => stipsMatch(x, r))) result.push(r)
    }
    return result
  }, [deal])

  const [required, setRequired] = useState(initialRequired)
  const [received, setReceived] = useState(deal.stips_received)
  const [saving, setSaving] = useState(false)

  async function save() {
    setSaving(true)
    const result = await updateDealStips(deal.id, {
      stips_required: required,
      stips_received: received,
    })
    setSaving(false)
    if (result.ok) {
      toast.success("Stips updated.")
      onClose()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="space-y-4 px-4 pb-6">
      <StipsChecklist
        stips_required={required}
        stips_received={received}
        onChange={(next) => {
          setRequired(next.stips_required)
          setReceived(next.stips_received)
        }}
        disabled={!canMutate}
      />
      {canMutate && (
        <SheetFooter>
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </SheetFooter>
      )}
    </div>
  )
}

export function StipsSheet({
  deal,
  open,
  onOpenChange,
  canMutate,
}: {
  deal: StipsSheetDeal | null
  open: boolean
  onOpenChange: (open: boolean) => void
  canMutate: boolean
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {deal ? `Stips for ${vehicleTitle(deal)}` : "Stips"}
          </SheetTitle>
          <SheetDescription>
            {deal
              ? `${customerName(deal)} · ${deal.lender?.name ?? "—"}`
              : "Track required and received stips."}
          </SheetDescription>
        </SheetHeader>
        {/* keyed so each open re-seeds from that deal */}
        {deal && (
          <StipsSheetBody
            key={deal.id}
            deal={deal}
            canMutate={canMutate}
            onClose={() => onOpenChange(false)}
          />
        )}
      </SheetContent>
    </Sheet>
  )
}
