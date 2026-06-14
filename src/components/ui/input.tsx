import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  const classes = cn(
    "h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
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
