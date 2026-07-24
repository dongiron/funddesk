import { getSettings } from "./storage"
import type {
  BosExtractPayload,
  BosExtractResult,
  DecisionSummaryPayload,
  DecisionSummaryResult,
  MessagesSyncPayload,
  MessagesSyncResult,
  PdfExtractPayload,
  PdfExtractResult,
  RouteoneSyncPayload,
  RouteoneSyncResult,
  RouteoneUnmatchedRow,
  RouteoneErroredRow,
  StagePdfPayload,
  StagePdfResult,
  SyncResult,
  TaptosignDealPayload,
  TestResult,
} from "../shared/types"

// Typed fetch wrapper, called from the background service worker. The worker has
// host permission for the configured FundDesk origin (granted at connect time),
// so these cross-origin requests are not subject to page CORS.

function normalizeBase(url: string): string {
  return url.replace(/\/+$/, "")
}

function syncUrl(base: string, source: "taptosign" | "routeone"): string {
  return `${normalizeBase(base)}/api/extensions/${source}/sync`
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
    res = await fetch(syncUrl(serverUrl, "taptosign"), {
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

export async function syncRouteoneBatch(
  payload: RouteoneSyncPayload
): Promise<RouteoneSyncResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(syncUrl(serverUrl, "routeone"), {
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
        matched: number
        unmatched: number
        unmatchedRows: RouteoneUnmatchedRow[]
        errored: number
        erroredRows: RouteoneErroredRow[]
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "FundDesk returned an unreadable response.", status: res.status }
    }
  }

  return { ok: false, error: describeStatus(res.status), status: res.status }
}

export async function syncPdfExtract(
  payload: PdfExtractPayload
): Promise<PdfExtractResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(`${normalizeBase(serverUrl)}/api/extensions/taptosign/pdf-extract`, {
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
        fieldsUpdated: number
        extracted: Record<string, unknown>
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "FundDesk returned an unreadable response.", status: res.status }
    }
  }

  // Surface the server's specific message (404 deal-not-found, 413 too-large, …)
  // when present; fall back to the generic status description.
  let message = describeStatus(res.status)
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) message = body.error
  } catch {
    // keep the fallback
  }
  return { ok: false, error: message, status: res.status }
}

export async function syncBosExtract(
  payload: BosExtractPayload
): Promise<BosExtractResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(`${normalizeBase(serverUrl)}/api/extensions/taptosign/bos-extract`, {
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
        fieldsUpdated: number
        paymentMethod: "financed" | "cash"
        extracted: Record<string, unknown>
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "FundDesk returned an unreadable response.", status: res.status }
    }
  }

  // Surface the server's specific message (404 deal-not-found, 413 too-large, …).
  let message = describeStatus(res.status)
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) message = body.error
  } catch {
    // keep the fallback
  }
  return { ok: false, error: message, status: res.status }
}

export async function syncDecisionSummary(
  payload: DecisionSummaryPayload
): Promise<DecisionSummaryResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(
      `${normalizeBase(serverUrl)}/api/extensions/routeone/decision-summary`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      }
    )
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
        matched: 0 | 1
        inserted: number
        eventTypes: string[]
      }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "FundDesk returned an unreadable response.", status: res.status }
    }
  }

  let message = describeStatus(res.status)
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) message = body.error
  } catch {
    // keep the fallback
  }
  return { ok: false, error: message, status: res.status }
}

export async function syncMessages(
  payload: MessagesSyncPayload
): Promise<MessagesSyncResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  let res: Response
  try {
    res = await fetch(`${normalizeBase(serverUrl)}/api/extensions/routeone/messages`, {
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
      const data = (await res.json()) as { matched: 0 | 1; inserted: number }
      return { ok: true, ...data }
    } catch {
      return { ok: false, error: "FundDesk returned an unreadable response.", status: res.status }
    }
  }

  let message = describeStatus(res.status)
  try {
    const body = (await res.json()) as { error?: string }
    if (body?.error) message = body.error
  } catch {
    // keep the fallback
  }
  return { ok: false, error: message, status: res.status }
}

// Stage a PDF for extraction: ask FundDesk for a signed upload URL, then upload
// the bytes DIRECTLY to Supabase Storage — bypassing Vercel's 4.5MB serverless
// request-body limit. The extraction routes then receive just the returned path.
// NOTE: the upload PUT is cross-origin to Supabase; it relies on Supabase Storage
// sending permissive CORS on the signed-upload endpoint (its intended browser-
// upload use). If uploads fail on CORS, allow the extension origin in the Supabase
// Storage CORS settings (or grant the extension host permission for the project).
export async function stagePdf(payload: StagePdfPayload): Promise<StagePdfResult> {
  const { token, serverUrl } = await getSettings()
  if (!token) return { ok: false, error: "No token configured.", status: 0 }

  // 1. Get a signed upload URL from FundDesk.
  let urlRes: Response
  try {
    urlRes = await fetch(
      `${normalizeBase(serverUrl)}/api/extensions/taptosign/pdf-upload-url`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ taptosignDealId: payload.taptosignDealId }),
      }
    )
  } catch {
    return { ok: false, error: "Couldn't reach FundDesk to stage the PDF.", status: 0 }
  }
  if (!urlRes.ok) return { ok: false, error: describeStatus(urlRes.status), status: urlRes.status }

  let uploadUrl: string
  let path: string
  try {
    const data = (await urlRes.json()) as { uploadUrl: string; path: string }
    uploadUrl = data.uploadUrl
    path = data.path
  } catch {
    return { ok: false, error: "FundDesk returned an unreadable upload URL.", status: urlRes.status }
  }

  // 2. Decode base64 → bytes and PUT directly to Supabase Storage.
  let blob: Blob
  try {
    const bin = atob(payload.pdfBase64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    blob = new Blob([bytes], { type: "application/pdf" })
  } catch {
    return { ok: false, error: "Could not decode the PDF for upload.", status: 0 }
  }

  let putRes: Response
  try {
    putRes = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "x-upsert": "true" },
      body: blob,
    })
  } catch {
    return { ok: false, error: "Couldn't upload the PDF to storage.", status: 0 }
  }
  if (!putRes.ok) {
    return { ok: false, error: `PDF upload failed (${putRes.status}).`, status: putRes.status }
  }

  return { ok: true, path }
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
