import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"
import { signOut } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect("/sign-in")

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold">Welcome, {user.email}</h1>
        <p className="text-muted-foreground">FundDesk dashboard — coming soon.</p>
        <form action={signOut}>
          <Button type="submit" variant="outline">Sign out</Button>
        </form>
      </div>
    </div>
  )
}
