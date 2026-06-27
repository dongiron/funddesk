"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { CheckIcon, RefreshCwIcon } from "lucide-react"
import { relativeTime } from "../deals/block-schema"
import { displayName, type LenderMessage } from "../deals/deal-schema"
import { markMessageCompleted, markMessageRead } from "../deals/actions"

type Filter = "all" | "unread" | "completed"
const FILTERS: Filter[] = ["all", "unread", "completed"]

export function NotificationCenter({
  messages,
  unreadCount,
}: {
  messages: LenderMessage[]
  unreadCount: number
}) {
  const router = useRouter()
  const [filter, setFilter] = useState<Filter>("all")
  const [refreshing, setRefreshing] = useState(false)

  // "all" hides completed (they live under the completed filter); "unread" is
  // unread + not completed; "completed" is the completed archive.
  const visible = messages
    .filter((m) => {
      if (filter === "completed") return !!m.completed_at
      if (filter === "unread") return !m.read_at && !m.completed_at
      return !m.completed_at
    })
    .slice(0, 20)

  function onRefresh() {
    setRefreshing(true)
    router.refresh()
    setTimeout(() => setRefreshing(false), 600)
  }

  async function openMessage(m: LenderMessage) {
    if (!m.read_at) await markMessageRead(m.id) // optimistic; revalidates server-side
    router.push(`/deals?dealId=${m.deal_id}`)
  }

  async function complete(e: React.MouseEvent, m: LenderMessage) {
    e.stopPropagation()
    const result = await markMessageCompleted(m.id)
    if (result.ok) {
      toast.success("Marked complete.")
      router.refresh()
    } else {
      toast.error(result.error)
    }
  }

  return (
    <section className="mt-10 border-t border-line pt-8">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-base font-medium tracking-tight text-fg-primary">
            Recent messages
          </h3>
          {unreadCount > 0 && (
            <span className="rounded-full bg-gold/15 px-2 py-0.5 font-mono text-[10px] text-gold">
              {unreadCount} unread
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          title="Re-pull messages from FundDesk. New messages are synced from the FundDesk extension on a RouteOne Decision Summary page."
          className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 font-mono text-xs text-fg-secondary transition-colors hover:text-fg-primary disabled:opacity-50"
        >
          <RefreshCwIcon className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      <div className="mb-3 flex gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-md border px-3 py-1 font-mono text-xs lowercase tracking-wide transition-colors ${
              filter === f
                ? "border-gold/40 bg-gold/5 text-gold"
                : "border-line bg-surface text-fg-secondary hover:text-fg-primary"
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-fg-tertiary">
          {filter === "completed" ? "No completed messages." : "No messages."}
        </p>
      ) : (
        <div>
          {visible.map((m) => {
            const unread = !m.read_at
            return (
              <div
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => openMessage(m)}
                className="grid w-full cursor-pointer grid-cols-[10px_1fr_28px] items-start gap-3 border-b border-line/30 py-3 text-left transition-colors hover:bg-surface/40"
              >
                <span
                  className={`mt-1.5 size-2 rounded-full ${unread ? "bg-gold" : "bg-transparent"}`}
                  aria-label={unread ? "unread" : undefined}
                />
                <div className="min-w-0">
                  <div className="mb-0.5 flex items-baseline gap-2 text-xs">
                    <span className={`truncate ${unread ? "font-medium text-fg-primary" : "text-fg-secondary"}`}>
                      {m.sender_name}
                    </span>
                    <span className="shrink-0 text-fg-tertiary">·</span>
                    <span className="truncate text-fg-secondary">
                      {m.deal ? displayName(m.deal) : "—"}
                    </span>
                    <span className="ml-auto shrink-0 font-mono text-[10px] text-fg-tertiary">
                      {relativeTime(m.received_at)}
                    </span>
                  </div>
                  <div className="line-clamp-3 text-sm text-fg-primary">{m.body}</div>
                </div>
                <button
                  type="button"
                  onClick={(e) => complete(e, m)}
                  title="Mark complete"
                  aria-label="Mark complete"
                  className="mt-0.5 inline-flex size-7 items-center justify-center rounded-md border border-line text-fg-tertiary transition-colors hover:border-success/40 hover:text-success"
                >
                  <CheckIcon className="size-3.5" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
