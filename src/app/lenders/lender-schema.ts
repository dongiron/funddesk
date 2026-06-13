import { z } from "zod"

// ── Form schema (shape held by react-hook-form) ──────────────────────────────
// Every field is a plain string/boolean the form always supplies, so zod's input
// and output types match (no transform divergence to fight with useForm typing).
// Numbers are validated as strings here ("" allowed = unconfigured) and coerced
// to number|null in toLenderInput before the value reaches a server action.

const countString = z
  .string()
  .refine((v) => v.trim() === "" || /^\d+$/.test(v.trim()), {
    message: "Enter a whole number of days, or leave blank.",
  })

export const lenderFormSchema = z.object({
  name: z.string().trim().min(1, "Lender name is required."),
  communication_platform: z.string(),
  typical_days_clean: countString,
  overdue_threshold_days: countString,
  clears_stips_upfront: z.boolean(),
  does_welcome_calls: z.boolean(),
  does_employment_verification: z.boolean(),
  can_increase_lender_fee: z.boolean(),
  accepts_esign: z.boolean(),
  requires_physical_contract: z.boolean(),
  common_required_stips: z.string(),
  commonly_ghosted_stips: z.string(),
  operator_notes: z.string(),
})

export type LenderFormValues = z.infer<typeof lenderFormSchema>

// ── Normalized payload sent to server actions ────────────────────────────────
export type LenderInput = {
  name: string
  communication_platform: string | null
  typical_days_clean: number | null
  overdue_threshold_days: number | null
  clears_stips_upfront: boolean
  does_welcome_calls: boolean
  does_employment_verification: boolean
  can_increase_lender_fee: boolean
  accepts_esign: boolean
  requires_physical_contract: boolean
  common_required_stips: string[]
  commonly_ghosted_stips: string[]
  operator_notes: string | null
}

// ── DB row shape (inline; no generated Supabase types in this repo) ───────────
export type Lender = {
  id: string
  name: string
  communication_platform: string | null
  typical_days_clean: number | null
  overdue_threshold_days: number | null
  clears_stips_upfront: boolean
  does_welcome_calls: boolean
  does_employment_verification: boolean
  can_increase_lender_fee: boolean
  accepts_esign: boolean
  requires_physical_contract: boolean
  common_required_stips: string[]
  commonly_ghosted_stips: string[]
  operator_notes: string | null
}

export type ActionResult = { ok: true } | { ok: false; error: string }

// Comma-separated input -> trimmed, de-empties string array (for both JSONB
// stip columns, which carry a jsonb_typeof = 'array' CHECK constraint).
export function toStipArray(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

function emptyToNull(value: string): string | null {
  const t = value.trim()
  return t === "" ? null : t
}

function countToNumberOrNull(value: string): number | null {
  const t = value.trim()
  return t === "" ? null : Number(t)
}

export function toLenderInput(v: LenderFormValues): LenderInput {
  return {
    name: v.name.trim(),
    communication_platform: emptyToNull(v.communication_platform),
    typical_days_clean: countToNumberOrNull(v.typical_days_clean),
    overdue_threshold_days: countToNumberOrNull(v.overdue_threshold_days),
    clears_stips_upfront: v.clears_stips_upfront,
    does_welcome_calls: v.does_welcome_calls,
    does_employment_verification: v.does_employment_verification,
    can_increase_lender_fee: v.can_increase_lender_fee,
    accepts_esign: v.accepts_esign,
    requires_physical_contract: v.requires_physical_contract,
    common_required_stips: toStipArray(v.common_required_stips),
    commonly_ghosted_stips: toStipArray(v.commonly_ghosted_stips),
    operator_notes: emptyToNull(v.operator_notes),
  }
}
