"use client"

import { useState } from "react"
import type { Deal } from "../../deal-schema"
import { StatePill } from "../../_components/state-pill"
import { DealForm } from "../../_components/deal-form"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type HistoryTab = "funded" | "unwound"

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function fullName(d: Deal): string {
  return [d.customer_first_name, d.customer_last_name].filter(Boolean).join(" ").trim() || "—"
}
function vehicle(d: Deal): string {
  return [d.vehicle_year, d.vehicle_make, d.vehicle_model].filter(Boolean).join(" ").trim() || "—"
}
function fmtDate(d: string | null): string {
  if (!d) return "—"
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${d}T00:00:00Z`))
}

const GRID = "grid grid-cols-[120px_1fr_120px_88px] items-center gap-3"

export function HistoryTabs({
  visibleTabs,
  defaultTab,
  fundedDeals,
  unwoundDeals,
}: {
  visibleTabs: HistoryTab[]
  defaultTab: HistoryTab
  fundedDeals: Deal[]
  unwoundDeals: Deal[]
}) {
  const [tab, setTab] = useState<HistoryTab>(defaultTab)
  const [selected, setSelected] = useState<Deal | null>(null)

  const showTabs = visibleTabs.length > 1
  const rows = tab === "unwound" ? unwoundDeals : fundedDeals

  return (
    <div>
      {showTabs && (
        <div className="mb-4 flex border-b border-line">
          {visibleTabs.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`border-b-2 px-4 py-2.5 text-sm transition-colors ${
                tab === t
                  ? "border-gold text-fg-primary"
                  : "border-transparent text-fg-secondary hover:text-fg-primary"
              }`}
            >
              {t === "funded" ? "Funded" : "Unwound"}
            </button>
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-fg-tertiary">
          No {tab} deals in this range.
        </p>
      ) : (
        <div>
          <div
            className={`${GRID} border-b border-line pb-2 font-mono text-xs lowercase tracking-widest text-fg-tertiary`}
          >
            <div>state</div>
            <div>customer · vehicle</div>
            <div className="text-right">amount</div>
            <div className="text-right">date</div>
          </div>
          {rows.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => setSelected(d)}
              className={`${GRID} w-full cursor-pointer border-b border-line/30 py-3.5 text-left transition-colors hover:bg-surface/40`}
            >
              <div>
                <StatePill state={d.pipeline_state} />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-fg-primary">
                  {fullName(d)} · {vehicle(d)}
                </div>
                {tab === "unwound" && d.unwind_reason && (
                  <div className="truncate text-xs italic text-fg-tertiary">
                    {d.unwind_reason}
                  </div>
                )}
              </div>
              <div className="text-right font-mono text-sm font-bold text-fg-primary">
                {d.amount_financed == null ? "—" : usd.format(Number(d.amount_financed))}
              </div>
              <div className="text-right font-mono text-xs text-fg-secondary">
                {fmtDate(tab === "unwound" ? d.unwound_date : d.funded_date)}
              </div>
            </button>
          ))}
        </div>
      )}

      <Sheet
        open={selected !== null}
        onOpenChange={(o) => {
          if (!o) setSelected(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {selected ? fullName(selected) : "Deal"} — read-only
            </SheetTitle>
            <SheetDescription>
              {tab === "unwound" ? "Unwound deal." : "Funded deal."} Read-only.
            </SheetDescription>
          </SheetHeader>
          {selected && (
            <DealForm
              deal={selected}
              lenders={[]}
              readOnly
              onSuccess={() => setSelected(null)}
              onCancel={() => setSelected(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
