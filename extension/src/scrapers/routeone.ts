import type { RouteoneSyncPayload } from "../shared/types"

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
    contracts.push({
      routeoneDealId,
      contractNumber: txt(cells[1]),
      contractDate: isoDate(txt(cells[0])),
      customerName: txt(link),
      fundingLenderName: txt(lenderCell),
      fundingStatus: txt(cells[3]),
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
