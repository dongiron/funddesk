import type { ReactNode } from "react"
import { relativeTime } from "../block-schema"
import { FormSection } from "@/components/ui/form-section"
import type { Deal } from "../deal-schema"

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" })
const money = (v: number | null) => (v == null ? "—" : usd.format(Number(v)))

// routeone_contract_date is a DATE (YYYY-MM-DD). Parse from parts so the local
// render doesn't shift a day off UTC midnight.
function fmtDate(iso: string | null): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null
  if (!m) return "—"
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function Cell({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="font-mono text-[10px] lowercase tracking-wider text-fg-tertiary">
        {label}
      </div>
      <div className="text-sm text-fg-primary">{children}</div>
    </div>
  )
}

// Read-only panel of RouteOne-synced funding data. Renders only when a funding
// status is present (i.e. the deal has been synced from RouteOne). Distinct from
// the editable form sections below it — synced provenance, not user input.
export function RouteoneFundingPanel({ deal }: { deal: Deal }) {
  if (!deal.routeone_funding_status) return null
  const lenderMapped = !!deal.lender_id
  return (
    <div className="border-b border-line px-6 py-6">
      <FormSection title="funding">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-3">
            <Cell label="lender">
              {deal.routeone_funding_lender_name ? (
                <span className={lenderMapped ? "" : "text-fg-muted italic"}>
                  {deal.routeone_funding_lender_name}
                </span>
              ) : (
                <span className="text-fg-muted">—</span>
              )}
            </Cell>
            <Cell label="status">{deal.routeone_funding_status}</Cell>
            <Cell label="contract #">
              <span className="font-mono">{deal.routeone_contract_number ?? "—"}</span>
            </Cell>
            <Cell label="contract date">{fmtDate(deal.routeone_contract_date)}</Cell>
          </div>
          <div className="space-y-3">
            <Cell label="amount financed">
              <span className="font-mono">{money(deal.routeone_amount_financed)}</span>
            </Cell>
            <Cell label="reserve">
              <span className="font-mono">{money(deal.routeone_reserve_amount)}</span>
            </Cell>
            <Cell label="net proceeds">
              <span className="font-mono">{money(deal.routeone_net_proceeds)}</span>
            </Cell>
          </div>
        </div>

        {(deal.routeone_is_dsp_originated || deal.routeone_has_unread_message) && (
          <div className="flex flex-wrap gap-2">
            {deal.routeone_is_dsp_originated && (
              <span className="rounded-full border border-line-strong px-2 py-0.5 font-mono text-[10px] text-fg-secondary">
                DSP-originated
              </span>
            )}
            {deal.routeone_has_unread_message && (
              <span className="rounded-full border border-danger/40 px-2 py-0.5 font-mono text-[10px] text-danger">
                unread lender message
              </span>
            )}
          </div>
        )}

        {deal.routeone_last_synced_at && (
          <div className="font-mono text-[10px] text-fg-muted">
            synced {relativeTime(deal.routeone_last_synced_at)}
          </div>
        )}
      </FormSection>
    </div>
  )
}
