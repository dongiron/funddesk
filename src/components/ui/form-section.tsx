import * as React from "react"

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

// Numbered section header + divider, shared by the deal and lender forms so the
// trading-desk form chrome stays uniform. `index` is the two-digit step marker
// ("01", "02", …) rendered in gold; pass nothing to omit it.
function FormSection({
  index,
  title,
  description,
  children,
  className,
}: {
  index?: string
  title: string
  description?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="border-b border-line pb-2">
        <h3 className="flex items-baseline gap-2 font-mono text-xs tracking-wider text-fg-tertiary">
          {index && <span className="text-gold">{index}</span>}
          <span className="lowercase">{title}</span>
        </h3>
        {description && (
          <p className="mt-1 text-xs text-fg-muted">{description}</p>
        )}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

// A single labelled field row: field-variant label above the control, with an
// optional hint or error line below. Error takes precedence over hint.
function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
  className,
}: {
  label?: string
  htmlFor?: string
  hint?: string
  error?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && (
        <Label htmlFor={htmlFor} variant="field">
          {label}
        </Label>
      )}
      {children}
      {error ? (
        <p className="text-xs text-danger">{error}</p>
      ) : hint ? (
        <p className="text-xs text-fg-muted">{hint}</p>
      ) : null}
    </div>
  )
}

// Inline toggle row: a Switch on the left, label + optional hint stacked on the
// right. The caller supplies the Switch (wired to react-hook-form) as children.
function ToggleRow({
  label,
  hint,
  children,
  className,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-center justify-between gap-4 py-1",
        className
      )}
    >
      <span className="min-w-0">
        <span className="block text-sm text-fg-primary">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
      {children}
    </label>
  )
}

export { FormSection, Field, ToggleRow }
