"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { formPipelineStates, PIPELINE_STATE_LABELS, type Deal } from "../deal-schema"
import { setPipelineState } from "../actions"
import { FormSection } from "@/components/ui/form-section"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Immediate-write pipeline editor, rendered above the read-only DealForm in
// history so a deal landed in a terminal state by mistake can be moved back
// (D-history-editing — pipeline stays interactive across all views). Standalone
// (not inside the form's disabled fieldset) and covers every deal, unlike the
// funding/cash panels which only render for synced/cash deals.
export function PipelineControl({ deal }: { deal: Deal }) {
  const router = useRouter()
  const [value, setValue] = useState(deal.pipeline_state)
  const [pending, setPending] = useState(false)

  async function onChange(next: string) {
    const prev = value
    setValue(next)
    setPending(true)
    const result = await setPipelineState(deal.id, next)
    setPending(false)
    if (result.ok) {
      toast.success("Pipeline updated.")
      router.refresh()
    } else {
      setValue(prev)
      toast.error(result.error)
    }
  }

  return (
    <div className="border-b border-line px-6 py-6">
      <FormSection title="pipeline state">
        <Select
          value={value}
          onValueChange={(v) => onChange(v as string)}
          disabled={pending}
        >
          <SelectTrigger id="pipeline_state" className="w-full">
            <SelectValue>
              {(v) => PIPELINE_STATE_LABELS[v as string] ?? (v as string) ?? ""}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            {formPipelineStates(deal.payment_method).map((s) => (
              <SelectItem key={s} value={s}>
                {PIPELINE_STATE_LABELS[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormSection>
    </div>
  )
}
