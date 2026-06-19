"use client"

import Link from "next/link"
import { signOut } from "@/lib/auth/actions"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function UserMenu({
  initials,
  dealership,
}: {
  initials: string
  dealership: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="font-mono text-xs text-fg-tertiary outline-none transition-colors hover:text-fg-secondary">
        {initials} · {dealership}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8}>
        <DropdownMenuItem render={<Link href="/settings/extensions" />}>
          Settings
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => signOut()}>Sign out</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
