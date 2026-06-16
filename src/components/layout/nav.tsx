import { createClient } from "@/lib/supabase/server"
import { NavLinks } from "./nav-links"
import { UserMenu } from "./user-menu"

function initialsFrom(fullName: string | null, email: string | null): string {
  const name = (fullName ?? "").trim()
  if (name) {
    const parts = name.split(/\s+/)
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    }
    return parts[0].slice(0, 2).toUpperCase()
  }
  const e = (email ?? "").trim()
  return e ? e.slice(0, 2).toUpperCase() : "??"
}

// Server component: auth-gates the nav and resolves the user's initials +
// dealership name. The pathname-aware links and the menu are client children.
export async function Nav() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from("users")
    .select("full_name, email, dealership_id")
    .eq("id", user.id)
    .is("deleted_at", null)
    .single()

  let dealershipName = ""
  if (profile?.dealership_id) {
    const { data: dealership } = await supabase
      .from("dealerships")
      .select("name")
      .eq("id", profile.dealership_id)
      .is("deleted_at", null)
      .single()
    dealershipName = (dealership?.name ?? "").toLowerCase()
  }

  const initials = initialsFrom(
    profile?.full_name ?? null,
    profile?.email ?? user.email ?? null
  )

  return (
    <nav className="border-b border-line">
      <div className="mx-auto grid max-w-7xl grid-cols-3 items-center px-6 py-3.5">
        {/* Wordmark + gold bar */}
        <div className="flex flex-col">
          <span className="font-sans text-base leading-none font-extrabold tracking-[-0.035em] text-fg-primary">
            FundDesk
          </span>
          <span className="mt-1 h-0.5 w-[22px] bg-gold" />
        </div>

        {/* Center links */}
        <div className="flex justify-center">
          <NavLinks />
        </div>

        {/* Right identifier / menu */}
        <div className="flex justify-end">
          <UserMenu initials={initials} dealership={dealershipName} />
        </div>
      </div>
    </nav>
  )
}
