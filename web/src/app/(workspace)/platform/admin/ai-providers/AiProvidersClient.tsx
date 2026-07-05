"use client";

/**
 * Platform HQ · AI Providers — super_admin control for the GLOBAL AI provider.
 * Add/rotate an OpenAI or Anthropic key, activate a provider (this is how
 * "AI_PROVIDER=anthropic" becomes real without an env var), and see builder
 * generation usage + estimated cost. Secrets are write-only — only a masked
 * hint ever comes back.
 */

import { useState, useTransition } from "react";

import { saveAiProviderKeyAction, setAiProviderActiveAction } from "./actions";
import type {
  AiUsageSummary,
  PlatformAiProviderState,
  ProviderConfigKind,
  ProviderRow,
} from "@/lib/ai/ai-provider-admin";

const HQ = {
  bg: "#0f0f12",
  card: "#16161A",
  cardHi: "#1c1c22",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkFaint: "rgba(245,242,235,0.40)",
  accent: "#8b5cf6",
  accentSoft: "rgba(139,92,246,0.14)",
  green: "#4ade80",
  greenSoft: "rgba(74,222,128,0.12)",
  amber: "#fbbf24",
  amberSoft: "rgba(251,191,36,0.12)",
  rose: "#fb7185",
} as const;

const PROVIDERS: { kind: ProviderConfigKind; name: string; hint: string; keyHint: string }[] = [
  {
    kind: "anthropic",
    name: "Anthropic (Claude)",
    hint: "Powers the AI page builder on Opus 4.8. Recommended.",
    keyHint: "sk-ant-…",
  },
  {
    kind: "openai",
    name: "OpenAI",
    hint: "Fallback / embeddings. Uses gpt-4o-mini for generation.",
    keyHint: "sk-…",
  },
];

function money(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}
function compact(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);
}

export function AiProvidersClient({
  state,
  usage,
}: {
  state: PlatformAiProviderState;
  usage: AiUsageSummary;
}) {
  const byKind = new Map(state.providers.map((p) => [p.kind, p] as const));

  return (
    <div style={{ minHeight: "100%", background: HQ.bg, color: HQ.ink, padding: "28px 32px 64px" }}>
      <div style={{ maxWidth: 880, margin: "0 auto" }}>
        <header style={{ marginBottom: 22 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", margin: 0 }}>
            AI Providers
          </h1>
          <p style={{ fontSize: 13.5, color: HQ.inkMuted, marginTop: 6, maxWidth: 620, lineHeight: 1.55 }}>
            The global AI provider every workspace inherits. Add a key and activate a provider to
            turn on the AI page builder — no environment variable needed.
          </p>
        </header>

        {/* Status strip */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <Stat label="Active provider" value={labelForKind(state.resolvedKind)} accent />
          <Stat label="Key encryption" value={state.encryptionConfigured ? "Configured" : "Missing"} warn={!state.encryptionConfigured} />
          <Stat
            label="Env override"
            value={state.envOverride ? `AI_PROVIDER=${state.envOverride}` : "None (DB controls)"}
            warn={!!state.envOverride}
          />
        </div>

        {!state.encryptionConfigured ? (
          <Banner tone="warn">
            <strong>AI_CREDENTIALS_ENCRYPTION_KEY is not set.</strong> Keys can&apos;t be stored until
            it&apos;s configured (base64 of exactly 32 random bytes) on the server.
          </Banner>
        ) : null}
        {state.envOverride ? (
          <Banner tone="warn">
            <strong>Env override active.</strong> <code>AI_PROVIDER={state.envOverride}</code> is set
            in the environment and wins over this page. Remove it to let the database control the
            active provider.
          </Banner>
        ) : null}

        {/* Provider cards */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.kind} def={p} row={byKind.get(p.kind)} />
          ))}
        </section>

        {/* Usage */}
        <UsagePanel usage={usage} />
      </div>
    </div>
  );
}

function labelForKind(kind: string): string {
  if (kind === "anthropic") return "Anthropic";
  if (kind === "openai") return "OpenAI";
  if (kind === "none") return "None";
  return kind;
}

