import { clearToken, getSettings, setSettings } from "../lib/storage"
import type {
  BosExtractResult,
  DecisionSummaryPayload,
  DecisionSummaryResult,
  MessagesSyncResult,
  PdfExtractResult,
  RouteoneSyncPayload,
  RouteoneSyncResult,
  Settings,
  SyncResult,
  TaptosignDealPayload,
  TestResult,
} from "../shared/types"
import {
  getPdfBase64,
  getScrapedDeal,
  mapScrape,
  type RawTaptosignScrape,
} from "../scrapers/taptosign"
import { getDecisionSummaryScrape, getRouteoneScrape } from "../scrapers/routeone"

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
function renderDeal(p: TaptosignDealPayload, raw: RawTaptosignScrape) {
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

    // Stage 1 — basic field sync from pdfSignData.
    const result = (await chrome.runtime.sendMessage({
      type: "SYNC_DEAL",
      payload: p,
    })) as SyncResult

    if (!result.ok) {
      resultEl.innerHTML = `<p class="error">${esc(result.error)}</p>`
      syncBtn.textContent = "Sync to FundDesk"
      syncBtn.disabled = false
      return
    }

    const lenderNote = result.lenderMapped ? "" : " · lender unmapped"
    resultEl.innerHTML = `<p class="ok">Synced ✓ (${result.action}${lenderNote})</p>`
    syncBtn.textContent = "Synced"

    // Stages 2–3 — AI extraction from the signed PDF package. Best-effort: a
    // failure here never undoes the stage-1 sync that already landed. The same
    // base64 package feeds both extractors (BoS + RIC).
    const pdfBase64 = await getPdfBase64(raw)
    if (!pdfBase64) {
      setTimeout(() => window.close(), 2000)
      return
    }

    // Stage 2 — Bill of Sale: authoritative payment_method (RISC vs Cash).
    resultEl.innerHTML += `<p class="muted extracting">Extracting Bill of Sale…</p>`
    const bos = (await chrome.runtime.sendMessage({
      type: "SYNC_BOS_EXTRACT",
      payload: { taptosignDealId: p.taptosignDealId, pdfBase64 },
    })) as BosExtractResult

    if (!bos.ok) {
      resultEl.innerHTML = `<p class="ok">Synced ✓</p><p class="error">Bill of Sale extraction failed: ${esc(bos.error)}</p>`
      setTimeout(() => window.close(), 3000)
      return
    }

    let totalFields = bos.fieldsUpdated

    // Stage 3 — RIC financial extraction, only for financed deals.
    if (bos.paymentMethod === "financed") {
      resultEl.innerHTML += `<p class="muted extracting">Extracting contract…</p>`
      const ric = (await chrome.runtime.sendMessage({
        type: "SYNC_PDF_EXTRACT",
        payload: { taptosignDealId: p.taptosignDealId, pdfBase64 },
      })) as PdfExtractResult
      if (ric.ok) {
        totalFields += ric.fieldsUpdated
      } else {
        resultEl.innerHTML = `<p class="ok">Synced ✓ · ${esc(bos.paymentMethod)}</p><p class="error">contract extraction failed: ${esc(ric.error)}</p>`
        setTimeout(() => window.close(), 3000)
        return
      }
    }

    const fld = `${totalFields} field${totalFields === 1 ? "" : "s"}`
    resultEl.innerHTML = `<p class="ok">Synced ✓ · ${esc(bos.paymentMethod)} · done — extracted ${fld}</p>`
    setTimeout(() => window.close(), 3000)
  })
}

