import Link from "next/link"
import { createClient } from "@/lib/supabase/server"

// Server component: renders the app nav only for authenticated users.
export async function Nav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  return (
    <nav className="border-b bg-background">
      <div className="mx-auto flex h-12 max-w-7xl items-center gap-6 px-6">
        <Link href="/dashboard" className="text-sm font-semibold">
          FundDesk
        </Link>
        <div className="flex items-center gap-4">
          <Link
            href="/deals"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Deals
          </Link>
          <Link
            href="/lenders"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            Lenders
          </Link>
        </div>
      </div>
    </nav>
  )
}
