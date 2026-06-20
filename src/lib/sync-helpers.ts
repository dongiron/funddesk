// Null-skip writer for sync upserts: only assign when the value is actually
// present, so a partial re-sync never clobbers an existing non-null DB value
// with null/undefined from a missing payload field. Shared by the extension
// sync endpoints (TaptoSign, RouteOne, and CUDL when it lands).
export function setIfPresent(
  obj: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value !== null && value !== undefined) obj[key] = value
}
