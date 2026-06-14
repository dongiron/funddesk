"use client"

import { useRouter } from "next/navigation"
import { RANGE_OPTIONS, type RangeValue } from "../../deal-schema"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export function DateRangeFilter({
  currentRange,
}: {
  currentRange: RangeValue
}) {
  const router = useRouter()

  return (
    <div className="flex items-center gap-2">
      <Label htmlFor="range" className="text-sm text-muted-foreground">
        Range
      </Label>
      <Select
        value={currentRange}
        onValueChange={(v) => router.push(`/deals/history?range=${v as string}`)}
      >
        <SelectTrigger id="range" className="w-44">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {RANGE_OPTIONS.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}
