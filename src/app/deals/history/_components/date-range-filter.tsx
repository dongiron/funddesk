"use client"

import { useRouter } from "next/navigation"
import { CheckIcon } from "lucide-react"
import { RANGE_OPTIONS, type RangeValue } from "../../deal-schema"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function DateRangeFilter({ currentRange }: { currentRange: RangeValue }) {
  const router = useRouter()
  const label =
    RANGE_OPTIONS.find((o) => o.value === currentRange)?.label ?? "All time"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs tracking-wide text-fg-secondary outline-none transition-colors hover:text-fg-primary">
        {label.toLowerCase()}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {RANGE_OPTIONS.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onClick={() => router.push(`/deals/history?range=${o.value}`)}
          >
            {o.value === currentRange && <CheckIcon className="size-3.5" />}
            {o.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
