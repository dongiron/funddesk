"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { phoenixToday, type Deal } from "../deal-schema"
import { unwindDeal } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
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

const unwindSchema = z.object({
  unwind_reason: z.string().trim().min(1, "A reason is required."),
  unwind_cost: z
    .string()
    .refine(
      (v) => v.trim() !== "" && !Number.isNaN(Number(v)) && Number(v) >= 0,
      "Enter a non-negative cost."
    ),
  unwound_date: z
    .string()
    .refine((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.trim()), "A date is required."),
})
type UnwindFormValues = z.infer<typeof unwindSchema>

function dealName(deal: Deal): string {
  return (
    [deal.customer_first_name, deal.customer_last_name]
      .filter(Boolean)
      .join(" ")
      .trim() || "this deal"
  )
}

function UnwindForm({ deal, onClose }: { deal: Deal; onClose: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<UnwindFormValues>({
    resolver: zodResolver(unwindSchema),
    defaultValues: {
      unwind_reason: "",
      unwind_cost: "",
      unwound_date: phoenixToday(),
    },
  })

  async function onSubmit(values: UnwindFormValues) {
    const result = await unwindDeal(deal.id, {
      reason: values.unwind_reason.trim(),
      cost: Number(values.unwind_cost),
      date: values.unwound_date,
    })
    if (result.ok) {
      toast.success("Deal unwound.")
      onClose()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="unwind_reason">Reason</Label>
        <Textarea
          id="unwind_reason"
          rows={3}
          placeholder="Customer backed out, financing fell through, etc."
          {...register("unwind_reason")}
        />
        {errors.unwind_reason && (
          <p className="text-xs text-destructive">
            {errors.unwind_reason.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="unwind_cost">Cost ($)</Label>
          <Input
            id="unwind_cost"
            type="number"
            step="0.01"
            placeholder="0.00"
            {...register("unwind_cost")}
          />
          {errors.unwind_cost && (
            <p className="text-xs text-destructive">
              {errors.unwind_cost.message}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="unwound_date">Unwound date</Label>
          <Input id="unwound_date" type="date" {...register("unwound_date")} />
          {errors.unwound_date && (
            <p className="text-xs text-destructive">
              {errors.unwound_date.message}
            </p>
          )}
        </div>
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
        <Button type="submit" variant="destructive" disabled={isSubmitting}>
          {isSubmitting ? "Unwinding…" : "Unwind deal"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function UnwindDealDialog({
  deal,
  onClose,
}: {
  deal: Deal | null
  onClose: () => void
}) {
  const open = deal !== null

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose()
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Unwind {deal ? dealName(deal) : "deal"}?</DialogTitle>
          <DialogDescription>
            This moves the deal to the <strong>unwound</strong> state and records
            why and what it cost. It drops off the active list.
          </DialogDescription>
        </DialogHeader>
        {/* keyed so each open starts with a fresh form (incl. today's date) */}
        {deal && <UnwindForm key={deal.id} deal={deal} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  )
}
