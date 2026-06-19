"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { generateToken } from "@/lib/extension-tokens"

export type ActionResult = { ok: true } | { ok: false; error: string }

// Resolve the signed-in caller + their dealership. Any authenticated user may
// manage their OWN extension tokens. Cookie-session client only — RLS on
// extension_tokens enforces user-level ownership.
async function requireActor(): Promise<
  | { error: string }
  | {
      supabase: Awaited<ReturnType<typeof createClient>>
      userId: string
      dealershipId: string
    }
> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { error: "You must be signed in." as const }

  const { data: profile, error } = await supabase
    .from("users")
    .select("dealership_id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single()

  if (error || !profile) return { error: "Could not load your account." as const }
  return {
    supabase,
    userId: user.id,
    dealershipId: profile.dealership_id as string,
  }
}

export async function createExtensionToken(
  label: string
): Promise<
  | { ok: true; plainToken: string; tokenId: string }
  | { ok: false; error: string }
> {
  const ctx = await requireActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  const trimmed = label.trim()
  if (!trimmed) return { ok: false, error: "A label is required." }
  if (trimmed.length > 80) {
    return { ok: false, error: "Label must be 80 characters or fewer." }
  }

  const { plainToken, tokenHash } = generateToken()

  const { data, error } = await ctx.supabase
    .from("extension_tokens")
    .insert({
      user_id: ctx.userId,
      dealership_id: ctx.dealershipId,
      token_hash: tokenHash,
      label: trimmed,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, error: "Could not create the token. Try again." }
  }

  revalidatePath("/settings/extensions")
  return { ok: true, plainToken, tokenId: data.id as string }
}

export async function revokeExtensionToken(
  tokenId: string
): Promise<ActionResult> {
  const ctx = await requireActor()
  if ("error" in ctx) return { ok: false, error: ctx.error }

  // RLS already scopes UPDATE to the caller's own rows; the user_id filter and
  // the revoked_at IS NULL guard make the ownership + idempotency explicit.
  const { error } = await ctx.supabase
    .from("extension_tokens")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", tokenId)
    .eq("user_id", ctx.userId)
    .is("revoked_at", null)

  if (error) return { ok: false, error: "Could not revoke the token." }

  revalidatePath("/settings/extensions")
  return { ok: true }
}
