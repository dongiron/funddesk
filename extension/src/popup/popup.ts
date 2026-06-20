import { clearToken, getSettings, setSettings } from "../lib/storage"
import type { Settings, SyncResult, TaptosignDealPayload, TestResult } from "../shared/types"
import { getScrapedDeal, mapScrape } from "../scrapers/taptosign"
import { getRouteoneScrape } from "../scrapers/routeone"

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

// ── Site detection ────────────────────────────────────────────────────────────
type Site = "taptosign" | "routeone" | null
async function detectSite(): Promise<Site> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.url) return null
  let host: string
  try {
    host = new URL(tab.url).hostname
  } catch {
    return null
  }
  if (host === "taptosign.com" || host.endsWith(".taptosign.com")) return "taptosign"
  if (host === "www.routeone.net" || host.endsWith(".routeone.net")) return "routeone"
  return null
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

// ── State 2 — connected, no syncable deal on the active tab ───────────────────
function renderConnected(message: string) {
  app.innerHTML = `
    ${header("connected")}
    <div class="notice">${esc(message)}</div>
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

  const site = await detectSite()
  if (site === "taptosign") {
    const payload = mapScrape(await getScrapedDeal())
    if (payload) renderDeal(payload)
    else renderConnected("Open a TaptoSign deal page to sync.")
  } else if (site === "routeone") {
    const routeone = await getRouteoneScrape() // stubbed → null until Slice 3.2
    if (routeone) {
      // Slice 3.2 will render a RouteOne preview here.
      renderConnected("RouteOne sync arrives in the next update.")
    } else {
      renderConnected("RouteOne sync arrives in the next update.")
    }
  } else {
    renderConnected("Open a TaptoSign deal page to sync.")
  }
}

render()
