"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { resolveBlockSchema, type ResolveBlockValues } from "../block-schema"
import { resolveBlock } from "../actions"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function ResolveForm({
  blockId,
  onClose,
}: {
  blockId: string
  onClose: () => void
}) {
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ResolveBlockValues>({
    resolver: zodResolver(resolveBlockSchema),
    defaultValues: { resolution_note: "" },
  })

  async function onSubmit(values: ResolveBlockValues) {
    const result = await resolveBlock(blockId, values)
    if (result.ok) {
      toast.success("Block resolved.")
      onClose()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="resolution_note">Resolution note (optional)</Label>
        <Textarea
          id="resolution_note"
          rows={3}
          placeholder="How was it resolved?"
          {...register("resolution_note")}
        />
      </div>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Resolving…" : "Resolve"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function ResolveBlockDialog({
  blockId,
  open,
  onOpenChange,
}: {
  blockId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Resolve block</DialogTitle>
          <DialogDescription>
            Mark this block resolved. Add an optional note on how it was handled.
          </DialogDescription>
        </DialogHeader>
        {/* keyed so each open starts with a fresh, empty note */}
        {blockId && (
          <ResolveForm
            key={blockId}
            blockId={blockId}
            onClose={() => onOpenChange(false)}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}