// ── State 3 (RouteOne) — Contract Manager batch ───────────────────────────────
function renderRouteoneBatch(payload: RouteoneSyncPayload) {
  const n = payload.contracts.length
  const plural = n === 1 ? "" : "s"
  const preview = payload.contracts
    .slice(0, 5)
    .map((c) => {
      const name = c.customerName?.trim() || "—"
      const lender = c.fundingLenderName?.trim() || "—"
      const status = c.fundingStatus?.trim() || "—"
      return `<div class="r1-row"><span class="r1-name">${esc(name)}</span><span class="pv-sub mono">${esc(lender)} · ${esc(status)}</span></div>`
    })
    .join("")
  const more = n > 5 ? `<div class="pv-sub muted">+${n - 5} more</div>` : ""

  // Surface deals with a yellow-envelope unread message — messages are scraped
  // per-deal from each Decision Summary (4a is manual; no auto-navigation).
  const unread = payload.contracts.filter((c) => c.hasUnreadMessage)
  const unreadNote = unread.length
    ? `<div class="pv-sub mono">${unread.length} deal${unread.length === 1 ? "" : "s"} with new messages — open each Decision Summary to sync</div>`
    : ""

  app.innerHTML = `
    ${header(`${n} contract${plural}`)}
    <div class="r1-title">${n} contract${plural} in funding</div>
    ${unreadNote}
    <div class="preview">${preview}${more}</div>
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
      type: "SYNC_ROUTEONE",
      payload,
    })) as RouteoneSyncResult

    if (result.ok) {
      let html = `<p class="ok">${result.matched} synced ✓ · ${result.unmatched} unmatched · ${result.errored} errored</p>`
      if (result.unmatched > 0) {
        const items = result.unmatchedRows
          .map((r) => `<li>${esc(r.customerName ?? "—")} <span class="mono muted">#${esc(r.routeoneDealId)}</span></li>`)
          .join("")
        html += `<details class="r1-list"><summary>${result.unmatched} unmatched</summary><ul>${items}</ul></details>`
      }
      if (result.errored > 0) {
        const items = result.erroredRows
          .map((r) => `<li>${esc(r.customerName ?? "—")} <span class="mono muted">#${esc(r.routeoneDealId)}</span><span class="error"> ${esc(r.error)}</span></li>`)
          .join("")
        html += `<details class="r1-list"><summary>${result.errored} errored</summary><ul>${items}</ul></details>`
      }
      resultEl.innerHTML = html
      syncBtn.textContent = "Synced"
      setTimeout(() => window.close(), 3000)
    } else {
      resultEl.innerHTML = `<p class="error">${esc(result.error)}</p>`
      syncBtn.textContent = "Sync to FundDesk"
      syncBtn.disabled = false
    }
  })
}

// ── State 3 (RouteOne) — Decision Summary booked/funded capture ───────────────
function renderDecisionSummary(payload: DecisionSummaryPayload) {
  const n = payload.decisions.length
  const applicant = payload.applicant?.trim() || "—"
  const preview = payload.decisions
    .slice(0, 6)
    .map(
      (d) =>
        `<div class="r1-row"><span class="r1-name">#${d.decisionNumber} ${esc(d.statusRaw)}</span><span class="pv-sub mono">${esc(d.eventAt.slice(0, 10))}</span></div>`
    )
    .join("")

  const msgCount = payload.messages.length
  const msgLine = msgCount
    ? `<div class="pv-sub mono">${msgCount} lender message${msgCount === 1 ? "" : "s"}</div>`
    : ""

  app.innerHTML = `
    ${header("decision summary")}
    <div class="r1-title">${esc(applicant)}</div>
    <div class="pv-sub mono">${n} booked/funded decision${n === 1 ? "" : "s"}</div>
    ${msgLine}
    <div class="preview">${preview}</div>
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
      type: "SYNC_DECISION_SUMMARY",
      payload,
    })) as DecisionSummaryResult

    if (!result.ok) {
      resultEl.innerHTML = `<p class="error">${esc(result.error)}</p>`
      syncBtn.textContent = "Sync to FundDesk"
      syncBtn.disabled = false
      return
    }
    if (result.matched === 0) {
      resultEl.innerHTML = `<p class="error">No matching deal found for ${esc(applicant)}.</p>`
      syncBtn.textContent = "Sync to FundDesk"
      syncBtn.disabled = false
      return
    }

    let summary = `${result.inserted} funding event${result.inserted === 1 ? "" : "s"}`

    // Also sync any lender messages captured in the same scrape.
    if (payload.messages.length > 0) {
      const msgResult = (await chrome.runtime.sendMessage({
        type: "SYNC_MESSAGES",
        payload: {
          dealMatch: {
            routeoneDealId: payload.fsAppNumber ?? payload.routeoneAppNumber,
            applicantName: payload.applicant,
          },
          messages: payload.messages,
        },
      })) as MessagesSyncResult
      if (msgResult.ok && msgResult.matched === 1) {
        summary += ` · ${msgResult.inserted} message${msgResult.inserted === 1 ? "" : "s"}`
      }
    }

    resultEl.innerHTML = `<p class="ok">Captured ${summary} ✓</p>`
    syncBtn.textContent = "Synced"
    setTimeout(() => window.close(), 3000)
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
    const raw = await getScrapedDeal()
    const payload = mapScrape(raw)
    if (payload && raw) renderDeal(payload, raw)
    else renderConnected("Open a TaptoSign deal page to sync.")
  } else if (site === "routeone") {
    // Decision Summary and Contract Manager are both routeone.net; each scraper
    // self-detects via its frame/title guard. Try Decision Summary first.
    const decisions = await getDecisionSummaryScrape()
    if (decisions && decisions.decisions.length > 0) {
      renderDecisionSummary(decisions)
    } else {
      const batch = await getRouteoneScrape()
      if (batch && batch.contracts.length > 0) renderRouteoneBatch(batch)
      else renderConnected("Open RouteOne Contract Manager or a Decision Summary to sync.")
    }
  } else {
    renderConnected("Open a TaptoSign deal page to sync.")
  }
}

render()
