"use server"

import { createClient } from "@/lib/supabase/server"
import { redirect } from "next/navigation"

export async function signIn(formData: FormData) {
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  })
  if (error) return { error: error.message }
  redirect("/dashboard")
}

export async function signUp(formData: FormData) {
  const supabase = await createClient()
  // Email confirmation is disabled — user is signed in immediately after signup.
  // If you enable confirmation in Supabase dashboard, change redirect to "/sign-in"
  // and add a "check your email" message there.
  const { error } = await supabase.auth.signUp({
    email: formData.get("email") as string,
    password: formData.get("password") as string,
  })
  if (error) return { error: error.message }
  redirect("/dashboard")
}

export async function signOut() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect("/sign-in")
}
