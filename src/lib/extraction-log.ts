import { createHash } from "crypto"

// Structured debug log for the PDF extractors (Slice 3.9). Records which schema
// fields came back populated vs null, plus a short PDF hash for correlating
// repeat/failed extractions. Logs to console (captured by Vercel) — no PII in
// the field names, and values are intentionally NOT logged.
export function logExtraction(
  tag: string,
  pdfBase64: string,
  extracted: Record<string, unknown>,
  extra: Record<string, string | number | boolean> = {}
): void {
  const present: string[] = []
  const nulls: string[] = []
  for (const [key, value] of Object.entries(extracted)) {
    if (value === null || value === undefined || value === "") nulls.push(key)
    else present.push(key)
  }
  const hash = createHash("sha256").update(pdfBase64).digest("hex").slice(0, 16)
  const extras = Object.entries(extra)
    .map(([k, v]) => `${k}=${v}`)
    .join(" ")
  console.log(
    `[${tag}] extraction pdf=${hash} present=${present.length} nulls=${nulls.length} ` +
      `nullFields=[${nulls.join(",")}]${extras ? " " + extras : ""}`
  )
}
