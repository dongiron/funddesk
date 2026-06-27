import type { DecisionSummaryPayload, RouteoneSyncPayload } from "../shared/types"

// Injected into the RouteOne tab (ISOLATED world — DOM access, no page globals).
// MUST be self-contained: no imports, no closures. Returns { contracts } or null.
function scrapeContractManager(): { contracts: unknown[] } | null {
  const rows = document.querySelectorAll("tr.contentOddColor, tr.contentEvenColor")
  if (rows.length === 0) return null
  // Contract Manager rows have 12 cells; Deal Manager has 5. Bail if not CM.
  if ((rows[0] as HTMLTableRowElement).cells?.length !== 12) return null

  const param = (href: string, key: string): string | null => {
    const m = new RegExp(`[?&]${key}=([^&]+)`, "i").exec(href)
    return m ? decodeURIComponent(m[1]) : null
  }
  const txt = (el: Element | null): string | null => {
    const s = el?.textContent?.replace(/\u00a0/g, " ").trim()
    return s ? s.replace(/\s+/g, " ") : null
  }
  const money = (el: Element | null): number | null => {
    const s = el?.textContent?.replace(/[$,\s\u00a0]/g, "")
    if (!s) return null
    const n = Number(s)
    return Number.isFinite(n) ? n : null
  }
  const isoDate = (s: string | null): string | null => {
    const m = s ? /(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s) : null
    return m ? `${m[3]}-${m[1].padStart(2, "0")}-${m[2].padStart(2, "0")}` : null
  }

  const contracts: unknown[] = []
  for (const row of Array.from(rows)) {
    const cells = (row as HTMLTableRowElement).cells
    if (!cells || cells.length !== 12) continue
    const customerCell = cells[2]
    const link = customerCell.querySelector("a")
    const routeoneDealId = link ? param(link.getAttribute("href") ?? "", "creditAppOID") : null
    if (!routeoneDealId) continue // required — skip rows without it
    const lenderCell = cells[4]
    // Cell 6 (0-based [5]): funding age in days. parseInt is lenient ("5 days"
    // → 5); non-numeric → null.
    const ageRaw = parseInt((cells[5].textContent ?? "").trim(), 10)
    const fundingAgeDays = Number.isFinite(ageRaw) ? ageRaw : null
    // Contract-returned signal: dual-source for resilience — the status cell text
    // ("Contract Rejected") OR a rejection icon anywhere in the row (alt text is
    // stable across the gif variants contract_rejected.gif / eCanceled.gif).
    const statusText = txt(cells[3])
    const contractReturned =
      !!row.querySelector('img[alt="Contract Rejected"]') ||
      /contract rejected/i.test(statusText ?? "")
    contracts.push({
      routeoneDealId,
      contractNumber: txt(cells[1]),
      contractDate: isoDate(txt(cells[0])),
      customerName: txt(link),
      fundingLenderName: txt(lenderCell),
      fundingStatus: statusText,
      contractReturned,
      hasUnreadMessage: !!lenderCell.querySelector('a[href*="anchorTextMessages"]'),
      amountFinanced: money(cells[6]),
      reserveAmount: money(cells[7]),
      netProceeds: money(cells[8]),
      isDspOriginated: !!customerCell.querySelector('img[alt="from Dsp"]'),
      transactionType: txt(cells[10]),
      fundingAgeDays,
    })
  }
  return contracts.length > 0 ? { contracts } : null
}

