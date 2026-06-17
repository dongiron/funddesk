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
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { FormSection, Field, ToggleRow } from "@/components/ui/form-section"
import { SheetFooter } from "@/components/ui/sheet"

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
  onCancel,
}: {
  lender?: Lender
  onSuccess: () => void
  onCancel?: () => void
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
    <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col">
      <div className="space-y-8 px-6 py-6">
        {/* 01 — Identity */}
        <FormSection index="01" title="identity">
          <Field label="lender name" htmlFor="name" error={errors.name?.message}>
            <Input id="name" {...register("name")} placeholder="e.g. Westlake Financial" />
          </Field>
          <Field label="communication platform" htmlFor="communication_platform">
            <Input
              id="communication_platform"
              {...register("communication_platform")}
              placeholder="e.g. CUDL, DealerCenter via RouteOne"
            />
          </Field>
        </FormSection>

        {/* 02 — Timing */}
        <FormSection index="02" title="timing">
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="typical days clean"
              htmlFor="typical_days_clean"
              error={errors.typical_days_clean?.message}
            >
              <Input
                id="typical_days_clean"
                type="number"
                min={0}
                {...register("typical_days_clean")}
                placeholder="—"
              />
            </Field>
            <Field
              label="overdue threshold"
              htmlFor="overdue_threshold_days"
              error={errors.overdue_threshold_days?.message}
            >
              <Input
                id="overdue_threshold_days"
                type="number"
                min={0}
                {...register("overdue_threshold_days")}
                placeholder="—"
              />
            </Field>
          </div>
        </FormSection>

        {/* 03 — Behavior */}
        <FormSection index="03" title="behavior">
          {BOOLEAN_FIELDS.map((f) => (
            <ToggleRow key={f.key} label={f.label}>
              <Controller
                control={control}
                name={f.key}
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={(checked) => field.onChange(checked)}
                  />
                )}
              />
            </ToggleRow>
          ))}
        </FormSection>

        {/* 04 — Stips & notes */}
        <FormSection index="04" title="stips & notes">
          <Field
            label="common required stips"
            htmlFor="common_required_stips"
            hint="Comma-separated."
          >
            <Input
              id="common_required_stips"
              {...register("common_required_stips")}
              placeholder="paystub, proof of residence, insurance"
            />
          </Field>
          <Field
            label="commonly ghosted stips"
            htmlFor="commonly_ghosted_stips"
            hint="Comma-separated."
          >
            <Input
              id="commonly_ghosted_stips"
              {...register("commonly_ghosted_stips")}
              placeholder="paystub, references"
            />
          </Field>
          <Field label="operator notes" htmlFor="operator_notes">
            <Textarea
              id="operator_notes"
              rows={4}
              {...register("operator_notes")}
              placeholder="Quirks, escalation contacts, funding window hours…"
            />
          </Field>
        </FormSection>
      </div>

      <SheetFooter>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting} className="ml-auto">
          {isSubmitting ? "Saving…" : lender ? "Save changes" : "Add lender"}
        </Button>
      </SheetFooter>
    </form>
  )
}