function Stat({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ background: HQ.card, border: `1px solid ${HQ.border}`, borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ fontSize: 10.5, textTransform: "uppercase", letterSpacing: "0.1em", color: HQ.inkFaint }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 650,
          marginTop: 5,
          color: warn ? HQ.amber : accent ? HQ.accent : HQ.ink,
        }}
      >
        {value}
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: "warn"; children: React.ReactNode }) {
  return (
    <div
      style={{
        background: HQ.amberSoft,
        border: `1px solid rgba(251,191,36,0.28)`,
        color: HQ.ink,
        borderRadius: 12,
        padding: "11px 14px",
        fontSize: 12.5,
        lineHeight: 1.55,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

function ProviderCard({
  def,
  row,
}: {
  def: { kind: ProviderConfigKind; name: string; hint: string; keyHint: string };
  row: ProviderRow | undefined;
}) {
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const active = !!row && row.isDefault && !row.disabled;
  const hasKey = !!row?.hasKey;

  function save() {
    setError(null);
    setOkMsg(null);
    const value = key.trim();
    if (value.length < 8) {
      setError("Enter a valid API key.");
      return;
    }
    startTransition(async () => {
      const r = await saveAiProviderKeyAction({ kind: def.kind, apiKey: value });
      if (r.ok) {
        setKey("");
        setOkMsg("Saved and activated.");
      } else {
        setError(r.error);
      }
    });
  }

  function toggle(nextActive: boolean) {
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const r = await setAiProviderActiveAction({ kind: def.kind, active: nextActive });
      if (!r.ok) setError(r.error);
    });
  }

  return (
    <div
      style={{
        background: HQ.card,
        border: `1px solid ${active ? "rgba(139,92,246,0.45)" : HQ.border}`,
        borderRadius: 14,
        padding: 16,
        boxShadow: active ? "0 0 0 1px rgba(139,92,246,0.25)" : "none",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 15, fontWeight: 650 }}>{def.name}</span>
            {active ? (
              <Pill tone="green">Active</Pill>
            ) : hasKey ? (
              <Pill tone="muted">Key saved</Pill>
            ) : (
              <Pill tone="faint">Not configured</Pill>
            )}
          </div>
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 4 }}>{def.hint}</div>
          {hasKey && row?.maskedHint ? (
            <div style={{ fontSize: 11.5, color: HQ.inkFaint, marginTop: 4, fontFamily: "ui-monospace, monospace" }}>
              Key on file: {row.maskedHint}
            </div>
          ) : null}
        </div>
        {hasKey ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => toggle(!active)}
            style={{
              flexShrink: 0,
              fontSize: 12,
              fontWeight: 600,
              padding: "6px 12px",
              borderRadius: 8,
              cursor: pending ? "default" : "pointer",
              border: `1px solid ${HQ.border}`,
              background: active ? "transparent" : HQ.accentSoft,
              color: active ? HQ.inkMuted : HQ.accent,
            }}
          >
            {active ? "Deactivate" : "Activate"}
          </button>
        ) : null}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        <input
          type="password"
          value={key}
          onChange={(e) => {
            setKey(e.target.value);
            if (error) setError(null);
          }}
          placeholder={hasKey ? "Paste a new key to rotate…" : `Paste ${def.name} key (${def.keyHint})`}
          autoComplete="off"
          spellCheck={false}
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 13,
            padding: "9px 11px",
            borderRadius: 9,
            background: HQ.cardHi,
            border: `1px solid ${HQ.border}`,
            color: HQ.ink,
            outline: "none",
            fontFamily: "ui-monospace, monospace",
          }}
        />
        <button
          type="button"
          disabled={pending || key.trim().length < 8}
          onClick={save}
          style={{
            flexShrink: 0,
            fontSize: 13,
            fontWeight: 650,
            padding: "9px 16px",
            borderRadius: 9,
            cursor: pending || key.trim().length < 8 ? "default" : "pointer",
            border: "none",
            background: HQ.accent,
            color: "#fff",
            opacity: pending || key.trim().length < 8 ? 0.55 : 1,
          }}
        >
          {pending ? "Saving…" : "Save & activate"}
        </button>
      </div>

      {error ? (
        <div style={{ fontSize: 12, color: HQ.rose, marginTop: 8 }}>{error}</div>
      ) : okMsg ? (
        <div style={{ fontSize: 12, color: HQ.green, marginTop: 8 }}>{okMsg}</div>
      ) : null}
    </div>
  );
}

function Pill({ tone, children }: { tone: "green" | "muted" | "faint"; children: React.ReactNode }) {
  const map = {
    green: { bg: HQ.greenSoft, fg: HQ.green },
    muted: { bg: "rgba(245,242,235,0.10)", fg: HQ.inkMuted },
    faint: { bg: "transparent", fg: HQ.inkFaint },
  } as const;
  const c = map[tone];
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        padding: "2px 7px",
        borderRadius: 999,
        background: c.bg,
        color: c.fg,
        border: tone === "faint" ? `1px solid ${HQ.border}` : "none",
      }}
    >
      {children}
    </span>
  );
}

function UsagePanel({ usage }: { usage: AiUsageSummary }) {
  return (
    <section style={{ marginTop: 24 }}>
      <h2 style={{ fontSize: 14, fontWeight: 650, margin: "0 0 4px" }}>
        Builder generation usage
      </h2>
      <p style={{ fontSize: 12, color: HQ.inkMuted, margin: "0 0 12px" }}>
        AI page-builder calls over the last {usage.windowDays} days. Cost is estimated from token
        counts at list prices.
      </p>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
          gap: 12,
        }}
      >
        <Stat label="Generations" value={`${usage.totalCalls}`} />
        <Stat label="Succeeded" value={`${usage.okCalls}`} />
        <Stat label="Tokens (in / out)" value={`${compact(usage.inputTokens)} / ${compact(usage.outputTokens)}`} />
        <Stat label="Est. cost" value={money(usage.costUsd)} accent />
      </div>

      {usage.byDay.length > 0 ? (
        <div
          style={{
            marginTop: 14,
            background: HQ.card,
            border: `1px solid ${HQ.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          {usage.byDay.map((d, i) => (
            <div
              key={d.day}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "8px 14px",
                borderTop: i === 0 ? "none" : `1px solid ${HQ.borderSoft}`,
                fontSize: 12.5,
              }}
            >
              <span style={{ color: HQ.inkMuted, fontFamily: "ui-monospace, monospace" }}>{d.day}</span>
              <span style={{ color: HQ.inkFaint }}>{d.calls} calls</span>
              <span style={{ color: HQ.ink, fontWeight: 600 }}>{money(d.costUsd)}</span>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginTop: 14, fontSize: 12.5, color: HQ.inkFaint }}>
          No generations recorded yet. Usage appears here once the builder AI runs.
        </div>
      )}
    </section>
  );
}
