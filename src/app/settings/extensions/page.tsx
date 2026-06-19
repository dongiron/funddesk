import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { TokensView, type ExtensionTokenRow } from "./_components/tokens-view"

export default async function ExtensionsSettingsPage() {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect("/sign-in")

  // RLS already scopes to the caller's own tokens; the user_id filter is explicit
  // belt-and-suspenders. Only active (non-revoked) tokens are listed.
  const { data: tokens } = await supabase
    .from("extension_tokens")
    .select("id, label, created_at, last_used_at")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .returns<ExtensionTokenRow[]>()

  return (
    <div className="flex-1 px-6 py-8">
      <div className="mx-auto max-w-3xl">
        <TokensView tokens={tokens ?? []} />
      </div>
    </div>
  )
}
