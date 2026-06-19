"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { relativeTime } from "@/app/deals/block-schema"
import { GenerateTokenDialog } from "./generate-token-dialog"
import { RevokeTokenDialog } from "./revoke-token-dialog"

export type ExtensionTokenRow = {
  id: string
  label: string
  created_at: string
  last_used_at: string | null
}

const GRID = "grid grid-cols-[1fr_130px_150px_72px] items-center gap-3"

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })

export function TokensView({ tokens }: { tokens: ExtensionTokenRow[] }) {
  const [generating, setGenerating] = useState(false)
  const [revokeTarget, setRevokeTarget] = useState<ExtensionTokenRow | null>(null)

  return (
    <div>
      <header className="mb-6 flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-medium tracking-tight">Extensions</h1>
          <p className="mt-1 text-xs text-fg-secondary">
            <span className="font-mono">{tokens.length}</span> active token
            {tokens.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button onClick={() => setGenerating(true)}>+ New token</Button>
      </header>

      <p className="mb-4 max-w-prose text-sm text-fg-secondary">
        Generate a token, paste it into the TaptoSign extension, and it can sync
        deals into FundDesk on your behalf. Tokens are shown once at creation —
        store them somewhere safe.
      </p>

      {tokens.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-4 py-12 text-center text-sm text-fg-tertiary">
          No tokens yet. Generate one to connect the extension.
        </p>
      ) : (
        <div>
          <div
            className={`${GRID} border-b border-line pb-2 font-mono text-xs lowercase tracking-widest text-fg-tertiary`}
          >
            <div>label</div>
            <div>created</div>
            <div>last used</div>
            <div className="text-right">revoke</div>
          </div>

          {tokens.map((t) => (
            <div
              key={t.id}
              className={`${GRID} border-b border-line/30 py-3.5`}
            >
              <div className="min-w-0 truncate text-sm font-medium text-fg-primary">
                {t.label}
              </div>
              <div className="font-mono text-xs text-fg-secondary">
                {fmtDate(t.created_at)}
              </div>
              <div className="font-mono text-xs text-fg-secondary">
                {t.last_used_at ? (
                  relativeTime(t.last_used_at)
                ) : (
                  <span className="text-fg-muted">never</span>
                )}
              </div>
              <div className="flex justify-end">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-danger hover:text-danger"
                  onClick={() => setRevokeTarget(t)}
                >
                  Revoke
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <GenerateTokenDialog open={generating} onOpenChange={setGenerating} />
      <RevokeTokenDialog
        token={revokeTarget}
        onClose={() => setRevokeTarget(null)}
      />
    </div>
  )
}
