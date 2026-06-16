"use client"

import { useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { BLOCK_TYPE_LABELS, type DealBlock } from "../deals/block-schema"
import type { Deal } from "../deals/deal-schema"
import {
  BlocksSheet,
  type BlocksSheetDeal,
} from "../deals/_components/blocks-sheet"
import { DealForm } from "../deals/_components/deal-form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type ActiveRow = {
  deal: BlocksSheetDeal
  blocks: DealBlock[]
  amountFinanced: number | null
  daysSinceSold: number
  activeBlocks: DealBlock[]
  isOverdue: boolean
  daysOverdue: number
  missingStipsCount: number
}
export type FundedRow = {
  deal: Deal
  daysAgo: number
  amountFinanced: number | null
}
export type ActiveSection = { deals: ActiveRow[]; count: number; total: number }
export type FundedSection = { deals: FundedRow[]; count: number; total: number }

const DEAL_ROLES = ["owner", "manager", "finance_manager"]

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Nameish = { customer_first_name: string | null; customer_last_name: string | null }
type Vehicleish = {
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
}

function fullName(d: Nameish): string {
  return (
    [d.customer_first_name, d.customer_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}
function vehicle(d: Vehicleish): string {
  return (
    [d.vehicle_year, d.vehicle_make, d.vehicle_model]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}

// Uniform neutral chip — distinction comes from the label, never color.
function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border bg-muted/50 px-2 py-0.5 text-xs whitespace-nowrap text-foreground">
      {children}
    </span>
  )
}

function Row({
  onClick,
  name,
  sub,
  chips,
}: {
  onClick: () => void
  name: string
  sub: string
  chips?: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-start justify-between gap-4 px-4 py-3 text-left transition-colors hover:bg-muted/40"
    >
      <div className="space-y-0.5">
        <p className="font-medium">{name}</p>
        <p className="text-sm text-muted-foreground">{sub}</p>
      </div>
      {chips && <div className="flex flex-wrap justify-end gap-1.5">{chips}</div>}
    </button>
  )
}

function SectionShell({
  title,
  count,
  total,
  collapsible = false,
  expanded = true,
  onToggle,
  children,
}: {
  title: string
  count: number
  total: number
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  children: React.ReactNode
}) {
  const header = (
    <div className="flex items-center gap-2 text-sm font-semibold">
      {collapsible && (
        <ChevronDownIcon
          className={`size-4 transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
      )}
      <span>
        {title} ({count}) · {usd.format(total)}
      </span>
    </div>
  )

  return (
    <section className="space-y-2">
      {collapsible ? (
        <button type="button" onClick={onToggle} className="w-full text-left">
          {header}
        </button>
      ) : (
        header
      )}
      {expanded && (
        <div className="divide-y divide-border overflow-hidden rounded-lg border">
          {children}
        </div>
      )}
    </section>
  )
}

export function TriageDashboard({
  overdue,
  action,
  clean,
  funded,
  inTransitTotal,
  overdueTotal,
  currentUserRole,
  userNames,
}: {
  overdue: ActiveSection
  action: ActiveSection
  clean: ActiveSection
  funded: FundedSection
  inTransitTotal: number
  overdueTotal: number
  currentUserRole: string
  userNames: Record<string, string>
}) {
  const [blocksTargetId, setBlocksTargetId] = useState<string | null>(null)
  const [fundedTargetId, setFundedTargetId] = useState<string | null>(null)
  const [cleanExpanded, setCleanExpanded] = useState(false)

  const canMutate = DEAL_ROLES.includes(currentUserRole)

  const allActive = [...overdue.deals, ...action.deals, ...clean.deals]
  const blocksRow = blocksTargetId
    ? (allActive.find((r) => r.deal.id === blocksTargetId) ?? null)
    : null
  const fundedRow = fundedTargetId
    ? (funded.deals.find((r) => r.deal.id === fundedTargetId) ?? null)
    : null

  const isEmpty =
    overdue.count === 0 &&
    action.count === 0 &&
    clean.count === 0 &&
    funded.count === 0

  function activeSub(r: ActiveRow): string {
    return `${vehicle(r.deal)} · ${r.deal.lender?.name ?? "—"} · ${r.daysSinceSold}d since sold`
  }
  // Chips for an active row, gated by which section it's in.
  function activeChips(r: ActiveRow, section: "overdue" | "action" | "clean") {
    if (section === "clean") return null
    return (
      <>
        {section === "action" &&
          r.activeBlocks.map((b) => (
            <Chip key={b.id}>
              {BLOCK_TYPE_LABELS[
                b.block_type as keyof typeof BLOCK_TYPE_LABELS
              ] ?? b.block_type}
            </Chip>
          ))}
        {section === "action" && r.missingStipsCount > 0 && (
          <Chip>{r.missingStipsCount} stips outstanding</Chip>
        )}
        {r.isOverdue && <Chip>Overdue {r.daysOverdue}d</Chip>}
      </>
    )
  }

  return (
    <div className="space-y-6">
      {/* Headline strip */}
      <p className="text-xl font-semibold">
        {usd.format(inTransitTotal)} in transit ·{" "}
        {usd.format(overdueTotal)} overdue
      </p>

      {isEmpty ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          All caught up — no deals in the funding pipeline.
        </p>
      ) : (
        <div className="space-y-6">
          {overdue.count > 0 && (
            <SectionShell title="Overdue" count={overdue.count} total={overdue.total}>
              {overdue.deals.map((r) => (
                <Row
                  key={r.deal.id}
                  onClick={() => setBlocksTargetId(r.deal.id)}
                  name={fullName(r.deal)}
                  sub={activeSub(r)}
                  chips={activeChips(r, "overdue")}
                />
              ))}
            </SectionShell>
          )}

          {action.count > 0 && (
            <SectionShell
              title="Action Needed"
              count={action.count}
              total={action.total}
            >
              {action.deals.map((r) => (
                <Row
                  key={r.deal.id}
                  onClick={() => setBlocksTargetId(r.deal.id)}
                  name={fullName(r.deal)}
                  sub={activeSub(r)}
                  chips={activeChips(r, "action")}
                />
              ))}
            </SectionShell>
          )}

          {clean.count > 0 && (
            <SectionShell
              title="Clean & Waiting"
              count={clean.count}
              total={clean.total}
              collapsible
              expanded={cleanExpanded}
              onToggle={() => setCleanExpanded((v) => !v)}
            >
              {clean.deals.map((r) => (
                <Row
                  key={r.deal.id}
                  onClick={() => setBlocksTargetId(r.deal.id)}
                  name={fullName(r.deal)}
                  sub={activeSub(r)}
                />
              ))}
            </SectionShell>
          )}

          {funded.count > 0 && (
            <SectionShell
              title="Recently Funded"
              count={funded.count}
              total={funded.total}
            >
              {funded.deals.map((r) => (
                <Row
                  key={r.deal.id}
                  onClick={() => setFundedTargetId(r.deal.id)}
                  name={fullName(r.deal)}
                  sub={`${vehicle(r.deal)} · ${r.deal.lender?.name ?? "—"} · ${r.daysAgo}d ago`}
                />
              ))}
            </SectionShell>
          )}
        </div>
      )}

      {/* Active rows → Blocks Sheet */}
      <BlocksSheet
        deal={blocksRow?.deal ?? null}
        blocks={blocksRow?.blocks ?? []}
        canMutate={canMutate}
        userNames={userNames}
        open={blocksRow !== null}
        onOpenChange={(o) => {
          if (!o) setBlocksTargetId(null)
        }}
      />

      {/* Recently Funded rows → read-only deal Sheet */}
      <Sheet
        open={fundedRow !== null}
        onOpenChange={(o) => {
          if (!o) setFundedTargetId(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {fundedRow ? fullName(fundedRow.deal) : "Deal"} — read-only
            </SheetTitle>
            <SheetDescription>Funded deal. Read-only.</SheetDescription>
          </SheetHeader>
          {fundedRow && (
            <DealForm
              deal={fundedRow.deal}
              lenders={[]}
              readOnly
              onSuccess={() => setFundedTargetId(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
