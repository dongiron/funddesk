"use client"

import { useState } from "react"
import { ChevronDownIcon, ChevronRightIcon, PlusIcon } from "lucide-react"
import { PIPELINE_STATE_LABELS } from "../deal-schema"
import {
  blockCategory,
  BLOCK_TYPE_LABELS,
  relativeTime,
  type DealBlock,
} from "../block-schema"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { AddBlockForm } from "./add-block-form"
import { ResolveBlockDialog } from "./resolve-block-dialog"

export type BlocksSheetDeal = {
  id: string
  customer_first_name: string | null
  customer_last_name: string | null
  customer_business_name?: string | null
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  pipeline_state: string
  lender: { name: string } | null
}

function dealTitle(deal: BlocksSheetDeal): string {
  const vehicle = [deal.vehicle_year, deal.vehicle_make, deal.vehicle_model]
    .filter(Boolean)
    .join(" ")
    .trim()
  const customer = [deal.customer_first_name, deal.customer_last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  return vehicle || customer || "deal"
}

export function BlocksSheet({
  deal,
  blocks,
  canMutate,
  userNames,
  open,
  onOpenChange,
}: {
  deal: BlocksSheetDeal | null
  blocks: DealBlock[]
  canMutate: boolean
  userNames: Record<string, string>
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [showAddForm, setShowAddForm] = useState(false)
  const [resolvedExpanded, setResolvedExpanded] = useState(false)
  const [resolveTargetId, setResolveTargetId] = useState<string | null>(null)

  const name = (uid: string | null) =>
    (uid && userNames[uid]) || "Unknown"

  const active = blocks.filter((b) => b.resolved_at === null)
  const resolved = blocks.filter((b) => b.resolved_at !== null)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{deal ? `Blocks for ${dealTitle(deal)}` : "Blocks"}</SheetTitle>
          <SheetDescription>
            {deal ? (
              <span className="flex items-center gap-2">
                <Badge variant="secondary">
                  {PIPELINE_STATE_LABELS[deal.pipeline_state] ??
                    deal.pipeline_state}
                </Badge>
                <span>{deal.lender?.name ?? "—"}</span>
              </span>
            ) : (
              "Triage blocks on this deal."
            )}
          </SheetDescription>
        </SheetHeader>

        {deal && (
          <div className="space-y-8 px-6 py-6">
            {/* Active */}
            <section className="space-y-3">
              <div className="flex items-center justify-between border-b border-line pb-2">
                <h3 className="font-mono text-xs lowercase tracking-wider text-fg-tertiary">
                  active <span className="text-fg-primary">({active.length})</span>
                </h3>
                {canMutate && !showAddForm && (
                  <Button size="sm" onClick={() => setShowAddForm(true)}>
                    <PlusIcon />
                    Add block
                  </Button>
                )}
              </div>

              {canMutate && showAddForm && (
                <AddBlockForm
                  dealId={deal.id}
                  onDone={() => setShowAddForm(false)}
                  onCancel={() => setShowAddForm(false)}
                />
              )}

              {active.length === 0 ? (
                <p className="rounded-lg border border-dashed border-line px-4 py-6 text-center text-sm text-fg-tertiary">
                  No active blocks.
                </p>
              ) : (
                <ul className="space-y-2">
                  {active.map((b) => (
                    <li
                      key={b.id}
                      className="space-y-1.5 rounded-lg border border-line bg-surface p-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fg-primary">
                            {BLOCK_TYPE_LABELS[
                              b.block_type as keyof typeof BLOCK_TYPE_LABELS
                            ] ?? b.block_type}
                          </span>
                          <Badge variant="outline">
                            {blockCategory(b.block_type)}
                          </Badge>
                        </div>
                        {canMutate && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setResolveTargetId(b.id)}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                      {b.block_detail && (
                        <p className="text-sm text-fg-secondary">
                          {b.block_detail}
                        </p>
                      )}
                      <p className="font-mono text-xs text-fg-tertiary">
                        opened by {name(b.opened_by)} ·{" "}
                        {relativeTime(b.opened_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Resolved */}
            <section className="space-y-3">
              <button
                type="button"
                onClick={() => setResolvedExpanded((v) => !v)}
                className="flex w-full items-center gap-1 border-b border-line pb-2 font-mono text-xs lowercase tracking-wider text-fg-tertiary transition-colors hover:text-fg-primary"
              >
                {resolvedExpanded ? (
                  <ChevronDownIcon className="size-4" />
                ) : (
                  <ChevronRightIcon className="size-4" />
                )}
                resolved <span className="text-fg-primary">({resolved.length})</span>
              </button>

              {resolvedExpanded &&
                (resolved.length === 0 ? (
                  <p className="px-1 text-sm text-fg-tertiary">
                    Nothing resolved yet.
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {resolved.map((b) => (
                      <li
                        key={b.id}
                        className="space-y-1.5 rounded-lg border border-line bg-surface p-3 opacity-60"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-fg-primary">
                            {BLOCK_TYPE_LABELS[
                              b.block_type as keyof typeof BLOCK_TYPE_LABELS
                            ] ?? b.block_type}
                          </span>
                          <Badge variant="outline">
                            {blockCategory(b.block_type)}
                          </Badge>
                        </div>
                        {b.block_detail && (
                          <p className="text-sm text-fg-secondary">
                            {b.block_detail}
                          </p>
                        )}
                        {b.resolution_note && (
                          <p className="text-sm text-fg-primary">
                            Resolution: {b.resolution_note}
                          </p>
                        )}
                        <p className="font-mono text-xs text-fg-tertiary">
                          resolved by {name(b.resolved_by)} ·{" "}
                          {relativeTime(b.resolved_at)}
                        </p>
                        <p className="font-mono text-xs text-fg-tertiary">
                          opened {relativeTime(b.opened_at)}
                        </p>
                      </li>
                    ))}
                  </ul>
                ))}
            </section>
          </div>
        )}

        <ResolveBlockDialog
          blockId={resolveTargetId}
          open={resolveTargetId !== null}
          onOpenChange={(o) => {
            if (!o) setResolveTargetId(null)
          }}
        />
      </SheetContent>
    </Sheet>
  )
}
