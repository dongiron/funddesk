import type { SupabaseClient } from "@supabase/supabase-js"

// Private Supabase Storage bucket used to stage TaptoSign PDFs so the extension
// can upload them directly (bypassing Vercel's 4.5MB serverless request-body
// limit) and the extraction routes download them server-side. Create it manually
// in the Supabase dashboard — see the slice notes. Accessed only via the
// service-role client + short-lived signed upload URLs; no public access.
export const PDF_BUCKET = "deal-pdfs"

// Download a staged PDF and return it base64-encoded for the Anthropic document
// block. Validates the path is scoped to the caller's dealership — the path is
// server-issued as `{dealershipId}/…`, so this blocks a token holder from reading
// another tenant's staged PDF by passing an arbitrary path.
export async function downloadStagedPdf(
  supabase: SupabaseClient,
  dealershipId: string,
  pdfPath: string
): Promise<{ ok: true; base64: string } | { ok: false; error: string }> {
  if (!pdfPath.startsWith(`${dealershipId}/`)) {
    return { ok: false, error: "PDF path is not scoped to this dealership." }
  }
  const { data, error } = await supabase.storage.from(PDF_BUCKET).download(pdfPath)
  if (error || !data) {
    return { ok: false, error: "Could not download the staged PDF." }
  }
  const base64 = Buffer.from(await data.arrayBuffer()).toString("base64")
  return { ok: true, base64 }
}

// Best-effort delete of a staged PDF once extraction is done. Never throws — a
// cleanup failure must not fail the extraction response.
export async function deleteStagedPdf(
  supabase: SupabaseClient,
  pdfPath: string
): Promise<void> {
  try {
    await supabase.storage.from(PDF_BUCKET).remove([pdfPath])
  } catch (err) {
    console.error("[pdf-staging] cleanup failed:", err)
  }
}
