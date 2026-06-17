"use client"

import { useEffect, useState } from "react"
import {
  Controller,
  useForm,
  useWatch,
  type Control,
  type FieldErrors,
  type UseFormRegister,
} from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { XIcon } from "lucide-react"
import {
  dealFormSchema,
  toDealInput,
  phoenixToday,
  FORM_PIPELINE_STATES,
  PIPELINE_STATE_LABELS,
  type Deal,
  type DealFormValues,
  type LenderOption,
} from "../deal-schema"
import { createDeal, updateDeal } from "../actions"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { FormSection, Field, ToggleRow } from "@/components/ui/form-section"
import { SheetFooter } from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { StipsChecklist } from "./stips-checklist"
import { decodeVin, isValidVinFormat } from "../vin-decoder"

// Module-level field helper (defined outside render so inputs don't remount).
function TField({
  name,
  label,
  register,
  errors,
  type = "text",
  placeholder,
  step,
}: {
  name: keyof DealFormValues
  label: string
  register: UseFormRegister<DealFormValues>
  errors: FieldErrors<DealFormValues>
  type?: string
  placeholder?: string
  step?: string
}) {
  const error = errors[name]?.message as string | undefined
  return (
    <Field label={label} htmlFor={name} error={error}>
      <Input
        id={name}
        type={type}
        step={step}
        placeholder={placeholder}
        {...register(name)}
      />
    </Field>
  )
}

