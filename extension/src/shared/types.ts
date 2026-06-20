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
  }
  sales?: { salesPersonName?: string; financeManagerName?: string }
  signed: boolean
  signedAt?: string
  saleDate?: string
}

// Stub wire shape for the RouteOne batch sync (Slice 3.2 fills the contract
// shape). RawTaptosignScrape now lives with its scraper in scrapers/taptosign.ts.
export type RouteoneSyncPayload = { contracts: never[] }

// ── API results (background worker → popup) ───────────────────────────────────
export type SyncResult =
  | { ok: true; dealId: string; action: "created" | "updated"; lenderMapped: boolean }
  | { ok: false; error: string; status: number }

export type TestResult = { ok: true } | { ok: false; error: string; status: number }

// ── Message envelopes (popup → background) ────────────────────────────────────
export type SyncDealMessage = { type: "SYNC_DEAL"; payload: TaptosignDealPayload }
export type SyncRouteoneMessage = { type: "SYNC_ROUTEONE"; payload: RouteoneSyncPayload }
export type TestConnectionMessage = { type: "TEST_CONNECTION" }
export type BackgroundMessage =
  | SyncDealMessage
  | SyncRouteoneMessage
  | TestConnectionMessage

export type Settings = { token?: string; serverUrl: string }

export const DEFAULT_SERVER_URL = "http://localhost:3000"
