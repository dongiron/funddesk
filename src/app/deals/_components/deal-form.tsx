"use client"

import { useEffect } from "react"
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
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

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
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        type={type}
        step={step}
        placeholder={placeholder}
        {...register(name)}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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
    <div className="space-y-1.5">
      <Label htmlFor={name}>{label}</Label>
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
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-sm font-semibold text-foreground">{children}</h3>
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
    stips_required: deal?.stips_required?.join(", ") ?? "",
    stips_received: deal?.stips_received?.join(", ") ?? "",
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
  readOnly = false,
}: {
  deal?: Deal
  lenders: LenderOption[]
  onSuccess: () => void
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

  // On create only: when a lender is picked, seed physical-contract + required
  // stips from that lender. Never auto-overwrite on edit.
  useEffect(() => {
    if (deal) return
    if (!lenderId) return
    const l = lenders.find((x) => x.id === lenderId)
    if (!l) return
    setValue("physical_contract_required", l.requires_physical_contract)
    setValue("stips_required", l.common_required_stips.join(", "))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lenderId])

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
      className="flex flex-col gap-6 px-4 pb-6"
    >
      <fieldset disabled={readOnly} className="contents">
      {/* 1 — Customer */}
      <section className="space-y-3">
        <SectionTitle>Customer</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <TField name="customer_first_name" label="First name" register={register} errors={errors} />
          <TField name="customer_last_name" label="Last name" register={register} errors={errors} />
        </div>
      </section>

      {/* 2 — Vehicle */}
      <section className="space-y-3">
        <SectionTitle>Vehicle</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <TField name="vehicle_year" label="Year" type="number" step="1" register={register} errors={errors} />
          <TField name="vehicle_make" label="Make" register={register} errors={errors} />
          <TField name="vehicle_model" label="Model" register={register} errors={errors} />
          <TField name="stock_number" label="Stock #" register={register} errors={errors} />
          <div className="col-span-2">
            <TField name="vehicle_vin" label="VIN" register={register} errors={errors} />
          </div>
        </div>
      </section>

      {/* 3 — Lender */}
      <section className="space-y-3">
        <SectionTitle>Lender</SectionTitle>
        <div className="space-y-1.5">
          <Label htmlFor="lender_id">Lender</Label>
          {readOnly ? (
            <p className="text-sm">{deal?.lender?.name ?? "—"}</p>
          ) : (
            <>
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
              {errors.lender_id && (
                <p className="text-xs text-destructive">
                  {errors.lender_id.message}
                </p>
              )}
            </>
          )}
        </div>
      </section>

      {/* 4 — Pipeline state */}
      <section className="space-y-3">
        <SectionTitle>Pipeline state</SectionTitle>
        {readOnly ? (
          <p className="text-sm">
            {PIPELINE_STATE_LABELS[deal?.pipeline_state ?? ""] ??
              deal?.pipeline_state ??
              "—"}
          </p>
        ) : (
          <>
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
            <p className="text-xs text-muted-foreground">
              To unwind a deal, use the Unwind action on the list, not this
              dropdown.
            </p>
          </>
        )}
      </section>

      {/* 5 — Financial */}
      <section className="space-y-3">
        <SectionTitle>Financial</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <TField name="amount_financed" label="Amount financed" type="number" step="0.01" register={register} errors={errors} />
          <TField name="term_months" label="Term (months)" type="number" step="1" register={register} errors={errors} />
          <TField name="apr" label="APR (%)" type="number" step="0.0001" register={register} errors={errors} />
          <TField name="monthly_payment" label="Monthly payment" type="number" step="0.01" register={register} errors={errors} />
          <TField name="front_gross" label="Front gross" type="number" step="0.01" register={register} errors={errors} />
          <TField name="back_gross" label="Back gross" type="number" step="0.01" register={register} errors={errors} />
          <TField name="pack" label="Pack" type="number" step="0.01" register={register} errors={errors} />
          <TField name="reserve" label="Reserve" type="number" step="0.01" register={register} errors={errors} />
        </div>
      </section>

      {/* 6 — Dates */}
      <section className="space-y-3">
        <SectionTitle>Dates</SectionTitle>
        <div className="grid grid-cols-2 gap-3">
          <DateField name="sold_date" label="Sold date" control={control} errors={errors} clearable={false} />
          <DateField name="submitted_to_lender_date" label="Submitted to lender" control={control} errors={errors} />
          <DateField name="funded_date" label="Funded date" control={control} errors={errors} />
          <DateField name="physical_contract_mailed_date" label="Physical contract mailed" control={control} errors={errors} />
        </div>
      </section>

      {/* 7 — Physical contract */}
      <section className="space-y-3">
        <SectionTitle>Physical contract</SectionTitle>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="physical_contract_required"
            render={({ field }) => (
              <Checkbox
                id="physical_contract_required"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
              />
            )}
          />
          <Label htmlFor="physical_contract_required" className="font-normal">
            Requires a physical (wet-ink) contract
          </Label>
        </div>
      </section>

      {/* 8 — Stips */}
      <section className="space-y-3">
        <SectionTitle>Stips</SectionTitle>
        <TField name="stips_required" label="Required stips" placeholder="paystub, proof of residence, insurance" register={register} errors={errors} />
        <TField name="stips_received" label="Received stips" placeholder="paystub" register={register} errors={errors} />
        <p className="text-xs text-muted-foreground">Comma-separated.</p>
      </section>

      {/* 9 — Trade */}
      <section className="space-y-3">
        <SectionTitle>Trade-in</SectionTitle>
        <div className="flex items-center gap-2">
          <Controller
            control={control}
            name="has_trade"
            render={({ field }) => (
              <Checkbox
                id="has_trade"
                checked={field.value}
                onCheckedChange={(c) => field.onChange(c === true)}
              />
            )}
          />
          <Label htmlFor="has_trade" className="font-normal">
            Customer has a trade-in
          </Label>
        </div>

        {hasTrade && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border border-dashed p-3">
            <TField name="trade_year" label="Trade year" type="number" step="1" register={register} errors={errors} />
            <TField name="trade_make" label="Trade make" register={register} errors={errors} />
            <TField name="trade_model" label="Trade model" register={register} errors={errors} />
            <TField name="trade_vin" label="Trade VIN" register={register} errors={errors} />
            <TField name="trade_acv" label="ACV" type="number" step="0.01" register={register} errors={errors} />
            <TField name="trade_allowance" label="Allowance" type="number" step="0.01" register={register} errors={errors} />
            <TField name="trade_payoff_quoted" label="Payoff quoted" type="number" step="0.01" register={register} errors={errors} />
            <TField name="trade_payoff_lender" label="Payoff lender" register={register} errors={errors} />
            <DateField name="trade_payoff_sent_date" label="Payoff sent" control={control} errors={errors} />
            <DateField name="trade_payoff_received_date" label="Payoff received" control={control} errors={errors} />
            <div className="col-span-2">
              <DateField name="trade_title_received_date" label="Title received" control={control} errors={errors} />
            </div>
          </div>
        )}
      </section>

      </fieldset>

      {readOnly && deal?.pipeline_state === "unwound" && (
        <section className="space-y-3">
          <SectionTitle>Unwind details</SectionTitle>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Unwound date</Label>
              <p className="text-sm">{deal.unwound_date ?? "—"}</p>
            </div>
            <div className="space-y-1">
              <Label>Gross profit lost</Label>
              <p className="text-sm">
                {deal.unwind_gross_profit == null
                  ? "—"
                  : usd.format(Number(deal.unwind_gross_profit))}
              </p>
            </div>
            <div className="col-span-2 space-y-1">
              <Label>Reason</Label>
              <p className="text-sm whitespace-pre-wrap">
                {deal.unwind_reason ?? "—"}
              </p>
            </div>
          </div>
        </section>
      )}

      {!readOnly && (
        <Button type="submit" disabled={isSubmitting} className="mt-2">
          {isSubmitting ? "Saving…" : deal ? "Save changes" : "Add deal"}
        </Button>
      )}
    </form>
  )
}
