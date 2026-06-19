import "server-only"

import { createHash, randomBytes } from "node:crypto"
import { createServiceRoleClient } from "@/lib/supabase/service"

const TOKEN_PREFIX = "fde_"

/**
 * Generate a new extension token. Returns the plaintext (shown to the user ONCE)
 * and its SHA-256 hash (the only form persisted).
 */
export function generateToken(): { plainToken: string; tokenHash: string } {
  const plainToken = TOKEN_PREFIX + randomBytes(32).toString("base64url")
  return { plainToken, tokenHash: hashToken(plainToken) }
}

/** SHA-256 hash of a plaintext token, hex-encoded — used for storage + lookup. */
export function hashToken(plainToken: string): string {
  return createHash("sha256").update(plainToken).digest("hex")
}

export type ExtensionTokenContext = {
  userId: string
  dealershipId: string
  tokenId: string
}

/**
 * Validate an `Authorization: Bearer <token>` header against active extension
 * tokens. Returns the token's user/dealership context, or null if the header is
 * missing/malformed or the token is unknown or revoked.
 *
 * Uses the service-role client (no Supabase Auth session exists for an extension
 * request). On success, stamps `last_used_at` best-effort (failure is ignored).
 */
export async function validateExtensionToken(
  authHeader: string | null
): Promise<ExtensionTokenContext | null> {
  if (!authHeader) return null

  const match = /^Bearer\s+(.+)$/i.exec(authHeader.trim())
  const plainToken = match?.[1]?.trim()
  if (!plainToken || !plainToken.startsWith(TOKEN_PREFIX)) return null

  const tokenHash = hashToken(plainToken)
  const supabase = createServiceRoleClient()

  const { data, error } = await supabase
    .from("extension_tokens")
    .select("id, user_id, dealership_id")
    .eq("token_hash", tokenHash)
    .is("revoked_at", null)
    .maybeSingle()

  if (error || !data) return null

  // Best-effort usage stamp; never block or fail the request on this.
  await supabase
    .from("extension_tokens")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)

  return {
    userId: data.user_id as string,
    dealershipId: data.dealership_id as string,
    tokenId: data.id as string,
  }
}
