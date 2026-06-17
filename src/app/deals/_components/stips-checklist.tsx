"use client"

import { useMemo, useState } from "react"
import { XIcon } from "lucide-react"
import { stipsMatch } from "../deal-schema"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export function StipsChecklist({
  stips_required,
  stips_received,
  onChange,
  disabled = false,
}: {
  stips_required: string[]
  stips_received: string[]
  onChange: (next: {
    stips_required: string[]
    stips_received: string[]
  }) => void
  disabled?: boolean
}) {
  const [custom, setCustom] = useState("")

  // Display list: required first (keep their casing), then any received-only
  // entries appended. Propagating this as stips_required promotes legacy
  // received-not-required entries on the next change.
  const effectiveRequired = useMemo(() => {
    const result = [...stips_required]
    for (const r of stips_received) {
      if (!result.some((x) => stipsMatch(x, r))) result.push(r)
    }
    return result
  }, [stips_required, stips_received])

  const isChecked = (stip: string) =>
    stips_received.some((r) => stipsMatch(r, stip))

  function toggle(stip: string, checked: boolean) {
    const received = checked
      ? isChecked(stip)
        ? stips_received
        : [...stips_received, stip]
      : stips_received.filter((r) => !stipsMatch(r, stip))
    onChange({ stips_required: effectiveRequired, stips_received: received })
  }

  function remove(stip: string) {
    onChange({
      stips_required: effectiveRequired.filter((x) => !stipsMatch(x, stip)),
      stips_received: stips_received.filter((r) => !stipsMatch(r, stip)),
    })
  }

  function addCustom() {
    const v = custom.trim()
    if (!v) return
    if (effectiveRequired.some((x) => stipsMatch(x, v))) {
      setCustom("")
      return
    }
    onChange({ stips_required: [...effectiveRequired, v], stips_received })
    setCustom("")
  }

  const receivedCount = effectiveRequired.filter(isChecked).length

  return (
    <div className="space-y-3">
      {effectiveRequired.length === 0 ? (
        <p className="text-sm text-fg-tertiary">No stips yet.</p>
      ) : (
        <>
          <div className="flex items-center justify-between font-mono text-xs tracking-wider text-fg-tertiary">
            <span className="lowercase">checklist</span>
            <span>
              <span
                className={
                  receivedCount === effectiveRequired.length
                    ? "text-success"
                    : "text-fg-primary"
                }
              >
                {receivedCount}
              </span>
              /{effectiveRequired.length} received
            </span>
          </div>
          <ul className="space-y-1.5">
            {effectiveRequired.map((stip, i) => (
              <li key={`${stip}-${i}`} className="flex items-center gap-2">
                <Checkbox
                  id={`stip-${i}`}
                  checked={isChecked(stip)}
                  disabled={disabled}
                  onCheckedChange={(c) => toggle(stip, c === true)}
                />
                <Label
                  htmlFor={`stip-${i}`}
                  className={`flex-1 font-normal ${
                    isChecked(stip) ? "text-fg-tertiary line-through" : "text-fg-primary"
                  }`}
                >
                  {stip}
                </Label>
                {!disabled && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${stip}`}
                    onClick={() => remove(stip)}
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {!disabled && (
        <div className="flex items-center gap-2">
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addCustom()
              }
            }}
            placeholder="Add custom stip"
          />
          <Button type="button" variant="secondary" size="sm" onClick={addCustom}>
            Add
          </Button>
        </div>
      )}
    </div>
  )
}
