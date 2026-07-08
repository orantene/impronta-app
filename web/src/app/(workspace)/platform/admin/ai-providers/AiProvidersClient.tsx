"use client";

/**
 * Platform HQ · AI Providers — super_admin control for the GLOBAL AI provider.
 * Add/rotate an OpenAI or Anthropic key, activate a provider (this is how
 * "AI_PROVIDER=anthropic" becomes real without an env var), and see builder
 * generation usage + estimated cost. Secrets are write-only — only a masked
 * hint ever comes back.
 */

import { useState, useTransition } from "react";

import {
  saveAiProviderKeyAction,
  setAiGenerationModelAction,
  setAiProviderActiveAction,
  setAiSpendCapAction,
} from "./actions";
import type {
  AiUsageSummary,
  PlatformAiProviderState,
  ProviderConfigKind,
  ProviderRow,
  TenantSpendStatus,
} from "@/lib/ai/ai-provider-admin";

type ModelOption = { id: string; label: string; hint: string };

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
  spend,
  modelOptions,
}: {
  state: PlatformAiProviderState;
  usage: AiUsageSummary;
  spend: TenantSpendStatus;
  modelOptions: ModelOption[];
}) {
  const byKind = new Map(state.providers.map((p) => [p.kind, p] as const));
  const overWarn =
    spend.capCents != null &&
    spend.warnThresholdPercent != null &&
    spend.percentUsed >= spend.warnThresholdPercent;

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
        {overWarn ? (
          <Banner tone="warn">
            <strong>AI spend at {spend.percentUsed}% of the monthly cap.</strong>{" "}
            {money(spend.currentSpendCents / 100)} of {money((spend.capCents ?? 0) / 100)} used this
            month. {spend.hardStop ? "Generation is blocked once the cap is reached." : "Generation continues past the cap (warn-only)."}
          </Banner>
        ) : null}

        {/* Provider cards */}
        <section style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 6 }}>
          {PROVIDERS.map((p) => (
            <ProviderCard key={p.kind} def={p} row={byKind.get(p.kind)} />
          ))}
        </section>

        {/* Generation model picker */}
        <GenerationModelCard current={state.generationModel} options={modelOptions} />

        {/* Monthly spend cap */}
        <SpendCapCard spend={spend} />

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

