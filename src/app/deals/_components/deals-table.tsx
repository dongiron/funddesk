"use client"

import { useState } from "react"
import {
  ListChecksIcon,
  PencilIcon,
  PlusIcon,
  TriangleAlertIcon,
  Undo2Icon,
} from "lucide-react"
import {
  daysSinceSold,
  PIPELINE_STATE_LABELS,
  type Deal,
  type LenderOption,
} from "../deal-schema"
import type { DealWithBlocks } from "../block-schema"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DealForm } from "./deal-form"
import { UnwindDealDialog } from "./unwind-deal-dialog"
import { BlocksSheet } from "./blocks-sheet"
import { StipsSheet } from "./stips-sheet"

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function fullName(d: Deal): string {
  const name = [d.customer_first_name, d.customer_last_name]
    .filter(Boolean)
    .join(" ")
    .trim()
  return name || "—"
}

function vehicle(d: Deal): string {
  const v = [d.vehicle_year, d.vehicle_make, d.vehicle_model]
    .filter(Boolean)
    .join(" ")
    .trim()
  return v || "—"
}

function activeBlockCount(d: DealWithBlocks): number {
  return d.blocks.filter((b) => b.resolved_at === null).length
}

export function DealsTable({
  deals,
  lenders,
  canMutate,
  blockStats,
  userNames,
}: {
  deals: DealWithBlocks[]
  lenders: LenderOption[]
  canMutate: boolean
  blockStats: { total: number; withBlocks: number }
  userNames: Record<string, string>
}) {
  const [editing, setEditing] = useState<Deal | "create" | null>(null)
  const [unwindTarget, setUnwindTarget] = useState<Deal | null>(null)
  const [blocksTargetId, setBlocksTargetId] = useState<string | null>(null)
  const [stipsTargetId, setStipsTargetId] = useState<string | null>(null)

  const sheetOpen = editing !== null
  const editingDeal = editing === "create" ? undefined : (editing ?? undefined)
  // Derive from the live deals so the sheets reflect fresh data after revalidate.
  const blocksDeal = blocksTargetId
    ? (deals.find((d) => d.id === blocksTargetId) ?? null)
    : null
  const stipsDeal = stipsTargetId
    ? (deals.find((d) => d.id === stipsTargetId) ?? null)
    : null

  return (
    <div className="space-y-4">
      {canMutate && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("create")}>
            <PlusIcon />
            Add deal
          </Button>
        </div>
      )}

      {blockStats.total > 0 && (
        <p className="text-sm text-muted-foreground">
          {blockStats.withBlocks} of {blockStats.total} active deals have blocks.
        </p>
      )}

      {deals.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No active deals.
          {canMutate ? " Add your first one above." : ""}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Customer</TableHead>
                <TableHead>Vehicle</TableHead>
                <TableHead>Lender</TableHead>
                <TableHead>Sold</TableHead>
                <TableHead>State</TableHead>
                <TableHead className="text-right">Days</TableHead>
                <TableHead className="text-right">Financed</TableHead>
                {canMutate && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {deals.map((deal) => (
                <TableRow key={deal.id}>
                  <TableCell className="font-medium">
                    <span className="inline-flex items-center gap-2">
                      {fullName(deal)}
                      {activeBlockCount(deal) > 0 && (
                        <Badge variant="secondary">{activeBlockCount(deal)}</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {vehicle(deal)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {deal.lender?.name ?? "—"}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {deal.sold_date}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {PIPELINE_STATE_LABELS[deal.pipeline_state] ??
                        deal.pipeline_state}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {daysSinceSold(deal.sold_date)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {deal.amount_financed == null
                      ? "—"
                      : currency.format(Number(deal.amount_financed))}
                  </TableCell>
                  {canMutate && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${fullName(deal)}`}
                          onClick={() => setEditing(deal)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Stips for ${fullName(deal)}`}
                          onClick={() => setStipsTargetId(deal.id)}
                        >
                          <ListChecksIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Blocks for ${fullName(deal)}`}
                          onClick={() => setBlocksTargetId(deal.id)}
                        >
                          <TriangleAlertIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Unwind ${fullName(deal)}`}
                          onClick={() => setUnwindTarget(deal)}
                        >
                          <Undo2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-xl"
        >
          <SheetHeader>
            <SheetTitle>
              {editingDeal
                ? `Edit ${fullName(editingDeal)}`
                : "Add deal"}
            </SheetTitle>
            <SheetDescription>
              Capture the deal as signed. You can update its pipeline state as it
              moves toward funding.
            </SheetDescription>
          </SheetHeader>
          {sheetOpen && (
            <DealForm
              deal={editingDeal}
              lenders={lenders}
              onSuccess={() => setEditing(null)}
            />
          )}
        </SheetContent>
      </Sheet>

      <UnwindDealDialog
        deal={unwindTarget}
        onClose={() => setUnwindTarget(null)}
      />

      <BlocksSheet
        deal={blocksDeal}
        blocks={blocksDeal?.blocks ?? []}
        canMutate={canMutate}
        userNames={userNames}
        open={blocksDeal !== null}
        onOpenChange={(o) => {
          if (!o) setBlocksTargetId(null)
        }}
      />

      <StipsSheet
        deal={stipsDeal}
        canMutate={canMutate}
        open={stipsDeal !== null}
        onOpenChange={(o) => {
          if (!o) setStipsTargetId(null)
        }}
      />
    </div>
  )
}
