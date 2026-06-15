// Client-side VIN decoding via NHTSA's free public vPIC API (CORS-enabled,
// no auth). https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/{VIN}

export type DecodedVin = {
  year: number | null
  make: string
  model: string
}

// 17 chars, excluding I, O, Q per the VIN standard.
export function isValidVinFormat(vin: string): boolean {
  return /^[A-HJ-NPR-Z0-9]{17}$/i.test(vin)
}

// "HONDA" -> "Honda", "ROLLS-ROYCE" -> "Rolls-Royce", "GENERAL MOTORS" -> "General Motors"
function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())
}

// Trim and treat empty / "Not Applicable" as missing.
function field(value: unknown): string {
  const s = typeof value === "string" ? value.trim() : ""
  if (!s || s.toLowerCase() === "not applicable") return ""
  return s
}

export async function decodeVin(
  vin: string,
  signal?: AbortSignal
): Promise<DecodedVin | null> {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/decodevinvalues/${encodeURIComponent(
    vin
  )}?format=json`

  const res = await fetch(url, { signal })
  if (!res.ok) throw new Error(`NHTSA responded ${res.status}`)

  const json = await res.json()
  const result = json?.Results?.[0]
  if (!result) return null

  const make = field(result.Make)
  const model = field(result.Model)
  if (!make || !model) return null // undecodable

  const yearRaw = field(result.ModelYear)
  const yearNum = yearRaw ? parseInt(yearRaw, 10) : NaN
  const year = Number.isFinite(yearNum) ? yearNum : null

  // Make arrives ALL CAPS; model is usually already Title case — pass through.
  return { year, make: titleCase(make), model }
}
