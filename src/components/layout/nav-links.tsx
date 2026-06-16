"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const LINKS = [
  { href: "/", label: "Triage" },
  { href: "/deals", label: "Deals" },
  { href: "/deals/history", label: "History" },
  { href: "/lenders", label: "Lenders" },
] as const

function isActive(href: string, pathname: string): boolean {
  if (href === "/") return pathname === "/"
  // /deals is exact so it doesn't light up on /deals/history.
  if (href === "/deals") return pathname === "/deals"
  return pathname === href || pathname.startsWith(href + "/")
}

export function NavLinks() {
  const pathname = usePathname()
  return (
    <div className="flex items-center gap-6">
      {LINKS.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={
            isActive(l.href, pathname)
              ? "text-sm text-fg-primary"
              : "text-sm text-fg-secondary transition-colors hover:text-fg-primary"
          }
        >
          {l.label}
        </Link>
      ))}
    </div>
  )
}
