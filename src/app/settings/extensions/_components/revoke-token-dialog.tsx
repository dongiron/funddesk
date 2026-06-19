"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { revokeExtensionToken } from "../actions"

export function RevokeTokenDialog({
  token,
  onClose,
}: {
  token: { id: string; label: string } | null
  onClose: () => void
}) {
  const router = useRouter()
  const [pending, setPending] = useState(false)
  const open = token !== null

  async function handleConfirm() {
    if (!token) return
    setPending(true)
    const result = await revokeExtensionToken(token.id)
    setPending(false)
    if (result.ok) {
      toast.success("Token revoked.")
      router.refresh()
      onClose()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke {token?.label}?</AlertDialogTitle>
          <AlertDialogDescription>
            Any extension using this token will immediately stop syncing. This
            can&apos;t be undone — you&apos;d need to generate a new token.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? "Revoking…" : "Revoke"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
