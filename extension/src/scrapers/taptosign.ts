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
  frontGross: string | number | null
  backGross: string | number | null
  totalGross: string | number | null
  signed: boolean
  signedDate: string | null
  isCoBuyerSigned: boolean
  pdfBase64: string | null
  pdfUrlCompressed: string | null
  signedPdf: string | null
  pdfUrl: string | null
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
    frontGross: data.FrontGrossAmount ?? null,
    backGross: data.BackendGrossAmount ?? null,
    totalGross: data.TotalGrossAmount ?? data.DealerGrossAmount ?? null,
    signed:
      data.IsBuyerSigned === true ||
      data.IsBuyerSigned === "true" ||
      Boolean(data.BuyerSignedDate),
    signedDate: data.BuyerSignedDate ?? data.DealCompletedDate ?? null,
    isCoBuyerSigned: data.IsCoBuyerSigned === true || Boolean(data.CoBuyerSignedDate),
    pdfBase64: data.Base64Pdf ?? null,
    pdfUrlCompressed: data.PdfUrlCompressed ?? null,
    signedPdf: data.SignedPdf ?? null,
    pdfUrl: data.PdfUrl ?? null,
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

// ── Signed-contract PDF (for the second-stage extract) ────────────────────────
// Injected into the page to fetch the contract same-origin (so TaptoSign's
// session cookies apply) and return base64 — the popup's own origin can't reach
// the CDN. SignedPdf / PdfUrl are relative paths, so the absolute URL is built
// against the page origin and encodeURI'd (signed filenames contain spaces/colons).
function fetchPdfAsBase64(rawPath: string): Promise<string | null> {
  const base = rawPath.startsWith("/") ? window.location.origin + rawPath : rawPath
  const url = encodeURI(base)
  return fetch(url, { credentials: "include" })
    .then((r) => (r.ok ? r.blob() : null))
    .then(
      (blob) =>
        new Promise<string | null>((resolve) => {
          if (!blob) return resolve(null)
          const reader = new FileReader()
          reader.onloadend = () => {
            const result = reader.result
            if (typeof result !== "string") return resolve(null)
            const comma = result.indexOf(",") // strip "data:...;base64,"
            resolve(comma >= 0 ? result.slice(comma + 1) : null)
          }
          reader.onerror = () => resolve(null)
          reader.readAsDataURL(blob)
        })
    )
    .catch(() => null)
}

// Returns the contract PDF as base64. Priority: embedded Base64Pdf (free, but ""
// on signed deals), then PdfUrlCompressed (smallest, often unpopulated), then
// SignedPdf (the actual signed contract — preferred for parity with what the
// dealer submitted), then PdfUrl (unsigned template, slightly larger). The three
// path candidates are fetched in page context. null when no source is available.
export async function getPdfBase64(raw: RawTaptosignScrape): Promise<string | null> {
  if (raw.pdfBase64) return raw.pdfBase64
  const path = raw.pdfUrlCompressed || raw.signedPdf || raw.pdfUrl
  if (!path) return null
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id) return null
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: fetchPdfAsBase64,
      args: [path],
    })
    return (results?.[0]?.result as string | null) ?? null
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
      frontGross: toNum(raw.frontGross),
      backGross: toNum(raw.backGross),
      totalGross: toNum(raw.totalGross),
    },
    sales: hasSales
      ? { salesPersonName: str(raw.salesPersonName), financeManagerName: str(raw.financeManagerName) }
      : undefined,
    signed: raw.signed === true,
    signedAt: str(raw.signedDate),
    saleDate: str(raw.saleDate),
  }
}
