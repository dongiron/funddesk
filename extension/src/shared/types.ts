// Mirrors the Zod schema in FundDesk's sync endpoint
// (src/app/api/extensions/taptosign/sync/route.ts). Keep these in sync by hand.
// Only taptosignDealId is required — a TaptoSign deal is partial at most sync
// moments, so everything else is optional and we land what we have.

export type TaptosignDealPayload = {
  taptosignDealId: string
  customer: { firstName?: string; lastName?: string; email?: string }
  coBuyer?: { name?: string; email?: string; signed?: boolean }
  vehicle: {
    vin?: string
    year?: string
    make?: string
    model?: string
    miles?: string
    stockNumber?: string
  }
  finance: {
    salePrice?: number
    downPayment?: number
    amountFinanced?: number
    apr?: number
    term?: number
    monthlyPayment?: number
    lenderName?: string
    frontGross?: number | null
    backGross?: number | null
    totalGross?: number | null
  }
  sales?: { salesPersonName?: string; financeManagerName?: string }
  signed: boolean
  signedAt?: string
  saleDate?: string
}

// RouteOne Contract Manager batch sync. Mirrors the Zod schema in
// src/app/api/extensions/routeone/sync/route.ts. Only routeoneDealId is
// required; missing cells come through as null (never 0 or "").
export type RouteoneContract = {
  routeoneDealId: string
  contractNumber?: string | null
  contractDate?: string | null // YYYY-MM-DD
  customerName?: string | null // "LastName, FirstName"
  fundingLenderName?: string | null
  fundingStatus?: string | null
  contractReturned?: boolean
  hasUnreadMessage: boolean
  amountFinanced?: number | null
  reserveAmount?: number | null
  netProceeds?: number | null
  isDspOriginated: boolean
  transactionType?: string | null
  fundingAgeDays?: number | null
}
export type RouteoneSyncPayload = { contracts: RouteoneContract[] }

// RouteOne Decision Summary — Booked/Funded decisions from the Decision History
// table. Mirrors the Zod schema in
// src/app/api/extensions/routeone/decision-summary/route.ts.
export type DecisionSummaryDecision = {
  decisionNumber: number
  eventAt: string // ISO timestamp (parsed browser-side)
  statusRaw: string
  eventType: "booked" | "funded"
}
export type DecisionSummaryPayload = {
  applicant: string | null
  routeoneAppNumber: string | null
  fsAppNumber: string | null
  decisions: DecisionSummaryDecision[]
}
export type DecisionSummaryResult =
  | { ok: true; matched: 0 | 1; inserted: number; eventTypes: string[] }
  | { ok: false; error: string; status: number }

export type RouteoneUnmatchedRow = {
  customerName: string | null
  routeoneDealId: string
  lenderName: string | null
  status: string | null
}
export type RouteoneErroredRow = {
  routeoneDealId: string
  customerName: string | null
  error: string
}
export type RouteoneSyncResult =
  | {
      ok: true
      matched: number
      unmatched: number
      unmatchedRows: RouteoneUnmatchedRow[]
      errored: number
      erroredRows: RouteoneErroredRow[]
    }
  | { ok: false; error: string; status: number }

// ── API results (background worker → popup) ───────────────────────────────────
export type SyncResult =
  | { ok: true; dealId: string; action: "created" | "updated"; lenderMapped: boolean }
  | { ok: false; error: string; status: number }

export type TestResult = { ok: true } | { ok: false; error: string; status: number }

// ── TaptoSign PDF extraction (second-stage sync) ──────────────────────────────
export type PdfExtractPayload = { taptosignDealId: string; pdfBase64: string }
export type PdfExtractResult =
  | { ok: true; fieldsUpdated: number; extracted: Record<string, unknown> }
  | { ok: false; error: string; status: number }

// ── Bill of Sale extraction (authoritative payment_method) ────────────────────
// Same signed-PDF package as the RIC extraction above; returns the authoritative
// classification so the popup knows whether to run the RIC stage.
export type BosExtractPayload = { taptosignDealId: string; pdfBase64: string }
export type BosExtractResult =
  | {
      ok: true
      fieldsUpdated: number
      paymentMethod: "financed" | "cash"
      extracted: Record<string, unknown>
    }
  | { ok: false; error: string; status: number }

// ── Message envelopes (popup → background) ────────────────────────────────────
export type SyncDealMessage = { type: "SYNC_DEAL"; payload: TaptosignDealPayload }
export type SyncRouteoneMessage = { type: "SYNC_ROUTEONE"; payload: RouteoneSyncPayload }
export type SyncPdfExtractMessage = { type: "SYNC_PDF_EXTRACT"; payload: PdfExtractPayload }
export type SyncBosExtractMessage = { type: "SYNC_BOS_EXTRACT"; payload: BosExtractPayload }
export type SyncDecisionSummaryMessage = {
  type: "SYNC_DECISION_SUMMARY"
  payload: DecisionSummaryPayload
}
export type TestConnectionMessage = { type: "TEST_CONNECTION" }
export type BackgroundMessage =
  | SyncDealMessage
  | SyncRouteoneMessage
  | SyncPdfExtractMessage
  | SyncBosExtractMessage
  | SyncDecisionSummaryMessage
  | TestConnectionMessage

export type Settings = { token?: string; serverUrl: string }

export const DEFAULT_SERVER_URL = "http://localhost:3000"
