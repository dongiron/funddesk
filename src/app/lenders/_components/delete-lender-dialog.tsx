"use client"

import { useState } from "react"
import { toast } from "sonner"
import type { Lender } from "../lender-schema"
import { softDeleteLender } from "../actions"
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

export function DeleteLenderDialog({
  lender,
  onClose,
}: {
  lender: Lender | null
  onClose: () => void
}) {
  const [pending, setPending] = useState(false)
  const open = lender !== null

  async function handleConfirm() {
    if (!lender) return
    setPending(true)
    const result = await softDeleteLender(lender.id)
    setPending(false)

    if (result.ok) {
      toast.success("Lender deleted.")
      onClose()
    } else {
      // Leave the dialog open so the user can retry or cancel.
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
          <AlertDialogTitle>Delete {lender?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This removes the lender from your active list. Existing deals that
            reference it are unaffected, and you can re-add it later.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={pending}
            onClick={handleConfirm}
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
