import { z } from "zod"

// ── Pipeline states ──────────────────────────────────────────────────────────
// Full set lives in the DB CHECK (migration 0002). 'unwound' is reached only via
// the dedicated unwind flow (it requires metadata), so it is NOT a manual option
// in the create/edit form.
export const PIPELINE_STATES = [
  "signed",
  "waiting_for_scan",
  "gathering_paperwork",
  "gathering_stips",
  "ready_to_send",
  "submitted",
  "awaiting_physical_delivery",
  "waiting_to_fund",
  "funds_in_transit",
  "funded",
  "unwound",
] as const

export const PIPELINE_STATE_LABELS: Record<string, string> = {
  signed: "Signed",
  waiting_for_scan: "Waiting for scan",
  gathering_paperwork: "Gathering paperwork",
  gathering_stips: "Gathering stips",
  ready_to_send: "Ready to send",
  submitted: "Submitted",
  awaiting_physical_delivery: "Awaiting physical delivery",
  waiting_to_fund: "Waiting to fund",
  funds_in_transit: "Funds in transit",
  funded: "Funded",
  unwound: "Unwound",
}

// Short, lowercase labels for compact pills/badges in tables.
export const PIPELINE_STATE_SHORT: Record<string, string> = {
  signed: "signed",
  waiting_for_scan: "waiting scan",
  gathering_paperwork: "gathering pwk",
  gathering_stips: "gathering stips",
  ready_to_send: "ready",
  submitted: "submitted",
  awaiting_physical_delivery: "awaiting delivery",
  waiting_to_fund: "waiting fund",
  funds_in_transit: "in transit",
  funded: "funded",
  unwound: "unwound",
}

// Pill color variant per state. Gold = brand/near-funding, green = funded,
// red = unwound, neutral = everything else. (Never semantic for the gold.)
export type PillVariant = "gold" | "green" | "red" | "neutral"
export function pillVariant(state: string): PillVariant {
  if (state === "waiting_to_fund" || state === "funds_in_transit") return "gold"
  if (state === "funded") return "green"
  if (state === "unwound") return "red"
  return "neutral"
}

// Selectable in the form: everything except 'unwound'.
export const FORM_PIPELINE_STATES = PIPELINE_STATES.filter((s) => s !== "unwound")

// Terminal states excluded from the active list.
export const TERMINAL_STATES = ["funded", "unwound"] as const

// ── Reusable zod field validators (form holds strings; mapped to typed input) ─
const optionalNumber = z
  .string()
  .refine(
    (v) => v.trim() === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0),
    "Enter a non-negative number, or leave blank."
  )
const requiredNumber = z
  .string()
  .refine(
    (v) => v.trim() !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0,
    "Enter a non-negative number."
  )
const optionalInt = z
  .string()
  .refine(
    (v) => v.trim() === "" || /^\d+$/.test(v.trim()),
    "Enter a whole number, or leave blank."
  )
const optionalDate = z
  .string()
  .refine(
    (v) => v.trim() === "" || /^\d{4}-\d{2}-\d{2}$/.test(v.trim()),
    "Use a valid date, or leave blank."
  )
const requiredDate = z
  .string()
  .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()), "Sold date is required.")

// ── Form schema ──────────────────────────────────────────────────────────────
export const dealFormSchema = z.object({
  // customer (migration 0001)
  customer_first_name: z.string().trim().min(1, "First name is required."),
  customer_last_name: z.string().trim().min(1, "Last name is required."),
  // lender + pipeline
  lender_id: z.string().trim().min(1, "Select a lender."),
  pipeline_state: z.string().min(1),
  // vehicle
  vehicle_year: optionalInt,
  vehicle_make: z.string(),
  vehicle_model: z.string(),
  vehicle_vin: z.string(),
  stock_number: z.string(),
  // financial
  amount_financed: requiredNumber,
  term_months: optionalInt,
  apr: optionalNumber,
  monthly_payment: optionalNumber,
  front_gross: optionalNumber,
  back_gross: optionalNumber,
  pack: optionalNumber,
  reserve: optionalNumber,
  // dates
  sold_date: requiredDate,
  submitted_to_lender_date: optionalDate,
  funded_date: optionalDate,
  physical_contract_mailed_date: optionalDate,
  // physical contract
  physical_contract_required: z.boolean(),
  // stips (comma input)
  stips_required: z.array(z.string()),
  stips_received: z.array(z.string()),
  // trade
  has_trade: z.boolean(),
  trade_year: optionalInt,
  trade_make: z.string(),
  trade_model: z.string(),
  trade_vin: z.string(),
  trade_acv: optionalNumber,
  trade_allowance: optionalNumber,
  trade_payoff_quoted: optionalNumber,
  trade_payoff_lender: z.string(),
  trade_payoff_sent_date: optionalDate,
  trade_payoff_received_date: optionalDate,
  trade_title_received_date: optionalDate,
})

