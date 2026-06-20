// Shared lender-catalog matcher used by the extension sync endpoints (TaptoSign,
// RouteOne, and CUDL when it lands). Exact normalized match wins; a bidirectional
// prefix fallback absorbs suffix variations ("Westlake Financial" ↔ "Westlake
// Financial Services"). Anything ambiguous (2+ candidates) stays unmatched so the
// caller can keep the raw text for provenance rather than risk a wrong lender_id.

export type LenderRow = { id: string; name: string }

export type LenderMatchResult =
  | { matched: true; lenderId: string }
  | { matched: false; reason: "no_match" | "ambiguous" }

function normalizeLenderName(name: string): string {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

export function matchLenderByName(
  rawName: string,
  lenders: LenderRow[]
): LenderMatchResult {
  const normalized = normalizeLenderName(rawName)
  if (!normalized) return { matched: false, reason: "no_match" }

  // Exact match on normalized names wins.
  const exact = lenders.filter((l) => normalizeLenderName(l.name) === normalized)
  if (exact.length === 1) return { matched: true, lenderId: exact[0].id }
  if (exact.length > 1) return { matched: false, reason: "ambiguous" }

  // Bidirectional prefix match handles "Westlake Financial" ↔ "Westlake
  // Financial Services" and similar suffix variations.
  const prefix = lenders.filter((l) => {
    const ln = normalizeLenderName(l.name)
    return ln.startsWith(normalized) || normalized.startsWith(ln)
  })
  if (prefix.length === 1) return { matched: true, lenderId: prefix[0].id }
  if (prefix.length > 1) return { matched: false, reason: "ambiguous" }

  return { matched: false, reason: "no_match" }
}
