import { z } from "zod"
import type { Deal } from "./deal-schema"

// ── Block types (migration 0003 order = source of truth) ─────────────────────
export const BLOCK_TYPES = [
  "i_fix_dl",
  "i_fix_doc",
  "i_fix_resign",
  "chase_customer_stip",
  "chase_customer_signature",
  "chase_customer_insurance",
  "chase_welcome_call_escalation",
  "chase_employment_verification",
  "chase_overnight_contract",
  "chase_trade_payoff",
  "wait_bank",
  "bank_issue",
  "lender_hold",
  "funds_uncleared",
] as const

export type BlockType = (typeof BLOCK_TYPES)[number]

export const BLOCK_TYPE_LABELS: Record<BlockType, string> = {
  i_fix_dl: "I fix: Driver's license",
  i_fix_doc: "I fix: Document",
  i_fix_resign: "I fix: Re-signature",
  chase_customer_stip: "Chase: Customer stip",
  chase_customer_signature: "Chase: Customer signature",
  chase_customer_insurance: "Chase: Customer insurance",
  chase_welcome_call_escalation: "Chase: Welcome call escalation",
  chase_employment_verification: "Chase: Employment verification",
  chase_overnight_contract: "Chase: Overnight contract",
  chase_trade_payoff: "Chase: Trade payoff",
  wait_bank: "Wait: Bank",
  bank_issue: "Bank issue",
  lender_hold: "Lender hold",
  funds_uncleared: "Funds: Uncleared",
}

// Grouped for the Select (SelectGroup + SelectLabel + SelectItem).
export const BLOCK_TYPE_GROUPS: { label: string; types: BlockType[] }[] = [
  { label: "I fix", types: ["i_fix_dl", "i_fix_doc", "i_fix_resign"] },
  {
    label: "Chase",
    types: [
      "chase_customer_stip",
      "chase_customer_signature",
      "chase_customer_insurance",
      "chase_welcome_call_escalation",
      "chase_employment_verification",
      "chase_overnight_contract",
      "chase_trade_payoff",
    ],
  },
  { label: "Lender", types: ["wait_bank", "bank_issue", "lender_hold"] },
  { label: "Funds", types: ["funds_uncleared"] },
]

// block_type -> short category label ("I fix" / "Chase" / "Lender") for badges.
const CATEGORY_BY_TYPE: Record<string, string> = Object.fromEntries(
  BLOCK_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t, g.label]))
)
export function blockCategory(type: string): string {
  return CATEGORY_BY_TYPE[type] ?? "Block"
}

// ── DB row shape (inline; matches migration 0003) ────────────────────────────
export type DealBlock = {
  id: string
  dealership_id: string
  deal_id: string
  block_type: string
  block_detail: string | null
  opened_at: string
  opened_by: string
  resolved_at: string | null
  resolved_by: string | null
  resolution_note: string | null
  created_at: string
  updated_at: string
}

// A deal with its blocks (active + resolved) attached for the table/sheet.
export type DealWithBlocks = Deal & { blocks: DealBlock[] }

export const BLOCK_SELECT =
  "id, dealership_id, deal_id, block_type, block_detail, opened_at, opened_by, " +
  "resolved_at, resolved_by, resolution_note, created_at, updated_at"

// ── Form schemas ─────────────────────────────────────────────────────────────
// Blocks are immutable after creation; resolution is the only mutation. Form
// holds plain strings; the action trims block_detail/resolution_note to null.
export const addBlockSchema = z.object({
  // Held as a string in the form ("" = unselected); refined to a valid type.
  block_type: z
    .string()
    .refine(
      (v) => (BLOCK_TYPES as readonly string[]).includes(v),
      "Select a block type."
    ),
  block_detail: z.string(),
})
export type AddBlockValues = z.infer<typeof addBlockSchema>

export const resolveBlockSchema = z.object({
  resolution_note: z.string(),
})
export type ResolveBlockValues = z.infer<typeof resolveBlockSchema>

// ── Relative-time helper (no deps; lives under app/deals/ per scope rules) ────
export function relativeTime(iso: string | null): string {
  if (!iso) return ""
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return ""
  const diffSec = Math.round((Date.now() - then) / 1000)
  if (diffSec < 45) return "just now"
  const mins = Math.round(diffSec / 60)
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`
  return new Date(then).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}
