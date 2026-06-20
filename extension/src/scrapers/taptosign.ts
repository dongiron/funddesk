import type { TaptosignDealPayload } from "../shared/types"

// Flat object returned by the MAIN-world scrape (a window.pdfSignData read).
// Scraper-internal; the wire shape (TaptosignDealPayload) lives in shared/.
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

// ── MAIN-world scrape ─────────────────────────────────────────────────────────
// Injected into the page's real JS context. MUST be self-contained (no closures
// or imports) — it is serialized by source and run in world: "MAIN".
function scrapeFromMainWorld() {
  // @ts-expect-error pdfSignData is injected by TaptoSign
  const data = window.pdfSignData
  if (!data || typeof data !== "object") return null
  return {
    taptosignDealId: data.Id ?? null,
    customerName: data.BuyerName ?? data.BuyerNameOnDocument ?? null,
    customerEmail: data.BuyerEmail ?? null,
    coBuyerName: data.CoBuyerName ?? data.CoBuyerNameOnDocument ?? null,
    coBuyerEmail: data.CoBuyerEmail ?? null,
    vehicleYear: data.Year ?? null,
    vehicleMake: data.Make ?? null,
    vehicleModel: data.Model ?? null,
    vehicleVin: data.Vin ?? null,
    vehicleMileage: data.Mile ?? null,
    stockNumber: data.StockNumber ?? null,
    salePrice: data.SalesPrice ?? data.BottomLineSellPrice ?? data.VehiclePrice ?? null,
    downPayment: data.TotalCashDownAmount ?? data.TotalDownPayment ?? null,
    amountFinanced: data.AmountFinanced ?? data.FinancedAmount ?? null,
    apr: data.APRRate ?? null,
    term: data.Term ?? null,
    monthlyPayment: data.MonthlyPayment ?? data.MonthlyPaymentAmount ?? null,
    saleDate: data.SaleDate ?? null,
    salesPersonName: data.SalesPersonName ?? data.Salesman ?? null,
    financeManagerName: data.FinanceManagerName ?? null,
    lenderName: data.AssignToLender ?? null,
    signed:
      data.IsBuyerSigned === true ||
      data.IsBuyerSigned === "true" ||
      Boolean(data.BuyerSignedDate),
    signedDate: data.BuyerSignedDate ?? data.DealCompletedDate ?? null,
    isCoBuyerSigned: data.IsCoBuyerSigned === true || Boolean(data.CoBuyerSignedDate),
  }
}

export async function getScrapedDeal(): Promise<RawTaptosignScrape | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) return null
    let host: string
    try {
      host = new URL(tab.url).hostname
    } catch {
      return null
    }
    if (host !== "taptosign.com" && !host.endsWith(".taptosign.com")) return null
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      world: "MAIN",
      func: scrapeFromMainWorld,
    })
    return (results?.[0]?.result as RawTaptosignScrape | null) ?? null
  } catch {
    return null
  }
}

// ── Flat scrape → nested wire payload ─────────────────────────────────────────
function str(v: string | number | null | undefined): string | undefined {
  if (v == null) return undefined
  const s = String(v).trim()
  return s === "" ? undefined : s
}
function toNum(v: string | number | null | undefined): number | undefined {
  if (v == null || v === "") return undefined
  const n = typeof v === "number" ? v : Number(String(v).replace(/[$,%\s]/g, ""))
  return Number.isFinite(n) ? n : undefined
}
// Split a full name on the FIRST space: "Robert Downey Jr" → "Robert" / "Downey
// Jr"; "Madonna" → "Madonna" / "".
function splitName(full: string | null | undefined): { firstName: string; lastName: string } {
  const trimmed = (full ?? "").trim()
  if (!trimmed) return { firstName: "", lastName: "" }
  const idx = trimmed.indexOf(" ")
  if (idx === -1) return { firstName: trimmed, lastName: "" }
  return { firstName: trimmed.slice(0, idx), lastName: trimmed.slice(idx + 1).trim() }
}

export function mapScrape(raw: RawTaptosignScrape | null): TaptosignDealPayload | null {
  if (!raw || !raw.taptosignDealId) return null
  const buyer = splitName(raw.customerName)
  const hasCoBuyer = Boolean(raw.coBuyerName || raw.coBuyerEmail)
  const hasSales = Boolean(raw.salesPersonName || raw.financeManagerName)
  return {
    taptosignDealId: String(raw.taptosignDealId),
    customer: {
      firstName: buyer.firstName || undefined,
      lastName: buyer.lastName || undefined,
      email: str(raw.customerEmail),
    },
    coBuyer: hasCoBuyer
      ? { name: str(raw.coBuyerName), email: str(raw.coBuyerEmail), signed: raw.isCoBuyerSigned === true }
      : undefined,
    vehicle: {
      vin: str(raw.vehicleVin),
      year: str(raw.vehicleYear),
      make: str(raw.vehicleMake),
      model: str(raw.vehicleModel),
      miles: str(raw.vehicleMileage),
      stockNumber: str(raw.stockNumber),
    },
    finance: {
      salePrice: toNum(raw.salePrice),
      downPayment: toNum(raw.downPayment),
      amountFinanced: toNum(raw.amountFinanced),
      apr: toNum(raw.apr),
      term: toNum(raw.term),
      monthlyPayment: toNum(raw.monthlyPayment),
      lenderName: str(raw.lenderName),
    },
    sales: hasSales
      ? { salesPersonName: str(raw.salesPersonName), financeManagerName: str(raw.financeManagerName) }
      : undefined,
    signed: raw.signed === true,
    signedAt: str(raw.signedDate),
    saleDate: str(raw.saleDate),
  }
}
