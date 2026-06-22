"use client"

import { useEffect, useState } from "react"
import { ChevronDownIcon } from "lucide-react"
import { BLOCK_TYPE_LABELS, type DealBlock } from "../deals/block-schema"
import { displayName, type Deal } from "../deals/deal-schema"
import {
  BlocksSheet,
  type BlocksSheetDeal,
} from "../deals/_components/blocks-sheet"
import { DealForm } from "../deals/_components/deal-form"
import { CitSection, type CitData } from "../deals/_components/cit-section"
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
  thresholdDays: number | null
  activeBlocks: DealBlock[]
  isOverdue: boolean
  daysOverdue: number
  missingStipsCount: number
  missingStips: string[]
}
export type FundedRow = {
  deal: Deal
  daysAgo: number
  amountFinanced: number | null
}
export type ActiveSection = { deals: ActiveRow[]; count: number; total: number }
export type FundedSection = { deals: FundedRow[]; count: number; total: number }
export type TriageMetrics = {
  inTransit: { total: number; count: number }
  overdue: { total: number; count: number; minDays: number; maxDays: number }
  awaiting: { total: number; count: number }
}
export type PipelineDistribution = {
  gathering: number
  ready: number
  submitted: number
  waiting: number
  inTransit: number
  totalActive: number
  totalAmount: number
}

const DEAL_ROLES = ["owner", "manager", "finance_manager"]
const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

type Nameish = {
  customer_first_name: string | null
  customer_last_name: string | null
  customer_business_name?: string | null
}
type Vehicleish = {
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
}
function fullName(d: Nameish): string {
  return displayName(d)
}
function vehicle(d: Vehicleish): string {
  return [d.vehicle_year, d.vehicle_make, d.vehicle_model].filter(Boolean).join(" ").trim() || "—"
}

function MetricCard({
  label,
  value,
  sub,
  valueClass = "text-fg-primary",
}: {
  label: string
  value: string
  sub: string
  valueClass?: string
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="mb-3 font-mono text-xs lowercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className={`mb-2 font-mono text-3xl font-bold tracking-tight ${valueClass}`}>
        {value}
      </div>
      <div className="text-xs text-fg-secondary">{sub}</div>
    </div>
  )
}

function SectionHeader({
  num,
  title,
  count,
  total,
  collapsible,
  expanded,
  onToggle,
}: {
  num: string
  title: string
  count: number
  total: number
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
}) {
  const inner = (
    <div className="flex items-baseline gap-4 border-b border-line pb-3">
      <span className="font-mono text-xs font-medium tracking-widest text-gold">
        {num} /
      </span>
      <span className="text-sm lowercase text-fg-secondary">{title}</span>
      <span className="ml-auto font-mono text-xs text-fg-secondary">
        {count} deals · {usd.format(total)}
      </span>
      {collapsible && (
        <ChevronDownIcon
          className={`size-4 text-fg-tertiary transition-transform ${expanded ? "" : "-rotate-90"}`}
        />
      )}
    </div>
  )
  if (collapsible) {
    return (
      <button type="button" onClick={onToggle} className="mb-3 w-full text-left">
        {inner}
      </button>
    )
  }
  return <div className="mb-3">{inner}</div>
}

const ROW_GRID =
  "grid w-full grid-cols-[84px_1fr_auto] items-center gap-4 border-b border-line/30 py-3.5 text-left transition-colors hover:bg-surface/40 cursor-pointer"

