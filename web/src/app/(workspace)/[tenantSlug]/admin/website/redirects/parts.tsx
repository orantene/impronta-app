"use client";

/**
 * Presentational pieces of the Redirects surface.
 *
 * Split out of `redirects-client.tsx` purely for size (that file is the state
 * machine; these are the parts it arranges). Nothing here holds redirect state
 * — every one of them takes props and calls back up.
 */

import {
  describeRedirectIssue,
  redirectFieldHint,
  type RedirectIssue,
  type RedirectRecord,
} from "@/lib/site-admin/redirects";

import { C, FONT, MONO, fieldStyle, Segmented, Btn } from "./ui";

/** A draft in the add row or an edit row — same three fields either way. */
export interface Draft {
  oldPath: string;
  newPath: string;
  statusCode: 301 | 302;
}

export const EMPTY_DRAFT: Draft = { oldPath: "", newPath: "", statusCode: 301 };

function formatWhen(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(iso));
}

export function StatStrip({
  total,
  active,
  issues,
  onShowIssues,
}: {
  total: number;
  active: number;
  issues: number;
  onShowIssues: () => void;
}) {
  const cell = (label: string, value: string, tone?: string) => (
    <div style={{ padding: "12px 16px", flex: 1, minWidth: 120 }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: tone ?? C.ink, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 11, color: C.inkMuted, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600 }}>
        {label}
      </div>
    </div>
  );
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        background: "#fff",
        border: `1px solid ${C.border}`,
        borderRadius: 12,
        overflow: "hidden",
      }}
    >
      {cell("Redirects", String(total))}
      <div style={{ width: 1, background: C.borderSoft }} />
      {cell("Active", String(active))}
      <div style={{ width: 1, background: C.borderSoft }} />
      <button
        type="button"
        onClick={onShowIssues}
        disabled={issues === 0}
        style={{
          flex: 1,
          minWidth: 120,
          textAlign: "left",
          background: "none",
          border: "none",
          cursor: issues === 0 ? "default" : "pointer",
          fontFamily: FONT,
          padding: 0,
        }}
      >
        {cell("Needs attention", String(issues), issues > 0 ? C.amber : C.ink)}
      </button>
    </div>
  );
}

