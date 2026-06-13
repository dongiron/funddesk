"use client"

import { useState } from "react"
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react"
import type { Lender } from "../lender-schema"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet"
import { LenderForm } from "./lender-form"
import { DeleteLenderDialog } from "./delete-lender-dialog"

// Booleans shown as badges (true-only) in the Flags column.
const FLAGS: { key: keyof Lender; label: string }[] = [
  { key: "clears_stips_upfront", label: "Clears stips upfront" },
  { key: "does_welcome_calls", label: "Welcome calls" },
  { key: "does_employment_verification", label: "Employment verify" },
  { key: "can_increase_lender_fee", label: "Can raise fee" },
  { key: "accepts_esign", label: "e-sign" },
  { key: "requires_physical_contract", label: "Wet-ink" },
]

function NumberCell({ value }: { value: number | null }) {
  if (value == null) {
    return <span className="text-muted-foreground">Not configured</span>
  }
  return <span>{value}</span>
}

export function LenderTable({
  lenders,
  canManage,
}: {
  lenders: Lender[]
  canManage: boolean
}) {
  // "create" = new lender, a Lender = edit that row, null = sheet closed.
  const [editing, setEditing] = useState<Lender | "create" | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Lender | null>(null)

  const sheetOpen = editing !== null
  const editingLender = editing === "create" ? undefined : (editing ?? undefined)

  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setEditing("create")}>
            <PlusIcon />
            Add lender
          </Button>
        </div>
      )}

      {lenders.length === 0 ? (
        <p className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
          No lenders yet.
          {canManage ? " Add your first one above." : ""}
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Platform</TableHead>
                <TableHead>Days clean</TableHead>
                <TableHead>Overdue threshold</TableHead>
                <TableHead>Flags</TableHead>
                <TableHead>Stips</TableHead>
                {canManage && (
                  <TableHead className="text-right">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {lenders.map((lender) => (
                <TableRow key={lender.id}>
                  <TableCell className="font-medium">{lender.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {lender.communication_platform ?? "—"}
                  </TableCell>
                  <TableCell>
                    <NumberCell value={lender.typical_days_clean} />
                  </TableCell>
                  <TableCell>
                    <NumberCell value={lender.overdue_threshold_days} />
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {FLAGS.filter((f) => lender[f.key]).map((f) => (
                        <Badge key={f.key} variant="secondary">
                          {f.label}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-muted-foreground">
                    {lender.common_required_stips.length} req /{" "}
                    {lender.commonly_ghosted_stips.length} ghosted
                  </TableCell>
                  {canManage && (
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${lender.name}`}
                          onClick={() => setEditing(lender)}
                        >
                          <PencilIcon />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${lender.name}`}
                          onClick={() => setDeleteTarget(lender)}
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
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
          {/* Remount per open so react-hook-form picks up fresh defaultValues. */}
          {sheetOpen && (
            <LenderForm
              lender={editingLender}
              onSuccess={() => setEditing(null)}
            />
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
