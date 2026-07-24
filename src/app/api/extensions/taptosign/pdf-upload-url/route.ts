// ============================================================
// POST /api/extensions/taptosign/pdf-upload-url
// ============================================================
// Issues a short-lived Supabase Storage signed upload URL so the extension can
// upload a TaptoSign PDF DIRECTLY to Storage (client → Supabase), bypassing
// Vercel's 4.5MB serverless request-body limit. The extension then calls the
// extraction routes with the returned `path` (a few hundred bytes) instead of the
// ~10-15MB base64 payload. See src/lib/pdf-staging.ts.
//
// SECURITY INVARIANT — service-role client. The upload path is server-issued as
// `{dealershipId}/…`; the extraction routes validate that prefix before download.
// ============================================================

import { NextResponse } from "next/server"
import { randomUUID } from "crypto"
import { z } from "zod"
import { validateExtensionToken } from "@/lib/extension-tokens"
import { createServiceRoleClient } from "@/lib/supabase/service"
import { PDF_BUCKET } from "@/lib/pdf-staging"

const bodySchema = z.object({ taptosignDealId: z.string().min(1) })

export async function POST(request: Request) {
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  const { dealershipId } = ctx

  let raw: unknown
  try {
    raw = await request.json()
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 })
  }
  const parsed = bodySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid payload." }, { status: 422 })
  }

  const supabase = createServiceRoleClient()
  const path = `${dealershipId}/${randomUUID()}.pdf`

  const { data, error } = await supabase.storage
    .from(PDF_BUCKET)
    .createSignedUploadUrl(path)
  if (error || !data) {
    console.error("[pdf-upload-url] createSignedUploadUrl failed:", error)
    return NextResponse.json({ error: "Could not create an upload URL." }, { status: 500 })
  }

  // `data.signedUrl` is a path relative to the Supabase project; make it absolute
  // so the extension can PUT to it directly (the token is embedded in the query).
  const base = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "")
  const uploadUrl = data.signedUrl.startsWith("http")
    ? data.signedUrl
    : `${base}${data.signedUrl}`

  return NextResponse.json({ uploadUrl, path })
}