export function DraftCard({
  title,
  draft,
  busy,
  siteHost,
  submitLabel,
  embedded,
  onChange,
  onSubmit,
  onCancel,
}: {
  title: string;
  draft: Draft;
  busy: boolean;
  siteHost: string;
  submitLabel: string;
  embedded?: boolean;
  onChange: (next: Draft) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const fromHint = redirectFieldHint(draft.oldPath);
  const toHint = redirectFieldHint(draft.newPath);
  const ready =
    draft.oldPath.trim() !== "" &&
    draft.newPath.trim() !== "" &&
    !fromHint &&
    !toHint &&
    !busy;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && ready) {
      e.preventDefault();
      onSubmit();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      onKeyDown={onKey}
      style={{
        background: "#fff",
        border: `1px solid ${embedded ? C.border : C.ink}`,
        borderRadius: 12,
        padding: 16,
        display: "flex",
        flexDirection: "column",
        gap: 12,
      }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{title}</div>

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
        <Field
          label="From — the old path"
          hint={fromHint}
          host={siteHost}
          value={draft.oldPath}
          placeholder="/old-page"
          autoFocus
          onChange={(oldPath) => onChange({ ...draft, oldPath })}
        />
        <div style={{ paddingTop: 30, color: C.inkDim, fontSize: 18 }} aria-hidden>
          →
        </div>
        <Field
          label="To — where it should go"
          hint={toHint}
          host={siteHost}
          value={draft.newPath}
          placeholder="/new-page"
          onChange={(newPath) => onChange({ ...draft, newPath })}
        />
      </div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <Segmented
          value={String(draft.statusCode)}
          options={[
            { value: "301", label: "301 Permanent" },
            { value: "302", label: "302 Temporary" },
          ]}
          onChange={(v) => onChange({ ...draft, statusCode: v === "302" ? 302 : 301 })}
        />
        <span style={{ fontSize: 11.5, color: C.inkMuted, maxWidth: 460 }}>
          {draft.statusCode === 301
            ? "Permanent: search engines move the old page's ranking to the new one and stop crawling the old path. Use this for a page that has moved for good."
            : "Temporary: search engines keep the old page indexed and keep checking it. Use this while a page is out for maintenance or during a campaign."}
        </span>
      </div>

      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <Btn onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" onClick={onSubmit} disabled={!ready}>
          {busy ? "Saving…" : submitLabel}
        </Btn>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  host,
  value,
  placeholder,
  autoFocus,
  onChange,
}: {
  label: string;
  hint: string | null;
  host: string;
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <label style={{ flex: 1, minWidth: 220, display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: C.inkMuted }}>
        {label}
      </span>
      <span style={{ display: "flex", alignItems: "center", border: `1px solid ${hint ? C.red : C.border}`, borderRadius: 8, background: "#fff", overflow: "hidden" }}>
        {host && (
          <span style={{ padding: "0 0 0 10px", fontFamily: MONO, fontSize: 11.5, color: C.inkDim, whiteSpace: "nowrap" }}>
            {host}
          </span>
        )}
        <input
          type="text"
          value={value}
          spellCheck={false}
          autoFocus={autoFocus}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          style={{
            ...fieldStyle,
            border: "none",
            borderRadius: 0,
            width: "100%",
            minWidth: 0,
            fontFamily: MONO,
            fontSize: 12.5,
          }}
        />
      </span>
      <span style={{ fontSize: 11, color: hint ? C.red : "transparent", minHeight: 14 }}>
        {hint ?? "."}
      </span>
    </label>
  );
}

function IssueChip({ issue }: { issue: RedirectIssue }) {
  const isLoop = issue.kind === "loop";
  return (
    <span
      title={describeRedirectIssue(issue)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "1px 7px",
        borderRadius: 999,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: 0.4,
        textTransform: "uppercase",
        background: isLoop ? C.redSoft : C.amberSoft,
        color: isLoop ? C.red : C.amber,
        cursor: "help",
      }}
    >
      {issue.kind === "loop" ? "Loop" : issue.kind === "chain" ? `${issue.hops} hops` : "Shadowed"}
    </span>
  );
}

