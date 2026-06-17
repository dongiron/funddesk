import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const classes = cn(
    "h-8 w-full min-w-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-base text-fg-primary transition-colors outline-none placeholder:text-fg-muted focus-visible:border-gold disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm",
    className
  )

  // Workaround: base-ui's Field.Control renders today's date for an empty-value
  // date input (and resists clearing), so date inputs use a plain native
  // <input> instead. All other types keep the base-ui InputPrimitive path.
  if (type === "date") {
    return (
      <input type="date" data-slot="input" className={classes} {...props} />
    )
  }

  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={classes}
      {...props}
    />
  )
}

export { Input }