export type DealFormValues = z.infer<typeof dealFormSchema>

// ── Normalized payload sent to server actions ────────────────────────────────
export type DealInput = {
  customer_first_name: string
  customer_last_name: string
  lender_id: string
  pipeline_state: string
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_vin: string | null
  stock_number: string | null
  amount_financed: number
  term_months: number | null
  apr: number | null
  monthly_payment: number | null
  front_gross: number | null
  back_gross: number | null
  pack: number | null
  reserve: number | null
  sold_date: string
  submitted_to_lender_date: string | null
  funded_date: string | null
  physical_contract_mailed_date: string | null
  physical_contract_required: boolean
  stips_required: string[]
  stips_received: string[]
  has_trade: boolean
  trade_year: number | null
  trade_make: string | null
  trade_model: string | null
  trade_vin: string | null
  trade_acv: number | null
  trade_allowance: number | null
  trade_payoff_quoted: number | null
  trade_payoff_lender: string | null
  trade_payoff_sent_date: string | null
  trade_payoff_received_date: string | null
  trade_title_received_date: string | null
}

export type UnwindInput = { reason: string; grossProfit: number; date: string }

// ── DB row shape (inline; no generated Supabase types in this repo) ───────────
export type Deal = {
  id: string
  customer_first_name: string | null
  customer_last_name: string | null
  lender_id: string | null
  lender: { name: string; overdue_threshold_days: number | null } | null
  pipeline_state: string
  vehicle_year: number | null
  vehicle_make: string | null
  vehicle_model: string | null
  vehicle_vin: string | null
  stock_number: string | null
  amount_financed: number | null
  term_months: number | null
  apr: number | null
  monthly_payment: number | null
  front_gross: number | null
  back_gross: number | null
  pack: number | null
  reserve: number | null
  sold_date: string
  submitted_to_lender_date: string | null
  funded_date: string | null
  physical_contract_mailed_date: string | null
  physical_contract_required: boolean
  stips_required: string[]
  stips_received: string[]
  has_trade: boolean
  trade_year: number | null
  trade_make: string | null
  trade_model: string | null
  trade_vin: string | null
  trade_acv: number | null
  trade_allowance: number | null
  trade_payoff_quoted: number | null
  trade_payoff_lender: string | null
  trade_payoff_sent_date: string | null
  trade_payoff_received_date: string | null
  trade_title_received_date: string | null
  unwound_date: string | null
  unwind_reason: string | null
  unwind_gross_profit: number | null
  taptosign_deal_id: string | null
  taptosign_lender_name: string | null
}

// Minimal lender shape the form needs (Select + create-time pre-fill).
export type LenderOption = {
  id: string
  name: string
  requires_physical_contract: boolean
  common_required_stips: string[]
}

export type ActionResult = { ok: true } | { ok: false; error: string }

// Full column list for deal queries — shared by the active page and the history
// page so the Deal type and the select stay in sync. Active deals carry nulls
// for the unwind columns.
export const DEAL_SELECT =
  "id, customer_first_name, customer_last_name, lender_id, pipeline_state, " +
  "vehicle_year, vehicle_make, vehicle_model, vehicle_vin, stock_number, " +
  "amount_financed, term_months, apr, monthly_payment, front_gross, back_gross, " +
  "pack, reserve, sold_date, submitted_to_lender_date, funded_date, " +
  "physical_contract_mailed_date, physical_contract_required, stips_required, " +
  "stips_received, has_trade, trade_year, trade_make, trade_model, trade_vin, " +
  "trade_acv, trade_allowance, trade_payoff_quoted, trade_payoff_lender, " +
  "trade_payoff_sent_date, trade_payoff_received_date, trade_title_received_date, " +
  "unwound_date, unwind_reason, unwind_gross_profit, taptosign_deal_id, " +
  "taptosign_lender_name, lender:lender_id(name, overdue_threshold_days)"

// ── History date-range filter ────────────────────────────────────────────────
export const RANGE_OPTIONS = [
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "180d", label: "Last 180 days" },
  { value: "year", label: "Last year" },
  { value: "all", label: "All time" },
] as const

export type RangeValue = (typeof RANGE_OPTIONS)[number]["value"]

