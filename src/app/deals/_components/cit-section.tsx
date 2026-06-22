import Link from "next/link"
import { relativeTime } from "../block-schema"
import { AGING_LABELS, type AgingBucket } from "../deal-schema"

// ── Data shapes (computed server-side in the triage page) ────────────────────

export type CitAgingRow = { bucket: AgingBucket; count: number; amount: number }

// One row per funding lender, plus a synthetic "Cash deals" row. `href` is the
// drill-down target on /deals (null when there's nothing to filter on, e.g. the
// unmapped-lender bucket).
export type CitLenderRow = {
  key: string
  label: string
  href: string | null
  count: number
  amount: number
  oldest: number
}

export type CitData = {
  generatedAt: string
  totalCount: number
  totalAmount: number
  avgAge: number
  overdueAmount: number
  criticalAmount: number
  aging: CitAgingRow[]
  lenders: CitLenderRow[]
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
})

// Aging tone: 15–30 days is a warning (gold), 30+ is a problem (danger).
function ageTone(days: number): string {
  if (days > 30) return "text-danger"
  if (days >= 15) return "text-gold"
  return "text-fg-secondary"
}
function bucketTone(bucket: AgingBucket): string {
  if (bucket === "30+") return "text-danger"
  if (bucket === "15-30") return "text-gold"
  return "text-fg-secondary"
}

function CitCard({
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

const AGING_GRID = "grid grid-cols-[1fr_64px_120px] items-center gap-4"
const LENDER_GRID = "grid grid-cols-[1fr_64px_120px_80px] items-center gap-4"

export function CitSection({ cit }: { cit: CitData }) {
  return (
    <section className="mt-10 border-t border-line pt-8">
      <div className="mb-5 flex items-baseline justify-between">
        <h3 className="text-base font-medium tracking-tight text-fg-primary">
          Contracts in transit
        </h3>
        <span className="font-mono text-xs text-fg-tertiary">
          updated {relativeTime(cit.generatedAt)}
        </span>
      </div>

      {cit.totalCount === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-fg-tertiary">
          No contracts in transit.
        </p>
      ) : (
        <>
          {/* Metric cards (D-metric-cards B) */}
          <div className="mb-8 grid grid-cols-3 gap-3">
            <CitCard
              label="avg age"
              value={`${cit.avgAge}d`}
              sub={`across ${cit.totalCount} contract${cit.totalCount === 1 ? "" : "s"}`}
            />
            <CitCard
              label="overdue · 15+ days"
              value={usd.format(cit.overdueAmount)}
              valueClass="text-gold"
              sub="contracts aged 15 days or more"
            />
            <CitCard
              label="critical · 30+ days"
              value={usd.format(cit.criticalAmount)}
              valueClass="text-danger"
              sub="contracts aged 30 days or more"
            />
          </div>

          <div className="grid gap-8 lg:grid-cols-2">
            {/* Aging buckets */}
            <div>
              <div
                className={`${AGING_GRID} border-b border-line pb-2 font-mono text-xs lowercase tracking-widest text-fg-tertiary`}
              >
                <div>age</div>
                <div className="text-right">deals</div>
                <div className="text-right">amount</div>
              </div>
              {cit.aging.map((r) => (
                <Link
                  key={r.bucket}
                  href={`/deals?aging=${encodeURIComponent(r.bucket)}`}
                  className={`${AGING_GRID} border-b border-line/30 py-3 transition-colors hover:bg-surface/40`}
                >
                  <div className={`text-sm ${bucketTone(r.bucket)}`}>
                    {AGING_LABELS[r.bucket]}
                  </div>
                  <div className="text-right font-mono text-sm tabular-nums text-fg-secondary">
                    {r.count}
                  </div>
                  <div className="text-right font-mono text-sm font-bold tabular-nums text-fg-primary">
                    {usd.format(r.amount)}
                  </div>
                </Link>
              ))}
            </div>

            {/* By lender */}
            <div>
              <div
                className={`${LENDER_GRID} border-b border-line pb-2 font-mono text-xs lowercase tracking-widest text-fg-tertiary`}
              >
                <div>lender</div>
                <div className="text-right">deals</div>
                <div className="text-right">amount</div>
                <div className="text-right">oldest</div>
              </div>
              {cit.lenders.map((r) => {
                const cells = (
                  <>
                    <div className="truncate text-sm text-fg-primary">{r.label}</div>
                    <div className="text-right font-mono text-sm tabular-nums text-fg-secondary">
                      {r.count}
                    </div>
                    <div className="text-right font-mono text-sm font-bold tabular-nums text-fg-primary">
                      {usd.format(r.amount)}
                    </div>
                    <div
                      className={`text-right font-mono text-sm tabular-nums ${ageTone(r.oldest)}`}
                    >
                      {r.oldest}d
                    </div>
                  </>
                )
                return r.href ? (
                  <Link
                    key={r.key}
                    href={r.href}
                    className={`${LENDER_GRID} border-b border-line/30 py-3 transition-colors hover:bg-surface/40`}
                  >
                    {cells}
                  </Link>
                ) : (
                  <div
                    key={r.key}
                    className={`${LENDER_GRID} border-b border-line/30 py-3`}
                  >
                    {cells}
                  </div>
                )
              })}
            </div>
          </div>
        </>
      )}
    </section>
  )
}
