// ============================================================
// GET /api/extensions/taptosign/health
// ============================================================
// Lets the extension verify a token works before attempting a sync. Same auth as
// the sync route (extension Bearer token, not a Supabase Auth session). Returns
// the bare minimum — never leaks user or dealership identifiers.
// ============================================================

import { NextResponse } from "next/server"
import { validateExtensionToken } from "@/lib/extension-tokens"

export async function GET(request: Request) {
  const ctx = await validateExtensionToken(request.headers.get("authorization"))
  if (!ctx) {
    return NextResponse.json({ error: "Invalid or missing token." }, { status: 401 })
  }
  return NextResponse.json({ status: "ok" })
}
