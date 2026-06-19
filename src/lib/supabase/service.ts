import { createClient } from "@supabase/supabase-js"

/**
 * Service-role Supabase client. BYPASSES Row-Level Security.
 *
 * Use ONLY in external-API routes that are authenticated by something other than
 * a Supabase Auth session (e.g. the extension token on /api/extensions/*). In
 * those routes RLS is not enforcing tenant isolation, so EVERY query MUST filter
 * explicitly by the validated `dealership_id`.
 *
 * Never import this from a user-facing route, server action, or component — those
 * must use the cookie-bound client in `./server` so RLS stays in force.
 */
export function createServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