export function Row({
  row,
  issues,
  siteHost,
  confirming,
  onEdit,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  row: RedirectRecord;
  issues: RedirectIssue[];
  siteHost: string;
  confirming: boolean;
  onEdit: () => void;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onConfirmDelete: () => void;
}) {
  const permanent = row.statusCode !== 302;
  return (
    <tr style={{ borderTop: `1px solid ${C.borderSoft}`, opacity: row.active ? 1 : 0.6 }}>
      <td style={{ padding: "10px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontFamily: MONO, fontSize: 12.5 }}>
          <span style={{ color: C.ink, fontWeight: 600 }}>{row.oldPath}</span>
          <span style={{ color: C.inkDim }}>→</span>
          <span style={{ color: C.accent }}>{row.newPath}</span>
          {issues.map((issue, i) => (
            <IssueChip key={`${issue.kind}-${i}`} issue={issue} />
          ))}
        </div>
        {siteHost && row.active && (
          <a
            href={`https://${siteHost}${row.oldPath}`}
            target="_blank"
            rel="noreferrer"
            style={{ fontSize: 11, color: C.inkMuted, textDecoration: "underline", marginTop: 3, display: "inline-block" }}
          >
            Test it on the live site ↗
          </a>
        )}
      </td>
      <td style={{ padding: "10px 14px" }}>
        <span
          title={permanent ? "301 — permanent move" : "302 — temporary move"}
          style={{
            fontFamily: MONO,
            fontSize: 11,
            fontWeight: 700,
            padding: "2px 7px",
            borderRadius: 999,
            background: permanent ? C.surface : C.amberSoft,
            color: permanent ? C.inkMuted : C.amber,
            whiteSpace: "nowrap",
          }}
        >
          {row.statusCode} {permanent ? "perm" : "temp"}
        </span>
      </td>
      <td style={{ padding: "10px 14px" }}>
        <button
          type="button"
          onClick={onToggle}
          role="switch"
          aria-checked={row.active}
          aria-label={row.active ? "Disable this redirect" : "Enable this redirect"}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 7,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            fontFamily: FONT,
            fontSize: 12,
            color: row.active ? C.green : C.inkMuted,
          }}
        >
          <span
            style={{
              width: 30,
              height: 18,
              borderRadius: 999,
              background: row.active ? C.green : "rgba(11,11,13,0.18)",
              position: "relative",
              transition: "background 120ms",
              flexShrink: 0,
            }}
          >
            <span
              style={{
                position: "absolute",
                top: 2,
                left: row.active ? 14 : 2,
                width: 14,
                height: 14,
                borderRadius: 999,
                background: "#fff",
                transition: "left 120ms",
              }}
            />
          </span>
          {row.active ? "Active" : "Off"}
        </button>
      </td>
      <td style={{ padding: "10px 14px", color: C.inkMuted, fontSize: 11.5, whiteSpace: "nowrap" }}>
        {formatWhen(row.updatedAt ?? row.createdAt)}
      </td>
      <td style={{ padding: "10px 14px", textAlign: "right", whiteSpace: "nowrap" }}>
        {confirming ? (
          <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
            <span style={{ fontSize: 11.5, color: C.red }}>Delete for good?</span>
            <Btn onClick={onCancelDelete}>Keep</Btn>
            <Btn variant="danger" onClick={onConfirmDelete}>
              Delete
            </Btn>
          </span>
        ) : (
          <span style={{ display: "inline-flex", gap: 6 }}>
            <Btn onClick={onEdit}>Edit</Btn>
            <Btn onClick={onAskDelete}>Delete</Btn>
          </span>
        )}
      </td>
    </tr>
  );
}

export function EmptyState({
  hasAny,
  onAdd,
  onClear,
}: {
  hasAny: boolean;
  onAdd: () => void;
  onClear: () => void;
}) {
  return (
    <div style={{ padding: "40px 24px", textAlign: "center", color: C.inkMuted, fontSize: 13 }}>
      {hasAny ? (
        <>
          <div style={{ marginBottom: 10 }}>No redirects match that search.</div>
          <Btn onClick={onClear}>Clear filters</Btn>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.ink, marginBottom: 6 }}>
            No redirects yet
          </div>
          <div style={{ maxWidth: 460, margin: "0 auto 14px", lineHeight: 1.5 }}>
            When you rename or remove a page, add a redirect so the old link keeps working —
            for visitors with a bookmark and for the ranking the old URL already earned.
          </div>
          <Btn variant="primary" onClick={onAdd}>
            Add your first redirect
          </Btn>
        </>
      )}
    </div>
  );
}

export function HowItWorks({ siteHost }: { siteHost: string }) {
  const host = siteHost || "your site";
  const item = (title: string, body: string) => (
    <div style={{ flex: 1, minWidth: 220 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{title}</div>
      <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.5 }}>{body}</div>
    </div>
  );
  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        flexWrap: "wrap",
        background: C.surface,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: 16,
      }}
    >
      {item(
        "Live straight away",
        `Saving takes effect on the next request to ${host}. There is nothing to publish or deploy.`,
      )}
      {item(
        "Exact paths, not patterns",
        "A redirect matches one path exactly. /old and /old/thing are two different rules, and wildcards aren't supported yet.",
      )}
      {item(
        "Query strings carry over",
        "?utm_source=… and the rest of the query survive the redirect, so campaign links keep their tracking.",
      )}
      {item(
        "Translated pages are separate",
        "The path is matched as the visitor sees it, so a Spanish page needs its own rule starting /es/.",
      )}
    </div>
  );
}
