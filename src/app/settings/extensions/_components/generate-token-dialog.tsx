"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { CheckIcon, CopyIcon } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Field } from "@/components/ui/form-section"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createExtensionToken } from "../actions"

export function GenerateTokenDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const [label, setLabel] = useState("")
  const [plainToken, setPlainToken] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  function reset() {
    setLabel("")
    setPlainToken(null)
    setPending(false)
    setError(null)
    setCopied(false)
  }

  function close() {
    onOpenChange(false)
    // Delay reset so the content doesn't flicker during the close animation.
    setTimeout(reset, 200)
  }

  async function handleGenerate() {
    setPending(true)
    setError(null)
    const result = await createExtensionToken(label)
    setPending(false)
    if (result.ok) {
      setPlainToken(result.plainToken)
      router.refresh()
    } else {
      setError(result.error)
    }
  }

  async function copy() {
    if (!plainToken) return
    try {
      await navigator.clipboard.writeText(plainToken)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error("Couldn't copy. Select the token and copy manually.")
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) close()
      }}
    >
      <DialogContent showCloseButton={plainToken === null}>
        {plainToken === null ? (
          <>
            <DialogHeader>
              <DialogTitle>New extension token</DialogTitle>
              <DialogDescription>
                Name this token so you can recognize it later — e.g. which device
                or browser it lives in.
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                if (!pending) handleGenerate()
              }}
            >
              <Field label="label" htmlFor="token_label" error={error ?? undefined}>
                <Input
                  id="token_label"
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Chrome extension — laptop"
                  autoFocus
                  required
                />
              </Field>
              <DialogFooter>
                <Button
                  type="button"
                  variant="secondary"
                  onClick={close}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={pending || !label.trim()}>
                  {pending ? "Generating…" : "Generate token"}
                </Button>
              </DialogFooter>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Token created</DialogTitle>
              <DialogDescription className="text-danger">
                Save this token now. It won&apos;t be shown again.
              </DialogDescription>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border border-line bg-canvas p-3">
              <code className="flex-1 break-all font-mono text-xs text-fg-primary">
                {plainToken}
              </code>
              <Button
                type="button"
                variant="secondary"
                size="icon-sm"
                aria-label="Copy token"
                onClick={copy}
              >
                {copied ? <CheckIcon /> : <CopyIcon />}
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" onClick={close}>
                I&apos;ve saved it
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
