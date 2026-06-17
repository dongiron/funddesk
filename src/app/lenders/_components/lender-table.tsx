"use client"

import { useMemo, useState } from "react"
import { CheckIcon, MoreHorizontalIcon } from "lucide-react"
import type { Lender } from "../lender-schema"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { LenderForm } from "./lender-form"
import { DeleteLenderDialog } from "./delete-lender-dialog"

const CHIP =
  "rounded-md border border-line bg-surface px-3 py-2 font-mono text-xs tracking-wide text-fg-secondary outline-none transition-colors hover:text-fg-primary"
const GRID = "grid grid-cols-[1fr_140px_120px_72px_36px] items-center gap-3"

function subline(l: Lender): string {
  const signing =
    l.accepts_esign && !l.requires_physical_contract
      ? "e-sign"
      : !l.accepts_esign && l.requires_physical_contract
        ? "wet-ink"
        : null
  return [signing, `${l.days_to_bank_after_funding}d to bank`]
    .filter(Boolean)
    .join(" · ")
}

export function LenderTable({
  lenders,
  canManage,
  activeCounts,
}: {
  lenders: Lender[]
  canManage: boolean
  activeCounts: Record<string, number>
}) {
  const [editing, setEditing] = useState<Lender | "create" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lender | null>(null)
  const [search, setSearch] = useState("")
  const [portalFilter, setPortalFilter] = useState<string[]>([])
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")

  const sheetOpen = editing !== null
  const editingLender = editing === "create" ? undefined : (editing ?? undefined)

  const portalOptions = useMemo(() => {
    const set = new Set<string>()
    for (const l of lenders) if (l.communication_platform) set.add(l.communication_platform)
    return [...set].sort()
  }, [lenders])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return lenders
      .filter((l) => {
        if (q && !l.name.toLowerCase().includes(q)) return false
        if (
          portalFilter.length &&
          (!l.communication_platform || !portalFilter.includes(l.communication_platform))
        )
          return false
        return true
      })
      .sort((a, b) =>
        sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name)
      )
  }, [lenders, search, portalFilter, sortDir])

  const withThresholds = lenders.filter((l) => l.overdue_threshold_days != null).length
  const toggle = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Lenders</h1>
          <p className="mt-1 text-xs text-fg-secondary">
            <span className="font-mono">{lenders.length}</span> active ·{" "}
            <span className="font-mono">{withThresholds}</span> thresholds set
          </p>
        </div>
        {canManage && <Button onClick={() => setEditing("create")}>+ New lender</Button>}
      </header>

      <div className="mb-4 flex gap-2">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search lender"
          className="flex-1 bg-surface"
        />
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP}>
            portal{portalFilter.length ? ` · ${portalFilter.length}` : ""}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {portalOptions.length === 0 ? (
              <DropdownMenuLabel>No portals</DropdownMenuLabel>
            ) : (
              portalOptions.map((p) => (
                <DropdownMenuCheckboxItem
                  key={p}
                  checked={portalFilter.includes(p)}
                  onCheckedChange={() => setPortalFilter((prev) => toggle(prev, p))}
                >
                  {p}
                </DropdownMenuCheckboxItem>
              ))
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className={CHIP}>
            name {sortDir === "asc" ? "↑" : "↓"}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setSortDir("asc")}>
              {sortDir === "asc" && <CheckIcon className="size-3.5" />}
              Name (A→Z)
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => setSortDir("desc")}>
              {sortDir === "desc" && <CheckIcon className="size-3.5" />}
              Name (Z→A)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-fg-tertiary">
          {lenders.length === 0 ? "No lenders yet." : "No lenders match your filters."}
        </p>
      ) : (
        <div>
          <div
            className={`${GRID} border-b border-line pb-2 font-mono text-xs lowercase tracking-widest text-fg-tertiary`}
          >
            <div>lender</div>
            <div>portal</div>
            <div className="text-right">threshold</div>
            <div className="text-right">active</div>
            <div />
          </div>

          {filtered.map((l) => {
            const count = activeCounts[l.id] ?? 0
            return (
              <div
                key={l.id}
                className={`${GRID} border-b border-line/30 py-3.5 transition-colors hover:bg-surface/40`}
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-fg-primary">{l.name}</div>
                  <div className="truncate font-mono text-[10px] lowercase text-fg-tertiary">
                    {subline(l)}
                  </div>
                </div>
                <div className="truncate font-mono text-sm text-fg-secondary">
                  {l.communication_platform ?? "—"}
                </div>
                <div className="text-right font-mono text-fg-primary">
                  {l.overdue_threshold_days == null ? (
                    <span className="text-fg-muted">— not set</span>
                  ) : (
                    `${l.overdue_threshold_days} days`
                  )}
                </div>
                <div
                  className={`text-right font-mono ${count === 0 ? "font-normal text-fg-muted" : "font-bold text-fg-primary"}`}
                >
                  {count}
                </div>
                <div className="flex justify-end">
                  {canManage && (
                    <DropdownMenu>
                      <DropdownMenuTrigger
                        aria-label={`Actions for ${l.name}`}
                        className="text-fg-tertiary outline-none transition-colors hover:text-fg-primary"
                      >
                        <MoreHorizontalIcon className="size-4" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditing(l)}>Edit</DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleteTarget(l)}>
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Sheet
        open={sheetOpen}
        onOpenChange={(open) => {
          if (!open) setEditing(null)
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
          <SheetHeader>
            <SheetTitle>
              {editingLender ? `Edit ${editingLender.name}` : "Add lender"}
            </SheetTitle>
            <SheetDescription>
              Configure how this lender behaves during funding.
            </SheetDescription>
          </SheetHeader>
          {sheetOpen && (
            <LenderForm lender={editingLender} onSuccess={() => setEditing(null)} />
          )}
        </SheetContent>
      </Sheet>

      <DeleteLenderDialog
        lender={deleteTarget}
        onClose={() => setDeleteTarget(null)}
      />
    </div>
  )
}
