import { redirect } from "next/navigation"

// The root route has no UI of its own — send visitors into the app. Unauthenticated
// users are bounced to /sign-in by middleware before this renders.
export default function Home() {
  redirect("/dashboard")
}