// Injected into the RouteOne tab (ISOLATED world). MUST be self-contained: no
// imports, no closures. Scrapes the Decision History table on the Decision
// Summary page for Booked/Funded decisions — the authoritative source for those
// events (the Contract Manager status cell stays sticky on "Contract Rejected").
async function scrapeDecisionSummary(): Promise<{
  applicant: string | null
  routeoneAppNumber: string | null
  fsAppNumber: string | null
  decisions: {
    decisionNumber: number
    eventAt: string
    statusRaw: string
    eventType: "booked" | "funded"
  }[]
  messages: {
    routeoneAppNumber: string | null
    senderName: string
    body: string
    receivedAt: string
  }[]
} | null> {
  // The page lives in a nested same-origin frame; when injected into that frame
  // we read `document` directly, otherwise reach it via the RouteOneFrame.
  const doc =
    document.title === "Decision Summary"
      ? document
      : ((document.getElementById("RouteOneFrame") as HTMLIFrameElement | null)
          ?.contentDocument ?? null)
  if (!doc || doc.title !== "Decision Summary") return null

  const txt = (el: Element | null): string =>
    (el?.textContent ?? "").replace(/ /g, " ").replace(/\s+/g, " ").trim()

  // "MM/DD/YYYY - HH:MM AM/PM" → ISO. Parsed here (browser = dealership-local
  // tz, which is what RouteOne renders) so toISOString() yields correct UTC.
  const parseDate = (s: string): string | null => {
    const m = /(\d{1,2})\/(\d{1,2})\/(\d{4})\s*-\s*(\d{1,2}):(\d{2})\s*([AP]M)/i.exec(s)
    if (!m) return null
    let h = +m[4] % 12
    if (/p/i.test(m[6])) h += 12
    const d = new Date(+m[3], +m[1] - 1, +m[2], h, +m[5], 0, 0)
    return Number.isNaN(d.getTime()) ? null : d.toISOString()
  }

  // Find the Decision History table by its HEADER ROW (rows[0]) requiring BOTH a
  // Dec column and a Date/Time column. Three lookalike tables (Deal Recap,
  // Additional Deal Information, Documentation/Funding Details) share one of these
  // headers but not both. The Dec regex is anchored so it matches "Dec" / "Dec." /
  // "Dec #" / "Dec. #" but NOT the substring in "Decision" (the original bug). The
  // header's first cell can be blank, so we scan all header cells.
  let historyTable: HTMLTableElement | null = null
  for (const t of Array.from(doc.querySelectorAll("table"))) {
    const headerTexts = Array.from(t.rows[0]?.cells || []).map((c) => txt(c))
    const hasDec = headerTexts.some((s) => /^dec\.?(\s*#)?$/i.test(s))
    const hasDateTime = headerTexts.some((s) => /date\s*\/\s*time/i.test(s))
    if (hasDec && hasDateTime) {
      historyTable = t as HTMLTableElement
      break
    }
  }
  if (!historyTable) {
    console.warn(
      "[funddesk] Decision History table not found (no table had both Dec and Date/Time headers)."
    )
    return null
  }

  // Resolve column positions from the header text rather than hardcoding indexes.
  // The table has a blank leading cell (so Dec.# is not cells[0]), and reading by
  // header survives future RouteOne layout changes (added/reordered columns).
  const headerCells = Array.from(historyTable.rows[0].cells).map((c) => txt(c))
  const colIdx = {
    dec: headerCells.findIndex((h) => /^dec\.?(\s*#)?$/i.test(h)),
    dateTime: headerCells.findIndex((h) => /date\s*\/\s*time/i.test(h)),
    status: headerCells.findIndex((h) => /^status$/i.test(h)),
  }
  if (colIdx.dec < 0 || colIdx.dateTime < 0 || colIdx.status < 0) {
    console.warn("[funddesk] DS header missing required columns", headerCells)
    return null
  }
  const minCells = Math.max(colIdx.dec, colIdx.dateTime, colIdx.status) + 1

  // Data rows start at rows[1]. Skip any row whose Dec cell isn't a positive
  // integer (defends against trailing summary rows).
  const decisions: {
    decisionNumber: number
    eventAt: string
    statusRaw: string
    eventType: "booked" | "funded"
  }[] = []
  for (let i = 1; i < historyTable.rows.length; i++) {
    const cells = historyTable.rows[i].cells
    if (cells.length < minCells) continue
    const decisionNumber = parseInt(txt(cells[colIdx.dec]), 10)
    if (!Number.isFinite(decisionNumber) || decisionNumber <= 0) continue
    const statusRaw = txt(cells[colIdx.status])
    if (!/^(booked|funded)$/i.test(statusRaw)) continue // skip Approved/Conditioned
    const eventAt = parseDate(txt(cells[colIdx.dateTime]))
    if (!eventAt) continue
    decisions.push({
      decisionNumber,
      eventAt,
      statusRaw,
      eventType: /^booked$/i.test(statusRaw) ? "booked" : "funded",
    })
  }

  // Header identifiers for deal matching. The verified DS DOM puts the label and
  // its value in ADJACENT sibling elements, not the same node:
  //   <div class="textStrong">Applicant Name:</div><div>Mitchell, Nicola</div>
  // Primary pass: find the label-only element and read its sibling (or, if the
  // label sits in its own wrapper, the wrapper's next sibling). Fallback pass:
  // an inline "Label: value" in one element, bounded so a multi-field container
  // can't run on into the next label.
  const labelValue = (label: string): string | null => {
    const esc = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    const labelOnlyRe = new RegExp("^" + esc + "\\s*:?\\s*$", "i")
    const inlineRe = new RegExp(
      "^" +
        esc +
        "\\s*:\\s*(.+?)(?:\\s+(?:RouteOne App|FS App|Applicant Name|Dealer|Status|Product)\\b.*)?$",
      "i"
    )
    const els = Array.from(doc.querySelectorAll("td,th,span,div,label,b,strong,p,li"))
    for (const el of els) {
      if (!labelOnlyRe.test(txt(el))) continue
      const sib = el.nextElementSibling ? txt(el.nextElementSibling) : ""
      if (sib) return sib
      const pSib = el.parentElement?.nextElementSibling
      const pSibText = pSib ? txt(pSib) : ""
      if (pSibText) return pSibText
    }
    for (const el of els) {
      const m = inlineRe.exec(txt(el))
      if (m && m[1].trim()) return m[1].trim()
    }
    return null
  }

  // Capture lender text messages from the "View Related Text Messages" modal
  // (best-effort — a failure here never blocks decision capture). Open the modal,
  // poll for .displayRelatedMessages, scrape the ul rows, then close the dialog.
  const messages: {
    routeoneAppNumber: string | null
    senderName: string
    body: string
    receivedAt: string
  }[] = []
  try {
    const btn = Array.from(
      doc.querySelectorAll("button, a, input[type='button'], input[type='submit']")
    ).find((el) =>
      /view related text messages/i.test(txt(el) || (el as HTMLInputElement).value || "")
    ) as HTMLElement | undefined
    if (btn) {
      btn.click()
      const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))
      let container: Element | null = null
      for (let i = 0; i < 30; i++) {
        container = doc.querySelector(".displayRelatedMessages")
        if (container && container.querySelectorAll("ul").length > 0) break
        await wait(100)
      }
      if (container) {
        for (const ul of Array.from(container.querySelectorAll("ul"))) {
          if (ul.classList.contains("messageHeader")) continue
          const colTwo = ul.querySelector("li.colTwo")
          const colThree = ul.querySelector("li.colThree")
          const colFour = ul.querySelector("li.colFour")
          if (!colTwo || !colThree || !colFour) continue
          const senderName = txt(colTwo)
          // Strip HTML comments (e.g. <!--TLTIHB-->), then take the text.
          const cleaned = (colThree as HTMLElement).innerHTML.replace(/<!--[\s\S]*?-->/g, "")
          const tmp = doc.createElement("div")
          tmp.innerHTML = cleaned
          const body = txt(tmp)
          const receivedAt = parseDate(txt(colFour))
          if (!senderName || !body || !receivedAt) continue
          messages.push({
            routeoneAppNumber: txt(ul.querySelector("li.colOne")) || null,
            senderName,
            body,
            receivedAt,
          })
        }
      }
      const closeBtn = doc.querySelector(".ui-dialog-titlebar-close") as HTMLElement | null
      closeBtn?.click()
    }
  } catch {
    // best-effort: leave messages empty on any failure
  }

  return {
    applicant: labelValue("Applicant Name"),
    routeoneAppNumber: labelValue("RouteOne App #"),
    fsAppNumber: labelValue("FS App #"),
    decisions,
    messages,
  }
}

export async function getRouteoneScrape(): Promise<RouteoneSyncPayload | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) return null
    let host: string
    try {
      host = new URL(tab.url).hostname
    } catch {
      return null
    }
    if (host !== "www.routeone.net" && !host.endsWith(".routeone.net")) return null
    // Contract Manager renders inside one of the page's iframes, so inject into
    // all frames; every other frame's scrape returns null via its own guard.
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "ISOLATED",
      func: scrapeContractManager,
    })
    const winner = results?.find((r) => {
      const result = r.result as RouteoneSyncPayload | null
      return !!result && result.contracts.length > 0
    })
    return (winner?.result as RouteoneSyncPayload | null) ?? null
  } catch {
    return null
  }
}

export async function getDecisionSummaryScrape(): Promise<DecisionSummaryPayload | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
    if (!tab?.id || !tab.url) return null
    let host: string
    try {
      host = new URL(tab.url).hostname
    } catch {
      return null
    }
    if (host !== "www.routeone.net" && !host.endsWith(".routeone.net")) return null
    // Decision Summary renders inside a nested frame — inject into all frames and
    // take whichever returns decisions (the others return null via their guard).
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id, allFrames: true },
      world: "ISOLATED",
      func: scrapeDecisionSummary,
    })
    const winner = results?.find((r) => {
      const result = r.result as DecisionSummaryPayload | null
      return !!result && result.decisions.length > 0
    })
    return (winner?.result as DecisionSummaryPayload | null) ?? null
  } catch {
    return null
  }
}
