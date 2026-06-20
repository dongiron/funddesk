import { clearToken, getSettings, setSettings } from "../lib/storage"
import type {
  RawTaptosignScrape,
  Settings,
  SyncResult,
  TaptosignDealPayload,
  TestResult,
} from "../shared/types"

const app = document.getElementById("app") as HTMLElement
let forceSettings = false

function esc(s: string): string {
  const d = document.createElement("div")
  d.textContent = s
  return d.innerHTML
}
function header(tag: string): string {
  return `<div class="head"><span class="wordmark">FundDesk</span><span class="tag">${esc(tag)}</span></div>`
}
function settingsLink(): string {
  return `<div class="row"><span></span><button id="settings-link" class="link">settings</button></div>`
}
function wireSettingsLink() {
  document.getElementById("settings-link")?.addEventListener("click", () => {
    forceSettings = true
    render()
  })
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

async function getScrapedDeal(): Promise<RawTaptosignScrape | null> {
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

function mapScrape(raw: RawTaptosignScrape | null): TaptosignDealPayload | null {
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

// ── State 1 / settings — connect form ─────────────────────────────────────────
function renderConnect(settings: Settings, isSettings: boolean) {
  app.innerHTML = `
    ${header(isSettings ? "settings" : "connect")}
    <div class="field">
      <label class="label" for="token">api token</label>
      <input id="token" type="password" placeholder="fde_…" autocomplete="off" />
    </div>
    <div class="field">
      <label class="label" for="server">server url</label>
      <input id="server" type="text" value="${esc(settings.serverUrl)}" />
    </div>
    <p id="error" class="error"></p>
    <button id="connect" class="btn-gold btn-full">Save &amp; Connect</button>
    ${
      isSettings
        ? `<div class="row"><button id="disconnect" class="link">disconnect</button><button id="cancel" class="link">cancel</button></div>`
        : ""
    }
  `

  const tokenInput = document.getElementById("token") as HTMLInputElement
  const serverInput = document.getElementById("server") as HTMLInputElement
  const errorEl = document.getElementById("error") as HTMLElement
  const connectBtn = document.getElementById("connect") as HTMLButtonElement

  const showError = (msg: string) => {
    errorEl.textContent = msg
  }

  connectBtn.addEventListener("click", async () => {
    errorEl.textContent = ""
    const token = tokenInput.value.trim()
    const serverUrl = serverInput.value.trim().replace(/\/+$/, "")

    if (!token.startsWith("fde_")) {
      showError("That doesn't look like a FundDesk token (should start with fde_).")
      return
    }
    let origin: string
    try {
      origin = new URL(serverUrl).origin
    } catch {
      showError("Enter a valid server URL, e.g. http://localhost:3000")
      return
    }

    connectBtn.disabled = true
    connectBtn.textContent = "Connecting…"

    // Request host permission for the user-entered origin at connect time (this
    // click is the required user gesture).
    let granted = false
    try {
      granted = await chrome.permissions.request({ origins: [`${origin}/*`] })
    } catch {
      granted = false
    }
    if (!granted) {
      connectBtn.disabled = false
      connectBtn.textContent = "Save & Connect"
      showError("Permission to reach that server was denied.")
      return
    }

    await setSettings({ token, serverUrl })
    const result = (await chrome.runtime.sendMessage({
      type: "TEST_CONNECTION",
    })) as TestResult

    if (result.ok) {
      forceSettings = false
      render()
    } else {
      connectBtn.disabled = false
      connectBtn.textContent = "Save & Connect"
      showError(result.error)
    }
  })

  if (isSettings) {
    document.getElementById("disconnect")?.addEventListener("click", async () => {
      await clearToken()
      forceSettings = false
      render()
    })
    document.getElementById("cancel")?.addEventListener("click", () => {
      forceSettings = false
      render()
    })
  }
}

// ── State 2 — connected, not on a deal page ───────────────────────────────────
function renderConnected(_settings: Settings) {
  app.innerHTML = `
    ${header("connected")}
    <div class="notice">Open a TaptoSign deal page to sync.</div>
    ${settingsLink()}
  `
  wireSettingsLink()
}

// ── State 3 — on a deal page ──────────────────────────────────────────────────
function renderDeal(p: TaptosignDealPayload) {
  const customerName =
    [p.customer.firstName, p.customer.lastName].filter(Boolean).join(" ").trim() || "—"
  const coBuyer = p.coBuyer?.name?.trim()
  const vehicle = [p.vehicle.year, p.vehicle.make, p.vehicle.model].filter(Boolean).join(" ").trim()
  const stockMile = [
    p.vehicle.stockNumber ? `stk ${p.vehicle.stockNumber}` : "",
    p.vehicle.miles ? `${p.vehicle.miles} mi` : "",
  ]
    .filter(Boolean)
    .join(" · ")
  const lender = p.finance.lenderName?.trim()
  const signedBadge = p.signed
    ? `<span class="badge ok">signed${p.signedAt ? ` ${esc(p.signedAt)}` : ""}</span>`
    : `<span class="badge muted">not yet signed</span>`

  app.innerHTML = `
    ${header(`deal #${esc(p.taptosignDealId)}`)}
    <div class="preview">
      <div class="pv-name">${esc(customerName)}${coBuyer ? `<span class="pv-co">+ ${esc(coBuyer)}</span>` : ""}</div>
      <div class="pv-line">${vehicle ? esc(vehicle) : `<span class="empty">vehicle —</span>`}${
        p.vehicle.vin ? ` <span class="mono pv-vin">${esc(p.vehicle.vin)}</span>` : ""
      }</div>
      ${stockMile ? `<div class="pv-sub mono">${esc(stockMile)}</div>` : ""}
      <div class="pv-line">${lender ? esc(lender) : `<span class="empty">lender not yet assigned</span>`}</div>
      <div class="pv-line">${signedBadge}</div>
    </div>
    <button id="sync" class="btn-gold btn-full">Sync to FundDesk</button>
    <div id="result"></div>
    ${settingsLink()}
  `
  wireSettingsLink()

  const syncBtn = document.getElementById("sync") as HTMLButtonElement
  const resultEl = document.getElementById("result") as HTMLElement

  syncBtn.addEventListener("click", async () => {
    syncBtn.disabled = true
    syncBtn.textContent = "Syncing…"
    resultEl.innerHTML = ""

    const result = (await chrome.runtime.sendMessage({
      type: "SYNC_DEAL",
      payload: p,
    })) as SyncResult

    if (result.ok) {
      const lenderNote = result.lenderMapped ? "" : " · lender unmapped"
      resultEl.innerHTML = `<p class="ok">Synced ✓ (${result.action}${lenderNote})</p>`
      syncBtn.textContent = "Synced"
      setTimeout(() => window.close(), 2000)
    } else {
      resultEl.innerHTML = `<p class="error">${esc(result.error)}</p>`
      syncBtn.textContent = "Sync to FundDesk"
      syncBtn.disabled = false
    }
  })
}

// ── Boot ──────────────────────────────────────────────────────────────────────
async function render() {
  const settings = await getSettings()
  if (!settings.token || forceSettings) {
    renderConnect(settings, forceSettings)
    return
  }
  const payload = mapScrape(await getScrapedDeal())
  if (payload) renderDeal(payload)
  else renderConnected(settings)
}

render()
