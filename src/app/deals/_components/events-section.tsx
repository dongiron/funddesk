"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  CheckCircle2Icon,
  FileCheckIcon,
  PaperclipIcon,
  PenLineIcon,
  PlusIcon,
  SendIcon,
  StickyNoteIcon,
  Undo2Icon,
  type LucideIcon,
} from "lucide-react"
import { relativeTime } from "../block-schema"
import {
  EVENT_SOURCE_LABELS,
  EVENT_TYPE_LABELS,
  MANUAL_EVENT_TYPES,
  type DealEvent,
  type DealEventSource,
  type DealEventType,
} from "../deal-schema"
import { addManualDealEvent } from "../actions"
import { FormSection, Field } from "@/components/ui/form-section"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const EVENT_ICONS: Record<string, LucideIcon> = {
  signed: PenLineIcon,
  contract_submitted: SendIcon,
  contract_returned: Undo2Icon,
  booked: FileCheckIcon,
  funded: CheckCircle2Icon,
  manual_note: StickyNoteIcon,
  stip_received: PaperclipIcon,
}

// yyyy-MM-ddThh:mm in local time, for <input type="datetime-local">.
function localDatetimeNow(): string {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

export function EventsSection({
  dealId,
  events,
  canAdd,
  userNames,
}: {
  dealId: string
  events: DealEvent[]
  canAdd: boolean
  userNames: Record<string, string>
}) {
  const router = useRouter()
  const [adding, setAdding] = useState(false)
  const [eventType, setEventType] = useState<DealEventType>("manual_note")
  const [eventAt, setEventAt] = useState(localDatetimeNow)
  const [description, setDescription] = useState("")
  const [pending, setPending] = useState(false)

  const sorted = [...events].sort((a, b) => b.event_at.localeCompare(a.event_at))

  async function submit() {
    setPending(true)
    const iso = new Date(eventAt).toISOString()
    const result = await addManualDealEvent(dealId, eventType, iso, description)
    setPending(false)
    if (result.ok) {
      toast.success("Event added.")
      setAdding(false)
      setDescription("")
      setEventType("manual_note")
      setEventAt(localDatetimeNow())
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <div className="border-b border-line px-6 py-6">
      <FormSection title="events">
        {canAdd &&
          (adding ? (
            <div className="space-y-3 rounded-md border border-line bg-surface/40 p-3">
              <Field label="type">
                <Select
                  value={eventType}
                  onValueChange={(v) => setEventType(v as DealEventType)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(v) => EVENT_TYPE_LABELS[v as DealEventType] ?? ""}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {MANUAL_EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {EVENT_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="when">
                <Input
                  type="datetime-local"
                  value={eventAt}
                  onChange={(e) => setEventAt(e.target.value)}
                />
              </Field>
              <Field label="description">
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What happened?"
                />
              </Field>
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => setAdding(false)}
                  disabled={pending}
                >
                  Cancel
                </Button>
                <Button type="button" onClick={submit} disabled={pending}>
                  Add event
                </Button>
              </div>
            </div>
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setAdding(true)}
            >
              <PlusIcon className="size-3.5" />
              Add event
            </Button>
          ))}

        {sorted.length === 0 ? (
          <p className="text-xs text-fg-muted">No events recorded yet.</p>
        ) : (
          <div>
            {sorted.map((e) => {
              const Icon = EVENT_ICONS[e.event_type] ?? StickyNoteIcon
              const actor = e.created_by ? userNames[e.created_by] : null
              return (
                <div
                  key={e.id}
                  className="flex gap-3 border-b border-line/30 py-2.5 last:border-0"
                >
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-fg-tertiary" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm text-fg-primary">
                        {EVENT_TYPE_LABELS[e.event_type as DealEventType] ?? e.event_type}
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-fg-tertiary">
                        {relativeTime(e.event_at)}
                      </span>
                    </div>
                    {e.description && (
                      <div className="mt-0.5 text-xs text-fg-secondary">{e.description}</div>
                    )}
                    <div className="mt-0.5 font-mono text-[10px] text-fg-muted">
                      {EVENT_SOURCE_LABELS[e.source as DealEventSource] ?? e.source}
                      {actor ? ` · ${actor}` : ""}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </FormSection>
    </div>
  )
}