function ActiveRowItem({ row, onClick }: { row: ActiveRow; onClick: () => void }) {
  const block = row.activeBlocks[0]
  return (
    <button type="button" onClick={onClick} className={ROW_GRID}>
      {/* day count + threshold bar */}
      <div>
        {row.thresholdDays != null ? (
          <>
            <div
              className={`font-mono text-xs tracking-wide ${row.isOverdue ? "text-danger" : "text-fg-secondary"}`}
            >
              {row.daysSinceSold}d
            </div>
            <div className="mt-1 h-[3px] overflow-hidden rounded-sm bg-line">
              <div
                className={row.isOverdue ? "h-full bg-danger" : "h-full bg-fg-tertiary"}
                style={{
                  width: `${Math.min((row.daysSinceSold / row.thresholdDays) * 100, 100)}%`,
                }}
              />
            </div>
          </>
        ) : (
          <div className="font-mono text-xs tracking-wide text-fg-secondary">
            day {row.daysSinceSold}
          </div>
        )}
      </div>

      {/* customer · vehicle, then block / missing line */}
      <div className="min-w-0">
        <div className="mb-1 truncate text-sm font-medium text-fg-primary">
          {fullName(row.deal)} · {vehicle(row.deal)}
        </div>
        {block ? (
          <div className="truncate text-xs">
            <span className="mr-2 font-mono text-gold">
              {BLOCK_TYPE_LABELS[block.block_type as keyof typeof BLOCK_TYPE_LABELS] ??
                block.block_type}
            </span>
            {block.block_detail && (
              <span className="text-fg-secondary">{block.block_detail}</span>
            )}
          </div>
        ) : row.missingStips.length > 0 ? (
          <div className="truncate text-xs">
            <span className="mr-2 font-mono text-gold">missing:</span>
            <span className="text-fg-secondary">{row.missingStips.join(", ")}</span>
          </div>
        ) : null}
      </div>

      {/* lender + amount */}
      <div className="text-right">
        <div className="mb-1 text-xs text-fg-tertiary">{row.deal.lender?.name ?? "—"}</div>
        <div className="font-mono text-sm font-bold tracking-tight text-fg-primary">
          {row.amountFinanced == null ? "—" : usd.format(Number(row.amountFinanced))}
        </div>
      </div>
    </button>
  )
}

function FundedRowItem({ row, onClick }: { row: FundedRow; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={ROW_GRID}>
      <div className="font-mono text-xs tracking-wide text-fg-tertiary">
        {row.daysAgo}d ago
      </div>
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-fg-primary">
          {fullName(row.deal)} · {vehicle(row.deal)}
        </div>
      </div>
      <div className="text-right">
        <div className="mb-1 text-xs text-fg-tertiary">{row.deal.lender?.name ?? "—"}</div>
        <div className="font-mono text-sm font-bold tracking-tight text-fg-primary">
          {row.amountFinanced == null ? "—" : usd.format(Number(row.amountFinanced))}
        </div>
      </div>
    </button>
  )
}