export function isRangeValue(v: string | undefined): v is RangeValue {
  return !!v && RANGE_OPTIONS.some((o) => o.value === v)
}

// Inclusive cutoff date (YYYY-MM-DD, Phoenix basis) for a range, or null = no
// filter ("all"). Used to bound the history query on the relevant terminal date.
export function rangeStartDate(range: RangeValue): string | null {
  if (range === "all") return null
  const days =
    range === "30d" ? 30 : range === "90d" ? 90 : range === "180d" ? 180 : 365
  const ms = Date.parse(phoenixToday()) - days * 86_400_000
  return new Date(ms).toISOString().slice(0, 10)
}

// ── Helpers ──────────────────────────────────────────────────────────────────

// Today's date in America/Phoenix as YYYY-MM-DD. en-CA formats as YYYY-MM-DD.
// Used on both client (form default) and server (action fallback) per the
// locked sold_date convention — never rely on the DB's UTC CURRENT_DATE.
export function phoenixToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Phoenix",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date())
}

// Whole days between a YYYY-MM-DD sold date and Phoenix-today. Both parsed as
// UTC midnight, so the difference is timezone-stable.
export function daysSinceSold(soldDate: string): number {
  const sold = Date.parse(soldDate)
  const today = Date.parse(phoenixToday())
  if (Number.isNaN(sold) || Number.isNaN(today)) return 0
  return Math.round((today - sold) / 86_400_000)
}

// Trim each entry and drop empties (stips are arrays now, not CSV text).
export function cleanStips(values: string[]): string[] {
  return values.map((s) => s.trim()).filter((s) => s.length > 0)
}

export function normalizeStip(s: string): string {
  return s.trim().toLowerCase()
}

export function stipsMatch(a: string, b: string): boolean {
  return normalizeStip(a) === normalizeStip(b)
}

function emptyToNull(value: string): string | null {
  const t = value.trim()
  return t === "" ? null : t
}

function numOrNull(value: string): number | null {
  const t = value.trim()
  return t === "" ? null : Number(t)
}

export function toDealInput(v: DealFormValues): DealInput {
  const hasTrade = v.has_trade
  return {
    customer_first_name: v.customer_first_name.trim(),
    customer_last_name: v.customer_last_name.trim(),
    lender_id: v.lender_id,
    pipeline_state: v.pipeline_state,
    vehicle_year: numOrNull(v.vehicle_year),
    vehicle_make: emptyToNull(v.vehicle_make),
    vehicle_model: emptyToNull(v.vehicle_model),
    vehicle_vin: emptyToNull(v.vehicle_vin),
    stock_number: emptyToNull(v.stock_number),
    amount_financed: Number(v.amount_financed),
    term_months: numOrNull(v.term_months),
    apr: numOrNull(v.apr),
    monthly_payment: numOrNull(v.monthly_payment),
    front_gross: numOrNull(v.front_gross),
    back_gross: numOrNull(v.back_gross),
    pack: numOrNull(v.pack),
    reserve: numOrNull(v.reserve),
    sold_date: v.sold_date.trim(),
    submitted_to_lender_date: emptyToNull(v.submitted_to_lender_date),
    funded_date: emptyToNull(v.funded_date),
    physical_contract_mailed_date: emptyToNull(v.physical_contract_mailed_date),
    physical_contract_required: v.physical_contract_required,
    stips_required: cleanStips(v.stips_required),
    stips_received: cleanStips(v.stips_received),
    has_trade: hasTrade,
    // Trade columns are null when has_trade is false.
    trade_year: hasTrade ? numOrNull(v.trade_year) : null,
    trade_make: hasTrade ? emptyToNull(v.trade_make) : null,
    trade_model: hasTrade ? emptyToNull(v.trade_model) : null,
    trade_vin: hasTrade ? emptyToNull(v.trade_vin) : null,
    trade_acv: hasTrade ? numOrNull(v.trade_acv) : null,
    trade_allowance: hasTrade ? numOrNull(v.trade_allowance) : null,
    trade_payoff_quoted: hasTrade ? numOrNull(v.trade_payoff_quoted) : null,
    trade_payoff_lender: hasTrade ? emptyToNull(v.trade_payoff_lender) : null,
    trade_payoff_sent_date: hasTrade ? emptyToNull(v.trade_payoff_sent_date) : null,
    trade_payoff_received_date: hasTrade
      ? emptyToNull(v.trade_payoff_received_date)
      : null,
    trade_title_received_date: hasTrade
      ? emptyToNull(v.trade_title_received_date)
      : null,
  }
}
