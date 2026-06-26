"use client"

import { useMemo, useState } from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { CheckIcon, MoreHorizontalIcon, XIcon } from "lucide-react"
import {
  AGING_LABELS,
  agingBucket,
  daysSinceSold,
  dealAgeDays,
  displayName,
  isAgingBucket,
  PIPELINE_STATES,
  PIPELINE_STATE_SHORT,
  type Deal,
  type DealEvent,
  type LenderOption,
} from "../deal-schema"
import type { DealWithBlocks } from "../block-schema"
import { FundingStatusPill, StatePill } from "./state-pill"
import { EventsSection } from "./events-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { DealForm } from "./deal-form"
import { RouteoneFundingPanel } from "./funding-panel"
import { CashPanel } from "./cash-panel"
import { UnwindDealDialog } from "./unwind-deal-dialog"
import { BlocksSheet } from "./blocks-sheet"
import { StipsSheet } from "./stips-sheet"

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})
const money = (v: number | null) => Number(v ?? 0)

function fullName(d: Deal): string {
  return displayName(d)
}
function vehicle(d: Deal): string {
  return [d.vehicle_year, d.vehicle_make, d.vehicle_model].filter(Boolean).join(" ").trim() || "—"
}
function activeBlockCount(d: DealWithBlocks): number {
  return d.blocks.filter((b) => b.resolved_at === null).length
}

// Border/text tone for the RouteOne funding-status chip. Keyword lists are a
// starting point — tune as more real status strings surface.
function fundingChipTone(status: string): string {
  const s = status.toLowerCase()
  if (/\b(funded|booked)\b/.test(s)) return "text-success border-success/40"
  if (/(reject|declin|cancel|return|withdraw|error)/.test(s)) return "text-danger border-danger/40"
  if (/(condition|pending|review|process|received|hold|submitted|approv)/.test(s))
    return "text-gold border-gold/40"
  return "text-fg-secondary border-line"
}

const CHIP =
  "rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs tracking-wide text-fg-secondary outline-none transition-colors hover:text-fg-primary"
const GRID = "grid grid-cols-[132px_1fr_104px_56px_44px_36px] items-center gap-3"

function DrillChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/40 bg-surface px-3 py-1.5 font-mono text-xs tracking-wide text-gold">
      {label}
      <button
        type="button"
        onClick={onClear}
        aria-label={`Clear ${label} filter`}
        className="text-gold/70 outline-none transition-colors hover:text-gold"
      >
        <XIcon className="size-3" />
      </button>
    </span>
  )
}

type Sort = "sold_desc" | "amount_desc" | "customer_asc"
const SORTS: { key: Sort; label: string }[] = [
  { key: "sold_desc", label: "Sold date (newest)" },
  { key: "amount_desc", label: "Amount (high→low)" },
  { key: "customer_asc", label: "Customer (A→Z)" },
]

