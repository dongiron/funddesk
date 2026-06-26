// Shared customer-name matching for RouteOne sync routes (Contract Manager and
// Decision Summary). RouteOne shows "LastName, FirstName" (no middle, sometimes
// a truncated first like "Steve"); FundDesk often stores middle names in
// last_name ("Anthony Cardona"). These pure helpers feed a candidate query +
// last-word/first-name tightening so a wrong match never silently corrupts data.

// "LastName, FirstName" → { first, last }. With a comma we get both; without one
// we treat the whole string as a last name. Empty → null (can't match anything).
export function parseCustomerName(
  name: string | null | undefined
): { first: string | null; last: string } | null {
  const s = (name ?? "").trim().replace(/\s+/g, " ")
  if (!s) return null
  const idx = s.indexOf(",")
  if (idx === -1) return { first: null, last: s }
  const last = s.slice(0, idx).trim()
  const first = s.slice(idx + 1).trim()
  if (!last) return null
  return { first: first || null, last }
}

// Last whitespace-separated token, normalized. "Anthony Cardona" → "Cardona",
// "Van Der Berg" → "Berg" (edge case acceptable). "" if empty.
export function extractLastWord(name: string | null | undefined): string {
  const s = (name ?? "").trim().replace(/\s+/g, " ")
  return s ? s.split(" ").pop()! : ""
}

// Bidirectional prefix match, case-insensitive: "Steve"/"Steven" → true. Bails
// false on either side empty so a missing name never matches.
export function firstNameMatches(
  a: string | null | undefined,
  b: string | null | undefined
): boolean {
  const A = (a ?? "").trim().toLowerCase()
  const B = (b ?? "").trim().toLowerCase()
  if (!A || !B) return false
  return A.startsWith(B) || B.startsWith(A)
}
