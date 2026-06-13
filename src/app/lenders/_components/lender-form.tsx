"use client"

import { Controller, useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  lenderFormSchema,
  toLenderInput,
  type Lender,
  type LenderFormValues,
} from "../lender-schema"
import { createLender, updateLender } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Textarea } from "@/components/ui/textarea"

type BooleanField = Extract<
  keyof LenderFormValues,
  | "clears_stips_upfront"
  | "does_welcome_calls"
  | "does_employment_verification"
  | "can_increase_lender_fee"
  | "accepts_esign"
  | "requires_physical_contract"
>

const BOOLEAN_FIELDS: { key: BooleanField; label: string }[] = [
  { key: "clears_stips_upfront", label: "Clears stips upfront" },
  { key: "does_welcome_calls", label: "Does welcome calls" },
  { key: "does_employment_verification", label: "Does employment verification" },
  { key: "can_increase_lender_fee", label: "Can increase lender fee" },
  { key: "accepts_esign", label: "Accepts e-signed contracts" },
  {
    key: "requires_physical_contract",
    label: "Requires physical (wet-ink) contract",
  },
]

function toDefaults(lender?: Lender): LenderFormValues {
  return {
    name: lender?.name ?? "",
    communication_platform: lender?.communication_platform ?? "",
    typical_days_clean:
      lender?.typical_days_clean != null ? String(lender.typical_days_clean) : "",
    overdue_threshold_days:
      lender?.overdue_threshold_days != null
        ? String(lender.overdue_threshold_days)
        : "",
    clears_stips_upfront: lender?.clears_stips_upfront ?? false,
    does_welcome_calls: lender?.does_welcome_calls ?? false,
    does_employment_verification: lender?.does_employment_verification ?? false,
    can_increase_lender_fee: lender?.can_increase_lender_fee ?? false,
    // New lenders default to accepting e-sign (matches the DB column default).
    accepts_esign: lender?.accepts_esign ?? true,
    requires_physical_contract: lender?.requires_physical_contract ?? false,
    common_required_stips: lender?.common_required_stips.join(", ") ?? "",
    commonly_ghosted_stips: lender?.commonly_ghosted_stips.join(", ") ?? "",
    operator_notes: lender?.operator_notes ?? "",
  }
}

export function LenderForm({
  lender,
  onSuccess,
}: {
  lender?: Lender
  onSuccess: () => void
}) {
  const {
    register,
    handleSubmit,
    control,
    formState: { errors, isSubmitting },
  } = useForm<LenderFormValues>({
    resolver: zodResolver(lenderFormSchema),
    defaultValues: toDefaults(lender),
  })

  async function onSubmit(values: LenderFormValues) {
    const input = toLenderInput(values)
    const result = lender
      ? await updateLender(lender.id, input)
      : await createLender(input)

    if (result.ok) {
      toast.success(lender ? "Lender updated." : "Lender added.")
      onSuccess()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="flex flex-col gap-4 px-4 pb-4"
    >
      <div className="space-y-2">
        <Label htmlFor="name">Lender name</Label>
        <Input id="name" {...register("name")} placeholder="e.g. Westlake Financial" />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="communication_platform">Communication platform</Label>
        <Input
          id="communication_platform"
          {...register("communication_platform")}
          placeholder="e.g. CUDL, DealerCenter via RouteOne"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="typical_days_clean">Typical days clean</Label>
          <Input
            id="typical_days_clean"
            type="number"
            min={0}
            {...register("typical_days_clean")}
            placeholder="—"
          />
          {errors.typical_days_clean && (
            <p className="text-sm text-destructive">
              {errors.typical_days_clean.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="overdue_threshold_days">Overdue threshold</Label>
          <Input
            id="overdue_threshold_days"
            type="number"
            min={0}
            {...register("overdue_threshold_days")}
            placeholder="—"
          />
          {errors.overdue_threshold_days && (
            <p className="text-sm text-destructive">
              {errors.overdue_threshold_days.message}
            </p>
          )}
        </div>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Behavior</legend>
        {BOOLEAN_FIELDS.map((f) => (
          <div key={f.key} className="flex items-center gap-2">
            <Controller
              control={control}
              name={f.key}
              render={({ field }) => (
                <Checkbox
                  id={f.key}
                  checked={field.value}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              )}
            />
            <Label htmlFor={f.key} className="font-normal">
              {f.label}
            </Label>
          </div>
        ))}
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="common_required_stips">Common required stips</Label>
        <Input
          id="common_required_stips"
          {...register("common_required_stips")}
          placeholder="paystub, proof of residence, insurance"
        />
        <p className="text-xs text-muted-foreground">Comma-separated.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="commonly_ghosted_stips">Commonly ghosted stips</Label>
        <Input
          id="commonly_ghosted_stips"
          {...register("commonly_ghosted_stips")}
          placeholder="paystub, references"
        />
        <p className="text-xs text-muted-foreground">Comma-separated.</p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="operator_notes">Operator notes</Label>
        <Textarea
          id="operator_notes"
          rows={4}
          {...register("operator_notes")}
          placeholder="Quirks, escalation contacts, funding window hours…"
        />
      </div>

      <Button type="submit" disabled={isSubmitting} className="mt-2">
        {isSubmitting
          ? "Saving…"
          : lender
            ? "Save changes"
            : "Add lender"}
      </Button>
    </form>
  )
}
