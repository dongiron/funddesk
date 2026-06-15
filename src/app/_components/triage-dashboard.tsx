"use client"

import { useState } from "react"
import { BLOCK_TYPE_LABELS, type DealBlock } from "../deals/block-schema"
import {
  BlocksSheet,
  type BlocksSheetDeal,
} from "../deals/_components/blocks-sheet"

// One dashboard row: the deal (for display + sheet), all its blocks (for the
// sheet), and the pre-computed attention signals (for the chips).
export type TriageRow = {
  deal: BlocksSheetDeal
  blocks: DealBlock[]
  daysSinceSold: number
  activeBlocks: DealBlock[]
  isOverdue: boolean
  daysOverdue: number
  missingStipsCount: number
}

const DEAL_ROLES = ["owner", "manager", "finance_manager"]

function fullName(d: BlocksSheetDeal): string {
  return (
    [d.customer_first_name, d.customer_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}

function vehicle(d: BlocksSheetDeal): string {
  return (
    [d.vehicle_year, d.vehicle_make, d.vehicle_model]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}

// Every signal uses the same neutral chip — distinction comes from the label.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs whitespace-nowrap text-foreground">
      {children}
    </span>
  )
}

export function TriageDashboard({
  rows,
  currentUserRole,
  userNames,
}: {
  rows: TriageRow[]
  currentUserRole: string
  userNames: Record<string, string>
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const canMutate = DEAL_ROLES.includes(currentUserRole)

  const selected = selectedId
    ? (rows.find((r) => r.deal.id === selectedId) ?? null)
    : null

  if (rows.length === 0) {
    return (
      <p className="py-24 text-center text-sm text-muted-foreground">
        All caught up. No deals need attention right now.
      </p>
    )
  }

  return (
    <>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border">
        {rows.map((r) => (
          <li key={r.deal.id}>
            <button
              type="button"
              onClick={() => setSelectedId(r.deal.id)}
              className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40"
            >
              <div className="space-y-0.5">
                <p className="font-medium">{fullName(r.deal)}</p>
                <p className="text-sm text-muted-foreground">
                  {vehicle(r.deal)} · {r.deal.lender?.name ?? "—"} ·{" "}
                  {r.daysSinceSold}d since sold
                </p>
              </div>
              <div className="flex flex-wrap justify-end gap-1.5">
                {r.activeBlocks.map((b) => (
                  <Chip key={b.id}>
                    {BLOCK_TYPE_LABELS[
                      b.block_type as keyof typeof BLOCK_TYPE_LABELS
                    ] ?? b.block_type}
                  </Chip>
                ))}
                {r.isOverdue && <Chip>Overdue {r.daysOverdue}d</Chip>}
                {r.missingStipsCount > 0 && (
                  <Chip>{r.missingStipsCount} stips outstanding</Chip>
                )}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <BlocksSheet
        deal={selected?.deal ?? null}
        blocks={selected?.blocks ?? []}
        canMutate={canMutate}
        userNames={userNames}
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null)
        }}
      />
    </>
  )
}
