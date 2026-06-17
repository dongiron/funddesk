"use client"

import { useState } from "react"
import { signUp } from "@/lib/auth/actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/form-section"

export default function SignUpPage() {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  async function handleSubmit(formData: FormData) {
    setPending(true)
    setError(null)
    const result = await signUp(formData)
    if (result?.error) {
      setError(result.error)
      setPending(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-baseline justify-between">
          <span className="font-sans text-lg leading-none font-extrabold tracking-[-0.035em] text-fg-primary">
            FundDesk
          </span>
          <span className="font-mono text-[10px] uppercase tracking-widest text-fg-tertiary">
            create account
          </span>
        </div>

        <div className="rounded-lg border border-line bg-surface p-6">
          <form action={handleSubmit} className="space-y-4">
            <Field label="email" htmlFor="email">
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </Field>
            <Field label="password" htmlFor="password">
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
              />
            </Field>
            {error && <p className="text-sm text-danger">{error}</p>}
            <Button type="submit" className="w-full" disabled={pending}>
              {pending ? "Creating account…" : "Create account"}
            </Button>
          </form>
        </div>

        <p className="mt-4 text-center text-sm text-fg-tertiary">
          Already have an account?{" "}
          <a href="/sign-in" className="text-gold underline-offset-4 hover:underline">
            Sign in
          </a>
        </p>
      </div>
    </div>
  )
}
