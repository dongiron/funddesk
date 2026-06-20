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

// Flat object returned by the MAIN-world scrape (a window.pdfSignData read).
export type RawTaptosignScrape = {
  taptosignDealId: string | null
  customerName: string | null
  customerEmail: string | null
  coBuyerName: string | null
  coBuyerEmail: string | null
  vehicleYear: string | number | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleVin: string | null
  vehicleMileage: string | number | null
  stockNumber: string | number | null
  salePrice: string | number | null
  downPayment: string | number | null
  amountFinanced: string | number | null
  apr: string | number | null
  term: string | number | null
  monthlyPayment: string | number | null
  saleDate: string | null
  salesPersonName: string | null
  financeManagerName: string | null
  lenderName: string | null
  signed: boolean
  signedDate: string | null
  isCoBuyerSigned: boolean
}

// ── API results (background worker → popup) ───────────────────────────────────
export type SyncResult =
  | { ok: true; dealId: string; action: "created" | "updated"; lenderMapped: boolean }
  | { ok: false; error: string; status: number }

export type TestResult = { ok: true } | { ok: false; error: string; status: number }

// ── Message envelopes (popup → background) ────────────────────────────────────
export type SyncDealMessage = { type: "SYNC_DEAL"; payload: TaptosignDealPayload }
export type TestConnectionMessage = { type: "TEST_CONNECTION" }
export type BackgroundMessage = SyncDealMessage | TestConnectionMessage

export type Settings = { token?: string; serverUrl: string }

export const DEFAULT_SERVER_URL = "http://localhost:3000"
