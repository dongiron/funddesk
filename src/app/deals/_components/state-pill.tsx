import { PIPELINE_STATE_SHORT, pillVariant, type PillVariant } from "../deal-schema"

const PILL_CLASS: Record<PillVariant, string> = {
  gold: "text-gold border-gold/30 bg-gold/5",
  green: "text-success border-success/30 bg-success/5",
  red: "text-danger border-danger/30 bg-danger/5",
  neutral: "text-fg-secondary border-line bg-surface",
}

export function StatePill({ state }: { state: string }) {
  return (
    <span
      className={`inline-block rounded-sm border px-2 py-1 font-mono text-[10px] lowercase tracking-wide ${PILL_CLASS[pillVariant(state)]}`}
    >
      {PIPELINE_STATE_SHORT[state] ?? state}
    </span>
  )
}