function GenerationModelCard({
  current,
  options,
}: {
  current: string;
  options: ModelOption[];
}) {
  const [selected, setSelected] = useState(current);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function choose(id: string) {
    if (id === selected || pending) return;
    const prev = selected;
    setSelected(id); // optimistic
    setError(null);
    setOkMsg(null);
    startTransition(async () => {
      const r = await setAiGenerationModelAction({ model: id });
      if (r.ok) {
        setOkMsg("Saved.");
      } else {
        setSelected(prev);
        setError(r.error);
      }
    });
  }

  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ background: HQ.card, border: `1px solid ${HQ.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>Generation model</div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 4 }}>
          Which Claude model the AI page builder composes with. Applies to every generation.
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: 10,
            marginTop: 12,
          }}
        >
          {options.map((o) => {
            const isSel = o.id === selected;
            return (
              <button
                key={o.id}
                type="button"
                disabled={pending}
                onClick={() => choose(o.id)}
                style={{
                  textAlign: "left",
                  cursor: pending ? "default" : "pointer",
                  background: isSel ? HQ.accentSoft : HQ.cardHi,
                  border: `1px solid ${isSel ? "rgba(139,92,246,0.55)" : HQ.border}`,
                  borderRadius: 10,
                  padding: "11px 13px",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 13.5, fontWeight: 650, color: isSel ? HQ.accent : HQ.ink }}>
                    {o.label}
                  </span>
                  {isSel ? <Pill tone="green">Active</Pill> : null}
                </div>
                <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 4, lineHeight: 1.45 }}>
                  {o.hint}
                </div>
              </button>
            );
          })}
        </div>
        {error ? (
          <div style={{ fontSize: 12, color: HQ.rose, marginTop: 8 }}>{error}</div>
        ) : okMsg ? (
          <div style={{ fontSize: 12, color: HQ.green, marginTop: 8 }}>{okMsg}</div>
        ) : null}
      </div>
    </section>
  );
}

function SpendCapCard({ spend }: { spend: TenantSpendStatus }) {
  const [capDollars, setCapDollars] = useState(
    spend.capCents != null ? String(spend.capCents / 100) : "",
  );
  const [warnPct, setWarnPct] = useState(
    spend.warnThresholdPercent != null ? String(spend.warnThresholdPercent) : "",
  );
  const [hardStop, setHardStop] = useState(spend.hardStop);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const inputStyle: React.CSSProperties = {
    width: "100%",
    fontSize: 13,
    padding: "8px 10px",
    borderRadius: 8,
    background: HQ.cardHi,
    border: `1px solid ${HQ.border}`,
    color: HQ.ink,
    outline: "none",
  };

  function save() {
    setError(null);
    setOkMsg(null);
    const capTrim = capDollars.trim();
    const capCents = capTrim === "" ? null : Math.round(Number(capTrim) * 100);
    if (capCents != null && (!Number.isFinite(capCents) || capCents < 0)) {
      setError("Enter a valid cap amount.");
      return;
    }
    const warnTrim = warnPct.trim();
    const warn = warnTrim === "" ? null : Math.round(Number(warnTrim));
    if (warn != null && (!Number.isFinite(warn) || warn < 1 || warn > 100)) {
      setError("Warn threshold must be 1-100.");
      return;
    }
    startTransition(async () => {
      const r = await setAiSpendCapAction({ capCents, warnThresholdPercent: warn, hardStop });
      if (r.ok) setOkMsg("Saved.");
      else setError(r.error);
    });
  }

  const pct = Math.min(100, spend.percentUsed);
  const barColor = spend.percentUsed >= 90 ? HQ.rose : spend.percentUsed >= 60 ? HQ.amber : HQ.green;

  return (
    <section style={{ marginTop: 14 }}>
      <div style={{ background: HQ.card, border: `1px solid ${HQ.border}`, borderRadius: 14, padding: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 650 }}>Monthly spend cap</div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 4 }}>
          A guardrail on AI page-builder spend. With hard-stop on, generation is blocked once the cap
          is reached this month.
        </div>

        {spend.capCents != null ? (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: HQ.inkMuted }}>
              <span>{money(spend.currentSpendCents / 100)} spent</span>
              <span>
                {money(spend.capCents / 100)} cap · {spend.percentUsed}%
              </span>
            </div>
            <div style={{ height: 8, borderRadius: 999, background: HQ.cardHi, marginTop: 6, overflow: "hidden" }}>
              <div style={{ width: `${pct}%`, height: "100%", background: barColor }} />
            </div>
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: HQ.inkFaint }}>
            No cap set — AI spend is unlimited.
          </div>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginTop: 12 }}>
          <label style={{ fontSize: 11, color: HQ.inkFaint }}>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Monthly cap (USD)</span>
            <input value={capDollars} onChange={(e) => setCapDollars(e.target.value)} placeholder="e.g. 100 (blank = none)" inputMode="decimal" style={{ ...inputStyle, marginTop: 5 }} />
          </label>
          <label style={{ fontSize: 11, color: HQ.inkFaint }}>
            <span style={{ textTransform: "uppercase", letterSpacing: "0.08em" }}>Warn at (%)</span>
            <input value={warnPct} onChange={(e) => setWarnPct(e.target.value)} placeholder="e.g. 80" inputMode="numeric" style={{ ...inputStyle, marginTop: 5 }} />
          </label>
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, fontSize: 12.5, color: HQ.inkMuted, cursor: "pointer" }}>
          <input type="checkbox" checked={hardStop} onChange={(e) => setHardStop(e.target.checked)} />
          Hard-stop generation when the cap is reached
        </label>

        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            style={{
              fontSize: 13,
              fontWeight: 650,
              padding: "8px 16px",
              borderRadius: 9,
              cursor: pending ? "default" : "pointer",
              border: "none",
              background: HQ.accent,
              color: "#fff",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Saving…" : "Save cap"}
          </button>
          {error ? (
            <span style={{ fontSize: 12, color: HQ.rose }}>{error}</span>
          ) : okMsg ? (
            <span style={{ fontSize: 12, color: HQ.green }}>{okMsg}</span>
          ) : null}
        </div>
      </div>
    </section>
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
