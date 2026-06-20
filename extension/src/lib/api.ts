import { getSettings } from "./storage"
import type { SyncResult, TaptosignDealPayload, TestResult } from "../shared/types"

// Typed fetch wrapper, called from the background service worker. The worker has
// host permission for the configured FundDesk origin (granted at connect time),
// so these cross-origin requests are not subject to page CORS.

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "")
}

function describeStatus(status: number): string {
  if (status === 401) return "Token invalid or revoked. Re-connect with a fresh token."
  if (status === 422) return "FundDesk rejected the deal data (validation)."
  if (status >= 500) return `FundDesk server error (${status}).`
  return `Unexpected response (${status}).`
}

export async function syncDeal(
  payload: TaptosignDealPayload
): Promise<SyncResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(`${normalizeBase(serverUrl)}/api/extensions/taptosign/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return {
      ok: false,
      error: "Couldn't reach FundDesk. Check the server URL and that it's running.",
      status: 0,
    }
  }

  if (res.ok) {
    try {
      const data = (await res.json()) as {
        dealId: string
        action: "created" | "updated"
        lenderMapped: boolean
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "FundDesk returned an unreadable response.", status: res.status }
    }
  }

  return { ok: false, error: describeStatus(res.status), status: res.status }
}

export async function testConnection(): Promise<TestResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(`${normalizeBase(serverUrl)}/api/extensions/taptosign/health`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    })
  } catch {
    return {
      ok: false,
      error: "Couldn't reach FundDesk. Check the server URL and that it's running.",
      status: 0,
    }
  }

  if (res.ok) return { ok: true }
  return { ok: false, error: describeStatus(res.status), status: res.status }
}
