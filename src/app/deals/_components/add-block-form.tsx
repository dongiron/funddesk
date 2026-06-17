"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  addBlockSchema,
  BLOCK_TYPE_GROUPS,
  BLOCK_TYPE_LABELS,
  type AddBlockValues,
} from "../block-schema"
import { createBlock } from "../actions"
import { Button } from "@/components/ui/button"
import { Field } from "@/components/ui/form-section"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function AddBlockForm({
  dealId,
  onDone,
  onCancel,
}: {
  dealId: string
  onDone: () => void
  onCancel: () => void
}) {
  const {
    control,
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AddBlockValues>({
    resolver: zodResolver(addBlockSchema),
    defaultValues: { block_type: "", block_detail: "" },
  })

  async function onSubmit(values: AddBlockValues) {
    const result = await createBlock(dealId, values)
    if (result.ok) {
      toast.success("Block added.")
      onDone()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-3 rounded-lg border border-line bg-surface p-3"
    >
      <Field label="block type" htmlFor="block_type" error={errors.block_type?.message}>
        <Controller
          control={control}
          name="block_type"
          render={({ field }) => (
            <Select
              value={field.value || null}
              onValueChange={(v) => field.onChange((v as string) ?? "")}
            >
              <SelectTrigger id="block_type" className="w-full">
                <SelectValue placeholder="Select a block type" />
              </SelectTrigger>
              <SelectContent>
                {BLOCK_TYPE_GROUPS.map((g) => (
                  <SelectGroup key={g.label}>
                    <SelectLabel>{g.label}</SelectLabel>
                    {g.types.map((t) => (
                      <SelectItem key={t} value={t}>
                        {BLOCK_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </Field>

      <Field label="detail (optional)" htmlFor="block_detail">
        <Textarea
          id="block_detail"
          rows={2}
          placeholder="What specifically needs to happen?"
          {...register("block_detail")}
        />
      </Field>

      <div className="flex justify-end gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? "Adding…" : "Add block"}
        </Button>
      </div>
    </form>
  )
}