// Date fields are CONTROLLED (not register). base-ui's Input misbehaves with
// RHF's uncontrolled register for type="date" (shows today, won't clear), so we
// drive value explicitly and add a clear (×) button for optional dates.
function DateField({
  name,
  label,
  control,
  errors,
  clearable = true,
}: {
  name: keyof DealFormValues
  label: string
  control: Control<DealFormValues>
  errors: FieldErrors<DealFormValues>
  clearable?: boolean
}) {
  const error = errors[name]?.message as string | undefined
  return (
    <Field label={label} htmlFor={name} error={error}>
      <Controller
        control={control}
        name={name}
        render={({ field }) => (
          <div className="flex items-center gap-1">
            <Input
              id={name}
              type="date"
              value={(field.value as string) || ""}
              onChange={(e) => field.onChange(e.target.value)}
              onBlur={field.onBlur}
            />
            {clearable && field.value ? (
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Clear ${label}`}
                onClick={() => field.onChange("")}
              >
                <XIcon />
              </Button>
            ) : null}
          </div>
        )}
      />
    </Field>
  )
}

function toDefaults(deal?: Deal): DealFormValues {
  const s = (v: string | null | undefined) => v ?? ""
  const n = (v: number | null | undefined) => (v == null ? "" : String(v))
  return {
    customer_first_name: s(deal?.customer_first_name),
    customer_last_name: s(deal?.customer_last_name),
    lender_id: s(deal?.lender_id),
    pipeline_state: deal?.pipeline_state ?? "signed",
    vehicle_year: n(deal?.vehicle_year),
    vehicle_make: s(deal?.vehicle_make),
    vehicle_model: s(deal?.vehicle_model),
    vehicle_vin: s(deal?.vehicle_vin),
    stock_number: s(deal?.stock_number),
    amount_financed: n(deal?.amount_financed),
    term_months: n(deal?.term_months),
    apr: n(deal?.apr),
    monthly_payment: n(deal?.monthly_payment),
    front_gross: n(deal?.front_gross),
    back_gross: n(deal?.back_gross),
    pack: n(deal?.pack),
    reserve: n(deal?.reserve),
    sold_date: deal?.sold_date ?? phoenixToday(),
    submitted_to_lender_date: s(deal?.submitted_to_lender_date),
    funded_date: s(deal?.funded_date),
    physical_contract_mailed_date: s(deal?.physical_contract_mailed_date),
    physical_contract_required: deal?.physical_contract_required ?? false,
    stips_required: deal?.stips_required ?? [],
    stips_received: deal?.stips_received ?? [],
    has_trade: deal?.has_trade ?? false,
    trade_year: n(deal?.trade_year),
    trade_make: s(deal?.trade_make),
    trade_model: s(deal?.trade_model),
    trade_vin: s(deal?.trade_vin),
    trade_acv: n(deal?.trade_acv),
    trade_allowance: n(deal?.trade_allowance),
    trade_payoff_quoted: n(deal?.trade_payoff_quoted),
    trade_payoff_lender: s(deal?.trade_payoff_lender),
    trade_payoff_sent_date: s(deal?.trade_payoff_sent_date),
    trade_payoff_received_date: s(deal?.trade_payoff_received_date),
    trade_title_received_date: s(deal?.trade_title_received_date),
  }
}

const usd = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
})

export function DealForm({
  deal,
  lenders,
  onSuccess,
  onCancel,
  readOnly = false,
}: {
  deal?: Deal
  lenders: LenderOption[]
  onSuccess: () => void
  onCancel?: () => void
  readOnly?: boolean
}) {
  const {
    register,
    handleSubmit,
    control,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<DealFormValues>({
    resolver: zodResolver(dealFormSchema),
    defaultValues: toDefaults(deal),
  })

  // useWatch (not watch()) keeps this component memoization-safe under React Compiler.
  const lenderId = useWatch({ control, name: "lender_id" })
  const hasTrade = useWatch({ control, name: "has_trade" })
  const stipsRequired = useWatch({ control, name: "stips_required" })
  const stipsReceived = useWatch({ control, name: "stips_received" })
  const vehicleVin = useWatch({ control, name: "vehicle_vin" })

  // VIN auto-decode. initialVin guards against firing on edit-mode load.
  const initialVin = deal?.vehicle_vin ?? ""
  const [vinDecoding, setVinDecoding] = useState(false)

  // On create only: when a lender is picked, seed physical-contract + required
  // stips from that lender. Never auto-overwrite on edit.
  useEffect(() => {
    if (deal) return
    if (!lenderId) return
    const l = lenders.find((x) => x.id === lenderId)
    if (!l) return
    setValue("physical_contract_required", l.requires_physical_contract)
    setValue("stips_required", l.common_required_stips)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lenderId])

  // Auto-decode the VIN via NHTSA once it's 17 valid chars and actually changed
  // (not on edit-mode initial load, not in read-only).
  useEffect(() => {
    const vin = vehicleVin ?? ""
    if (readOnly) return
    if (!isValidVinFormat(vin)) return
    if (vin === initialVin) return

    const controller = new AbortController()
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVinDecoding(true)
    decodeVin(vin, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        if (result) {
          setValue(
            "vehicle_year",
            result.year != null ? String(result.year) : "",
            { shouldDirty: true }
          )
          setValue("vehicle_make", result.make, { shouldDirty: true })
          setValue("vehicle_model", result.model, { shouldDirty: true })
          const summary = [result.year, result.make, result.model]
            .filter(Boolean)
            .join(" ")
          toast.success(`Decoded VIN: ${summary}`)
        } else {
          toast.error(
            "Couldn't decode that VIN. Check that it's correct, or fill in vehicle info manually."
          )
        }
      })
      .catch((err) => {
        if (controller.signal.aborted || err?.name === "AbortError") return
        toast.error(
          "VIN decode service unavailable. Fill in vehicle info manually."
        )
      })
      .finally(() => {
        if (!controller.signal.aborted) setVinDecoding(false)
      })

    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicleVin])

  async function onSubmit(values: DealFormValues) {
    if (readOnly) return
    const input = toDealInput(values)
    const result = deal
      ? await updateDeal(deal.id, input)
      : await createDeal(input)

    if (result.ok) {
      toast.success(deal ? "Deal updated." : "Deal added.")
      onSuccess()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      autoComplete="off"
      className="flex flex-col"
    >
      <fieldset disabled={readOnly} className="contents">
        <div className="space-y-8 px-6 py-6">
          {/* 01 — Customer */}
          <FormSection index="01" title="customer">
            <div className="grid grid-cols-2 gap-3">
              <TField name="customer_first_name" label="first name" register={register} errors={errors} />
              <TField name="customer_last_name" label="last name" register={register} errors={errors} />
            </div>
          </FormSection>

          {/* 02 — Vehicle */}
          <FormSection index="02" title="vehicle">
            <div className="grid grid-cols-2 gap-3">
              <TField name="vehicle_year" label="year" type="number" step="1" register={register} errors={errors} />
              <TField name="vehicle_make" label="make" register={register} errors={errors} />
              <TField name="vehicle_model" label="model" register={register} errors={errors} />
              <TField name="stock_number" label="stock #" register={register} errors={errors} />
              <div className="col-span-2">
                <TField name="vehicle_vin" label="vin" register={register} errors={errors} />
                {vinDecoding && (
                  <p className="mt-1 font-mono text-xs text-gold">decoding…</p>
                )}
              </div>
            </div>
          </FormSection>

          {/* 03 — Financial (lender + numbers) */}
          <FormSection index="03" title="financial">
            <Field label="lender" htmlFor="lender_id" error={errors.lender_id?.message}>
              {readOnly ? (
                <p className="text-sm text-fg-primary">{deal?.lender?.name ?? "—"}</p>
              ) : (
                <Controller
                  control={control}
                  name="lender_id"
                  render={({ field }) => (
                    <Select
                      value={field.value || null}
                      onValueChange={(v) => field.onChange((v as string) ?? "")}
                    >
                      <SelectTrigger id="lender_id" className="w-full">
                        {/* base-ui SelectValue shows the raw value (UUID) unless
                            given a function to map it to a label. */}
                        <SelectValue placeholder="Select a lender">
                          {(value) => {
                            const id = value as string | null
                            if (!id) return "Select a lender"
                            return (
                              lenders.find((l) => l.id === id)?.name ??
                              // Fallback for a soft-deleted lender not in the
                              // active list: use the joined name from the deal.
                              (id === deal?.lender_id
                                ? deal?.lender?.name
                                : null) ??
                              id
                            )
                          }}
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {lenders.map((l) => (
                          <SelectItem key={l.id} value={l.id}>
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <TField name="amount_financed" label="amount financed" type="number" step="0.01" register={register} errors={errors} />
              <TField name="term_months" label="term (months)" type="number" step="1" register={register} errors={errors} />
              <TField name="apr" label="apr (%)" type="number" step="0.0001" register={register} errors={errors} />
              <TField name="monthly_payment" label="monthly payment" type="number" step="0.01" register={register} errors={errors} />
              <TField name="front_gross" label="front gross" type="number" step="0.01" register={register} errors={errors} />
              <TField name="back_gross" label="back gross" type="number" step="0.01" register={register} errors={errors} />
              <TField name="pack" label="pack" type="number" step="0.01" register={register} errors={errors} />
              <TField name="reserve" label="reserve" type="number" step="0.01" register={register} errors={errors} />
            </div>
          </FormSection>

          {/* 04 — Dates */}
          <FormSection index="04" title="dates">
            <div className="grid grid-cols-2 gap-3">
              <DateField name="sold_date" label="sold date" control={control} errors={errors} clearable={false} />
              <DateField name="submitted_to_lender_date" label="submitted to lender" control={control} errors={errors} />
              <DateField name="funded_date" label="funded date" control={control} errors={errors} />
              <DateField name="physical_contract_mailed_date" label="physical contract mailed" control={control} errors={errors} />
            </div>
          </FormSection>

          {/* 05 — Trade-in */}
          <FormSection index="05" title="trade-in">
            <ToggleRow label="Customer has a trade-in">
              <Controller
                control={control}
                name="has_trade"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={(c) => field.onChange(c)}
                  />
                )}
              />
            </ToggleRow>

            {hasTrade && (
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed border-line p-3">
                <TField name="trade_year" label="trade year" type="number" step="1" register={register} errors={errors} />
                <TField name="trade_make" label="trade make" register={register} errors={errors} />
                <TField name="trade_model" label="trade model" register={register} errors={errors} />
                <TField name="trade_vin" label="trade vin" register={register} errors={errors} />
                <TField name="trade_acv" label="acv" type="number" step="0.01" register={register} errors={errors} />
                <TField name="trade_allowance" label="allowance" type="number" step="0.01" register={register} errors={errors} />
                <TField name="trade_payoff_quoted" label="payoff quoted" type="number" step="0.01" register={register} errors={errors} />
                <TField name="trade_payoff_lender" label="payoff lender" register={register} errors={errors} />
                <DateField name="trade_payoff_sent_date" label="payoff sent" control={control} errors={errors} />
                <DateField name="trade_payoff_received_date" label="payoff received" control={control} errors={errors} />
                <div className="col-span-2">
                  <DateField name="trade_title_received_date" label="title received" control={control} errors={errors} />
                </div>
              </div>
            )}
          </FormSection>

          {/* 06 — Stips */}
          <FormSection index="06" title="stips">
            <StipsChecklist
              stips_required={stipsRequired ?? []}
              stips_received={stipsReceived ?? []}
              onChange={(next) => {
                setValue("stips_required", next.stips_required)
                setValue("stips_received", next.stips_received)
              }}
              disabled={readOnly}
            />
          </FormSection>

          {/* 07 — Status */}
          <FormSection index="07" title="status">
            <Field label="pipeline state" htmlFor="pipeline_state">
              {readOnly ? (
                <p className="text-sm text-fg-primary">
                  {PIPELINE_STATE_LABELS[deal?.pipeline_state ?? ""] ??
                    deal?.pipeline_state ??
                    "—"}
                </p>
              ) : (
                <Controller
                  control={control}
                  name="pipeline_state"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as string)}
                    >
                      <SelectTrigger id="pipeline_state" className="w-full">
                        <SelectValue>
                          {(value) =>
                            PIPELINE_STATE_LABELS[value as string] ??
                            (value as string) ??
                            ""
                          }
                        </SelectValue>
                      </SelectTrigger>
                      <SelectContent>
                        {FORM_PIPELINE_STATES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {PIPELINE_STATE_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              )}
            </Field>
            {!readOnly && (
              <p className="text-xs text-fg-muted">
                To unwind a deal, use the Unwind action on the list, not this
                dropdown.
              </p>
            )}
            <ToggleRow label="Requires a physical (wet-ink) contract">
              <Controller
                control={control}
                name="physical_contract_required"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    onCheckedChange={(c) => field.onChange(c)}
                  />
                )}
              />
            </ToggleRow>
          </FormSection>

          {readOnly && deal?.pipeline_state === "unwound" && (
            <FormSection index="08" title="unwind details">
              <div className="grid grid-cols-2 gap-3">
                <Field label="unwound date">
                  <p className="font-mono text-sm text-fg-primary">
                    {deal.unwound_date ?? "—"}
                  </p>
                </Field>
                <Field label="gross profit lost">
                  <p className="font-mono text-sm text-danger">
                    {deal.unwind_gross_profit == null
                      ? "—"
                      : usd.format(Number(deal.unwind_gross_profit))}
                  </p>
                </Field>
                <div className="col-span-2">
                  <Field label="reason">
                    <p className="text-sm whitespace-pre-wrap text-fg-primary">
                      {deal.unwind_reason ?? "—"}
                    </p>
                  </Field>
                </div>
              </div>
            </FormSection>
          )}
        </div>
      </fieldset>

      {readOnly ? (
        <SheetFooter>
          <Button
            type="button"
            variant="secondary"
            className="ml-auto"
            onClick={onCancel}
          >
            Close
          </Button>
        </SheetFooter>
      ) : (
        <SheetFooter>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={isSubmitting} className="ml-auto">
            {isSubmitting ? "Saving…" : deal ? "Save changes" : "Add deal"}
          </Button>
        </SheetFooter>
      )}
    </form>
  )
}