export function DealsTable({
  deals,
  lenders,
  canMutate,
  userNames,
  eventsByDeal,
}: {
  deals: DealWithBlocks[]
  lenders: LenderOption[]
  canMutate: boolean
  userNames: Record<string, string>
  eventsByDeal: Record<string, DealEvent[]>
}) {
  const [editing, setEditing] = useState<Deal | "create" | null>(null)
  const [unwindTarget, setUnwindTarget] = useState<Deal | null>(null)
  const [blocksTargetId, setBlocksTargetId] = useState<string | null>(null)
  const [stipsTargetId, setStipsTargetId] = useState<string | null>(null)

  const [search, setSearch] = useState("")
  const [stateFilter, setStateFilter] = useState<string[]>([])
  const [lenderFilter, setLenderFilter] = useState<string[]>([])
  const [sort, setSort] = useState<Sort>("sold_desc")

  // Drill-down filters arrive as URL params from the triage CIT section. They
  // compose with the in-page chips above and are cleared via the removable chip.
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const agingParam = searchParams.get("aging")
  const drillAging = isAgingBucket(agingParam) ? agingParam : null
  const drillLenderId = searchParams.get("lender_id")
  const drillPayment = searchParams.get("payment_method")

  function clearDrill(...keys: string[]) {
    const params = new URLSearchParams(searchParams.toString())
    for (const k of keys) params.delete(k)
    const qs = params.toString()
    router.push(qs ? `${pathname}?${qs}` : pathname)
  }

  const sheetOpen = editing !== null
  const editingDeal = editing === "create" ? undefined : (editing ?? undefined)
  const blocksDeal = blocksTargetId
    ? (deals.find((d) => d.id === blocksTargetId) ?? null)
    : null
  const stipsDeal = stipsTargetId
    ? (deals.find((d) => d.id === stipsTargetId) ?? null)
    : null

  // Filter-chip option lists derived from the visible deals.
  const presentStates = PIPELINE_STATES.filter((s) =>
    deals.some((d) => d.pipeline_state === s)
  )
  const lenderOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const d of deals) {
      if (d.lender_id && d.lender?.name) seen.set(d.lender_id, d.lender.name)
    }
    return [...seen.entries()].map(([id, name]) => ({ id, name }))
  }, [deals])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return deals
      .filter((d) => {
        if (q) {
          const hay = [fullName(d), d.vehicle_vin ?? "", d.lender?.name ?? ""]
            .join(" ")
            .toLowerCase()
          if (!hay.includes(q)) return false
        }
        if (stateFilter.length && !stateFilter.includes(d.pipeline_state)) return false
        if (lenderFilter.length && (!d.lender_id || !lenderFilter.includes(d.lender_id)))
          return false
        if (drillAging && agingBucket(dealAgeDays(d.signed_at, d.created_at)) !== drillAging)
          return false
        if (drillLenderId && d.lender_id !== drillLenderId) return false
        if (drillPayment && d.payment_method !== drillPayment) return false
        return true
      })
      .sort((a, b) => {
        if (sort === "amount_desc") return money(b.amount_financed) - money(a.amount_financed)
        if (sort === "customer_asc") return fullName(a).localeCompare(fullName(b))
        return b.sold_date.localeCompare(a.sold_date)
      })
  }, [deals, search, stateFilter, lenderFilter, sort, drillAging, drillLenderId, drillPayment])

  const activeCount = deals.length
  const totalActiveAmount = deals.reduce((s, d) => s + money(d.amount_financed), 0)

  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Deals</h1>
          <p className="mt-1 text-xs text-fg-secondary">
            <span className="font-mono">{activeCount}</span> active ·{" "}
            <span className="font-mono">{usd.format(totalActiveAmount)}</span> in motion
          </p>
        </div>
        {canMutate && <Button onClick={() => setEditing("create")}>+ New deal</Button>}
      </header>

      {/* Filter row */}
      <div className="mb-4 flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search customer, VIN, or lender"
          className="flex-1 bg-surface"
        />
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP}>
            state{stateFilter.length ? ` · ${stateFilter.length}` : ""}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {presentStates.length === 0 ? (
              <DropdownMenuLabel>No states</DropdownMenuLabel>
            ) : (
              presentStates.map((s) => (
                <DropdownMenuCheckboxItem
                  key={s}
                  checked={stateFilter.includes(s)}
                  onCheckedChange={() => setStateFilter((p) => toggle(p, s))}
                >
                  {PIPELINE_STATE_SHORT[s] ?? s}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP}>
            lender{lenderFilter.length ? ` · ${lenderFilter.length}` : ""}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {lenderOptions.length === 0 ? (
              <DropdownMenuLabel>No lenders</DropdownMenuLabel>
            ) : (
              lenderOptions.map((l) => (
                <DropdownMenuCheckboxItem
                  key={l.id}
                  checked={lenderFilter.includes(l.id)}
                  onCheckedChange={() => setLenderFilter((p) => toggle(p, l.id))}
                >
                  {l.name}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP}>
            sort: {SORTS.find((s) => s.key === sort)?.label}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {SORTS.map((s) => (
              <DropdownMenuItem key={s.key} onClick={() => setSort(s.key)}>
                {s.key === sort && <CheckIcon className="size-3.5" />}
                {s.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Drill-down chips (from the triage CIT section) */}
      {(drillAging || drillLenderId || drillPayment) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {drillAging && (
            <DrillChip
              label={`age: ${AGING_LABELS[drillAging]}`}
              onClear={() => clearDrill("aging")}
            />
          )}
          {drillLenderId && (
            <DrillChip
              label={`lender: ${
                deals.find((d) => d.lender_id === drillLenderId)?.lender?.name ?? "—"
              }`}
              onClear={() => clearDrill("lender_id")}
            />
          )}
          {drillPayment && (
            <DrillChip
              label={drillPayment === "cash" ? "cash deals" : `payment: ${drillPayment}`}
              onClear={() => clearDrill("payment_method")}
            />
          )}
        </div>
      )}

      {/* Table */}
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-fg-tertiary">
          {deals.length === 0 ? "No active deals." : "No deals match your filters."}
        </p>
      ) : (
        <div>
          <div
            className={`${GRID} border-b border-line pb-2 font-mono text-xs lowercase tracking-widest text-fg-tertiary`}
          >
            <div>state</div>
            <div>customer · vehicle</div>
            <div className="text-right">amount</div>
            <div className="text-right">day</div>
            <div className="text-center">blk</div>
            <div />
          </div>

          {filtered.map((d) => {
            const days = daysSinceSold(d.sold_date)
            const threshold = d.lender?.overdue_threshold_days ?? null
            const pastThreshold = threshold != null && days > threshold
            const apr = d.apr != null ? `${d.apr}%` : null
            const term = d.term_months != null ? `${d.term_months}mo` : null
            const meta = [apr, term].filter(Boolean).join(" · ")
            const lenderUnmapped = !d.lender_id
            const unmappedLabel =
              "— lender unmapped" +
              (d.taptosign_lender_name ? ` · ${d.taptosign_lender_name}` : "")
            const blocks = activeBlockCount(d)
            const isCash = d.payment_method === "cash"
            return (
              <div
                key={d.id}
                className={`${GRID} border-b border-line/30 py-3.5 transition-colors hover:bg-surface/40`}
              >
                <div>
                  <StatePill state={d.pipeline_state} />
                </div>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg-primary">
                    {fullName(d)} · {vehicle(d)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {isCash && (
                      <span className="shrink-0 rounded-sm border border-line px-1.5 py-px font-mono text-[9px] uppercase text-fg-secondary">
                        cash
                      </span>
                    )}
                    <span className="truncate font-mono text-[10px] lowercase text-fg-tertiary">
                      {isCash ? (
                        d.balance_due != null ? (
                          `${usd.format(Number(d.balance_due))} due`
                        ) : (
                          "balance —"
                        )
                      ) : lenderUnmapped ? (
                        <span className="text-fg-muted italic">{unmappedLabel}</span>
                      ) : (
                        d.lender?.name
                      )}
                      {!isCash && meta ? ` · ${meta}` : ""}
                    </span>
                    {d.routeone_funding_status && (
                      <span
                        className={`shrink-0 rounded-sm border px-1.5 py-px font-mono text-[9px] whitespace-nowrap uppercase ${fundingChipTone(d.routeone_funding_status)}`}
                      >
                        {d.routeone_funding_status}
                      </span>
                    )}
                    <FundingStatusPill status={d.funding_status} />
                  </div>
                </div>
                <div className="text-right font-mono text-sm font-bold text-fg-primary">
                  {d.amount_financed == null ? "—" : usd.format(Number(d.amount_financed))}
                </div>
                <div
                  className={`text-right font-mono text-xs ${pastThreshold ? "text-danger" : "text-fg-secondary"}`}
                >
                  {days}d
                </div>
                <div className="flex justify-center">
                  {blocks > 0 ? (
                    <span className="flex size-[18px] items-center justify-center rounded-full border border-line bg-surface font-mono text-[10px] text-gold">
                      {blocks}
                    </span>
                  ) : (
                    <span className="font-mono text-[10px] text-fg-muted">·</span>
                  )}
                </div>
                <div className="flex justify-end">
                  {canMutate && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${fullName(d)}`}
                        className="text-fg-tertiary outline-none transition-colors hover:text-fg-primary"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(d)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setBlocksTargetId(d.id)}>
                          Blocks
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setStipsTargetId(d.id)}>
                          Stips
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setUnwindTarget(d)}>
                          Unwind
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Sheets / dialogs — unchanged */}
      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {editingDeal ? `Edit ${fullName(editingDeal)}` : "Add deal"}
            </SheetTitle>
            <SheetDescription>
              Capture the deal as signed. You can update its pipeline state as it
              moves toward funding.
            </SheetDescription>
          </SheetHeader>
          {sheetOpen && (
            <>
              {editingDeal &&
                (editingDeal.payment_method === "cash" ? (
                  <CashPanel deal={editingDeal} />
                ) : (
                  <RouteoneFundingPanel deal={editingDeal} />
                ))}
              {editingDeal && (
                <EventsSection
                  dealId={editingDeal.id}
                  events={eventsByDeal[editingDeal.id] ?? []}
                  canAdd={canMutate}
                  userNames={userNames}
                />
              )}
              <DealForm
                deal={editingDeal}
                lenders={lenders}
                onSuccess={() => setEditing(null)}
                onCancel={() => setEditing(null)}
              />
            </>
          )}
        </SheetContent>
      </Sheet>

      <UnwindDealDialog deal={unwindTarget} onClose={() => setUnwindTarget(null)} />

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
