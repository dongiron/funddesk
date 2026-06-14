"use client"

import { useState } from "react"
import type { Deal } from "../../deal-schema"
import { DealForm } from "../../_components/deal-form"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"

export type HistoryTab = "funded" | "unwound"
export type FundedSummary = { total: number; count: number; avg: number }
export type UnwoundSummary = {
  total: number
  count: number
  recentReasons: {
    date: string | null
    reason: string | null
    amount: number | null
  }[]
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

function fullName(d: Deal): string {
  return (
    [d.customer_first_name, d.customer_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}
function vehicle(d: Deal): string {
  return (
    [d.vehicle_year, d.vehicle_make, d.vehicle_model]
      .filter(Boolean)
      .join(" ")
      .trim() || "—"
  )
}
function truncate(s: string | null, n = 60): string {
  if (!s) return "—"
  return s.length > n ? s.slice(0, n).trimEnd() + "…" : s
}

const TAB_LABEL: Record<HistoryTab, string> = {
  funded: "Funded",
  unwound: "Unwound",
}

function StatCard({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="flex flex-wrap gap-x-10 gap-y-3 pt-4">
        {children}
      </CardContent>
    </Card>
  )
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export function HistoryTabs({
  visibleTabs,
  defaultTab,
  fundedDeals,
  unwoundDeals,
  fundedSummary,
  unwoundSummary,
}: {
  visibleTabs: HistoryTab[]
  defaultTab: HistoryTab
  fundedDeals: Deal[]
  unwoundDeals: Deal[]
  fundedSummary: FundedSummary
  unwoundSummary: UnwoundSummary
}) {
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null)

  return (
    <>
      <Tabs defaultValue={defaultTab}>
        <TabsList>
          {visibleTabs.map((t) => (
            <TabsTrigger key={t} value={t}>
              {TAB_LABEL[t]}
            </TabsTrigger>
          ))}
        </TabsList>

        {visibleTabs.includes("funded") && (
          <TabsContent value="funded" className="space-y-4">
            <StatCard>
              <Stat label="Total financed" value={usd.format(fundedSummary.total)} />
              <Stat label="Deals" value={String(fundedSummary.count)} />
              <Stat label="Average financed" value={usd.format(fundedSummary.avg)} />
            </StatCard>

            {fundedDeals.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No funded deals in this range.
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
                      <TableHead>Funded</TableHead>
                      <TableHead className="text-right">Financed</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fundedDeals.map((deal) => (
                      <TableRow
                        key={deal.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedDeal(deal)}
                      >
                        <TableCell className="font-medium">{fullName(deal)}</TableCell>
                        <TableCell className="text-muted-foreground">{vehicle(deal)}</TableCell>
                        <TableCell className="text-muted-foreground">{deal.lender?.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{deal.sold_date}</TableCell>
                        <TableCell className="whitespace-nowrap">{deal.funded_date ?? "—"}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {deal.amount_financed == null ? "—" : usd.format(Number(deal.amount_financed))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}

        {visibleTabs.includes("unwound") && (
          <TabsContent value="unwound" className="space-y-4">
            <StatCard>
              <Stat label="Total gross profit lost" value={usd.format(unwoundSummary.total)} />
              <Stat label="Deals unwound" value={String(unwoundSummary.count)} />
              <div className="min-w-48 flex-1">
                <p className="text-xs text-muted-foreground">Recent reasons</p>
                {unwoundSummary.recentReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">None.</p>
                ) : (
                  <ul className="mt-1 space-y-0.5 text-sm">
                    {unwoundSummary.recentReasons.map((r, i) => (
                      <li key={i} className="flex justify-between gap-3">
                        <span className="truncate text-muted-foreground">
                          {r.date ?? "—"} · {truncate(r.reason, 40)}
                        </span>
                        <span className="shrink-0 tabular-nums">
                          {r.amount == null ? "—" : usd.format(Number(r.amount))}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </StatCard>

            {unwoundDeals.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                No unwound deals in this range.
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
                      <TableHead>Unwound</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead className="text-right">Gross profit lost</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {unwoundDeals.map((deal) => (
                      <TableRow
                        key={deal.id}
                        className="cursor-pointer"
                        onClick={() => setSelectedDeal(deal)}
                      >
                        <TableCell className="font-medium">{fullName(deal)}</TableCell>
                        <TableCell className="text-muted-foreground">{vehicle(deal)}</TableCell>
                        <TableCell className="text-muted-foreground">{deal.lender?.name ?? "—"}</TableCell>
                        <TableCell className="whitespace-nowrap">{deal.sold_date}</TableCell>
                        <TableCell className="whitespace-nowrap">{deal.unwound_date ?? "—"}</TableCell>
                        <TableCell className="max-w-[20rem] text-muted-foreground" title={deal.unwind_reason ?? undefined}>
                          {truncate(deal.unwind_reason)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {deal.unwind_gross_profit == null ? "—" : usd.format(Number(deal.unwind_gross_profit))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      <Sheet
        open={selectedDeal !== null}
        onOpenChange={(open) => {
          if (!open) setSelectedDeal(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>
              {selectedDeal ? fullName(selectedDeal) : "Deal"} — read-only
            </SheetTitle>
            <SheetDescription>
              A terminal deal. Read-only; no changes from history.
            </SheetDescription>
          </SheetHeader>
          {selectedDeal && (
            <DealForm
              deal={selectedDeal}
              lenders={[]}
              onSuccess={() => setSelectedDeal(null)}
              readOnly
            />
          )}
        </SheetContent>
      </Sheet>
    </>
  )
}