export function TriageDashboard({
  subtitle,
  metrics,
  distribution,
  overdue,
  action,
  clean,
  funded,
  cit,
  currentUserRole,
  userNames,
}: {
  subtitle: string
  metrics: TriageMetrics
  distribution: PipelineDistribution
  overdue: ActiveSection
  action: ActiveSection
  clean: ActiveSection
  funded: FundedSection
  cit: CitData
  currentUserRole: string
  userNames: Record<string, string>
}) {
  const [blocksTargetId, setBlocksTargetId] = useState<string | null>(null)
  const [fundedTargetId, setFundedTargetId] = useState<string | null>(null)
  const [cleanOpen, setCleanOpen] = useState(false)
  const [fundedOpen, setFundedOpen] = useState(false)

  // Restore collapse state after mount (localStorage is client-only).
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setCleanOpen(localStorage.getItem("fd-triage-clean") === "1")
    setFundedOpen(localStorage.getItem("fd-triage-funded") === "1")
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [])

  function toggleClean() {
    setCleanOpen((v) => {
      const n = !v
      localStorage.setItem("fd-triage-clean", n ? "1" : "0")
      return n
    })
  }
  function toggleFunded() {
    setFundedOpen((v) => {
      const n = !v
      localStorage.setItem("fd-triage-funded", n ? "1" : "0")
      return n
    })
  }

  const canMutate = DEAL_ROLES.includes(currentUserRole)
  const allActive = [...overdue.deals, ...action.deals, ...clean.deals]
  const blocksRow = blocksTargetId
    ? (allActive.find((r) => r.deal.id === blocksTargetId) ?? null)
    : null
  const fundedRow = fundedTargetId
    ? (funded.deals.find((r) => r.deal.id === fundedTargetId) ?? null)
    : null

  const overdueSub =
    metrics.overdue.count > 0
      ? `${metrics.overdue.count} deals · ${metrics.overdue.minDays}–${metrics.overdue.maxDays} days past threshold`
      : "0 deals · none past threshold"

  const segments = [
    { label: "gathering", count: distribution.gathering, color: "bg-fg-muted" },
    { label: "ready", count: distribution.ready, color: "bg-fg-muted" },
    { label: "submitted", count: distribution.submitted, color: "bg-fg-muted" },
    { label: "waiting", count: distribution.waiting, color: "bg-gold" },
    { label: "in transit", count: distribution.inTransit, color: "bg-fg-muted" },
  ]
  const segTotal = distribution.totalActive || 1

  const isEmpty =
    overdue.count === 0 && action.count === 0 && clean.count === 0 && funded.count === 0

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-medium tracking-tight">Triage</h1>
        <p className="mt-1 font-mono text-xs tracking-wider text-fg-tertiary">
          {subtitle}
        </p>
      </header>

      {/* Metric cards */}
      <div className="mb-6 grid grid-cols-3 gap-3">
        <MetricCard
          label="in transit"
          value={usd.format(metrics.inTransit.total)}
          sub={`${metrics.inTransit.count} deals · funding in 5–10 days`}
        />
        <MetricCard
          label="overdue"
          value={usd.format(metrics.overdue.total)}
          valueClass="text-danger"
          sub={overdueSub}
        />
        <MetricCard
          label="awaiting"
          value={usd.format(metrics.awaiting.total)}
          sub={`${metrics.awaiting.count} deals · ready, waiting on lender`}
        />
      </div>

      {/* Pipeline distribution */}
      <div className="mb-8">
        <div className="mb-2 flex justify-between font-mono text-xs tracking-wide">
          <span className="text-fg-secondary">
            pipeline distribution · {distribution.totalActive} active
          </span>
          <span className="text-fg-tertiary">
            {usd.format(distribution.totalAmount)} in motion
          </span>
        </div>
        <div className="flex h-1.5 gap-px overflow-hidden rounded-sm bg-surface">
          {segments.map(
            (s) =>
              s.count > 0 && (
                <div
                  key={s.label}
                  className={s.color}
                  style={{ width: `${(s.count / segTotal) * 100}%` }}
                />
              )
          )}
        </div>
        <div className="mt-2 flex gap-4 font-mono text-xs text-fg-tertiary">
          {segments.map((s) => (
            <span key={s.label}>
              {s.count} {s.label}
            </span>
          ))}
        </div>
      </div>

      {isEmpty ? (
        <p className="py-24 text-center text-sm text-fg-secondary">
          All caught up — no deals in the funding pipeline.
        </p>
      ) : (
        <div className="space-y-8">
          {overdue.count > 0 && (
            <section>
              <SectionHeader
                num="01"
                title="overdue · past lender threshold"
                count={overdue.count}
                total={overdue.total}
              />
              {overdue.deals.map((r) => (
                <ActiveRowItem
                  key={r.deal.id}
                  row={r}
                  onClick={() => setBlocksTargetId(r.deal.id)}
                />
              ))}
            </section>
          )}

          {action.count > 0 && (
            <section>
              <SectionHeader
                num="02"
                title="action needed"
                count={action.count}
                total={action.total}
              />
              {action.deals.map((r) => (
                <ActiveRowItem
                  key={r.deal.id}
                  row={r}
                  onClick={() => setBlocksTargetId(r.deal.id)}
                />
              ))}
            </section>
          )}

          {clean.count > 0 && (
            <section>
              <SectionHeader
                num="03"
                title="clean & waiting"
                count={clean.count}
                total={clean.total}
                collapsible
                expanded={cleanOpen}
                onToggle={toggleClean}
              />
              {cleanOpen &&
                clean.deals.map((r) => (
                  <ActiveRowItem
                    key={r.deal.id}
                    row={r}
                    onClick={() => setBlocksTargetId(r.deal.id)}
                  />
                ))}
            </section>
          )}

          {funded.count > 0 && (
            <section>
              <SectionHeader
                num="04"
                title="recently funded"
                count={funded.count}
                total={funded.total}
                collapsible
                expanded={fundedOpen}
                onToggle={toggleFunded}
              />
              {fundedOpen &&
                funded.deals.map((r) => (
                  <FundedRowItem
                    key={r.deal.id}
                    row={r}
                    onClick={() => setFundedTargetId(r.deal.id)}
                  />
                ))}
            </section>
          )}
        </div>
      )}

      <CitSection cit={cit} />

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
