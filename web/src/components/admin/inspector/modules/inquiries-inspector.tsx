"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ADMIN_APANEL_PEEK } from "@/lib/admin/admin-panel-search-params";
import type { InspectorContext } from "@/lib/admin/admin-inspector/types";
import { isUuidPathSegment, pathSegments } from "@/lib/admin/admin-inspector/context";
import { Button } from "@/components/ui/button";
import { AIInlineAssistant } from "@/components/ai/ai-inline-assistant";
import { AIActionButton } from "@/components/ai/ai-action-button";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";
import { Textarea } from "@/components/ui/textarea";

function isInquiriesList(ctx: InspectorContext) {
  return ctx.pathname === "/admin/inquiries";
}

function isInquiryDetail(ctx: InspectorContext) {
  const s = pathSegments(ctx.pathname);
  return s.length === 3 && s[0] === "admin" && s[1] === "inquiries" && isUuidPathSegment(s[2]!);
}

function inquiryDetailId(ctx: InspectorContext): string | null {
  const s = pathSegments(ctx.pathname);
  if (!isInquiryDetail(ctx) || !s[2]) return null;
  return s[2]!;
}

function filterLines(ctx: InspectorContext): string[] {
  const sp = ctx.searchParams;
  const lines: string[] = [];
  const status = sp.get("status");
  if (status && status !== "all") lines.push(`Status: ${status.replace(/_/g, " ")}`);
  if (sp.get("q")?.trim()) lines.push(`Search: “${sp.get("q")!.trim()}”`);
  if (sp.get("client_account_id")) lines.push("Scoped to client account");
  if (sp.get("client_user_id")) lines.push("Scoped to platform client");
  if (sp.get("assigned_staff_id")) lines.push("Filtered by assignee");
  if (sp.get("created_from") || sp.get("created_to")) lines.push("Created date range applied");
  return lines;
}

const NEXT_BY_STATUS: Record<string, string> = {
  new: "Acknowledge, link to client account if known, and assign an owner.",
  reviewing: "Confirm brief, shortlist talent, and move toward suggestion or conversion.",
  in_progress: "Keep client updated; align on dates, fees, and deliverables.",
  waiting_for_client: "Follow up on pending client input before advancing.",
  talent_suggested: "Collect client feedback on suggested talent or adjust shortlist.",
  converted: "Ensure the linked booking is staffed and payment milestones are set.",
  closed: "Archive context is final — use for reference only.",
  archived: "Low-touch queue; reopen only if the client returns.",
};

export function InquiriesFiltersModule({ ctx }: { ctx: InspectorContext }) {
  if (!isInquiriesList(ctx)) return null;
  const lines = filterLines(ctx);
  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      {lines.length ? (
        <ul className="list-inside list-disc space-y-1">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p>No filters — showing the full inquiry queue.</p>
      )}
    </div>
  );
}

export function InquiriesNextStepModule({ ctx }: { ctx: InspectorContext }) {
  if (!isInquiriesList(ctx)) return null;
  const st = ctx.searchParams.get("status") ?? "all";
  const hint = st !== "all" && NEXT_BY_STATUS[st] ? NEXT_BY_STATUS[st] : NEXT_BY_STATUS.new;
  return <p className="text-xs leading-relaxed text-[var(--admin-nav-idle)]">{hint}</p>;
}

export function InquiriesDraftShortcutModule({ ctx }: { ctx: InspectorContext }) {
  if (!isInquiriesList(ctx)) return null;
  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      <p>
        LLM-assisted client message drafting runs on the{" "}
        <span className="text-[var(--admin-workspace-fg)]">inquiry workspace</span> when OpenAI is configured and
        inquiry drafting is enabled in feature flags.
      </p>
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/settings" scroll={false}>
          Feature flags
        </Link>
      </Button>
    </div>
  );
}

type InquiryInspectorPayload = {
  id: string;
  status: string;
  contact_name: string;
  contact_email: string;
  company: string | null;
  event_date: string | null;
  event_location: string | null;
  quantity: number | null;
  message: string | null;
  client_account_name: string | null;
  client_user_id: string | null;
  talent_names: string[];
  linked_booking_count: number;
};

export function InquiriesSelectedPeekModule({ ctx }: { ctx: InspectorContext }) {
  const [data, setData] = useState<InquiryInspectorPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active =
    isInquiriesList(ctx) && ctx.apanel === ADMIN_APANEL_PEEK && Boolean(ctx.aid);

  useEffect(() => {
    if (!active || !ctx.aid) {
      setData(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetch(`/api/admin/inspector/inquiry?id=${encodeURIComponent(ctx.aid!)}`)
      .then(async (r) => {
        const j = (await r.json()) as InquiryInspectorPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setData(null);
          setErr(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, ctx.aid]);

  if (!active) return null;
  if (loading) return <p className="text-xs text-[var(--admin-nav-idle)]">Loading inquiry…</p>;
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!data) return null;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <AdminCommercialStatusBadge kind="inquiry" status={data.status} />
        <span className="text-[var(--admin-nav-idle)]">
          {data.talent_names.length} talent · {data.linked_booking_count} booking
          {data.linked_booking_count === 1 ? "" : "s"}
        </span>
      </div>
      <p className="font-medium text-[var(--admin-workspace-fg)]">{data.contact_name}</p>
      <p className="text-[var(--admin-nav-idle)]">{data.contact_email}</p>
      {data.company ? <p className="text-[var(--admin-nav-idle)]">{data.company}</p> : null}
      <Button asChild size="sm" variant="secondary" className="h-8 rounded-lg text-xs">
        <Link href={`/admin/inquiries/${data.id}`} scroll={false}>
          Open workspace
        </Link>
      </Button>
    </div>
  );
}

export function InquiryDetailSummaryModule({ ctx }: { ctx: InspectorContext }) {
  const id = inquiryDetailId(ctx);
  const [data, setData] = useState<InquiryInspectorPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetch(`/api/admin/inspector/inquiry?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = (await r.json()) as InquiryInspectorPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!isInquiryDetail(ctx) || !id) return null;
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!data) return <p className="text-xs text-[var(--admin-nav-idle)]">Loading summary…</p>;

  return (
    <dl className="grid gap-2 text-xs text-[var(--admin-nav-idle)]">
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Event</dt>
        <dd>{data.event_location ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Date / qty</dt>
        <dd>
          {data.event_date ?? "—"} · {data.quantity != null ? `${data.quantity}` : "—"}
        </dd>
      </div>
      {data.client_account_name ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Account</dt>
          <dd>{data.client_account_name}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Shortlist</dt>
        <dd>{data.talent_names.length ? data.talent_names.join(", ") : "None yet"}</dd>
      </div>
    </dl>
  );
}

export function InquiryDetailDraftModule({ ctx }: { ctx: InspectorContext }) {
  const id = inquiryDetailId(ctx);
  const [payload, setPayload] = useState<InquiryInspectorPayload | null>(null);
  const [busy, setBusy] = useState<"generate" | "polish" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [output, setOutput] = useState("");

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetch(`/api/admin/inspector/inquiry?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = (await r.json()) as InquiryInspectorPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setPayload(j);
      })
      .catch(() => {
        if (!cancelled) setPayload(null);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const readBriefFromDom = useCallback(() => {
    const el = document.getElementById("message") as HTMLTextAreaElement | null;
    return el?.value ?? "";
  }, []);

  const run = useCallback(
    async (action: "generate" | "polish") => {
      if (!payload) return;
      setError(null);
      const currentMessage = readBriefFromDom();
      if (action === "polish" && !currentMessage.trim()) {
        setError("Add text to the Brief / notes field before polishing.");
        return;
      }
      setBusy(action);
      try {
        const res = await fetch("/api/ai/inquiry-draft", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            locale: "en",
            talentNames: payload.talent_names.length ? payload.talent_names : ["Talent TBD"],
            rawQuery: "",
            eventLocation: payload.event_location ?? "",
            eventDate: payload.event_date ?? "",
            quantity: payload.quantity != null ? String(payload.quantity) : "",
            currentMessage,
          }),
        });
        const body = (await res.json()) as { draft?: string; error?: string };
        if (!res.ok) {
          setError(body.error ?? `HTTP ${res.status}`);
          return;
        }
        if (body.draft) setOutput(body.draft);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Request failed");
      } finally {
        setBusy(null);
      }
    },
    [payload, readBriefFromDom],
  );

  if (!isInquiryDetail(ctx) || !id) return null;
  if (!payload) return <p className="text-xs text-[var(--admin-nav-idle)]">Loading draft context…</p>;

  return (
    <AIInlineAssistant>
      <div className="flex flex-wrap gap-2">
        <AIActionButton type="button" disabled={busy !== null} onClick={() => void run("generate")}>
          {busy === "generate" ? "Generating…" : "Generate brief"}
        </AIActionButton>
        <AIActionButton type="button" disabled={busy !== null} onClick={() => void run("polish")}>
          {busy === "polish" ? "Polishing…" : "Polish brief"}
        </AIActionButton>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[11px] text-[var(--admin-nav-idle)]">
        Uses <code className="rounded bg-[var(--admin-code-bg)] px-1">POST /api/ai/inquiry-draft</code>. Paste into
        Brief / notes on the page when you are happy with the text.
      </p>
      {output ? (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--admin-gold-muted)]">
            Draft output
          </label>
          <Textarea value={output} readOnly rows={6} className="resize-y text-xs" />
        </div>
      ) : null}
    </AIInlineAssistant>
  );
}

export function InquiriesWorkspaceListLinkModule({ ctx }: { ctx: InspectorContext }) {
  if (!isInquiryDetail(ctx)) return null;
  return (
    <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
      <Link href="/admin/inquiries" scroll={false}>
        Back to inquiries
      </Link>
    </Button>
  );
}

export function InquiryDetailNextStepModule({ ctx }: { ctx: InspectorContext }) {
  const id = inquiryDetailId(ctx);
  const [status, setStatus] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetch(`/api/admin/inspector/inquiry?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = (await r.json()) as { status?: string; error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j.status ?? null;
      })
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!isInquiryDetail(ctx) || !id) return null;
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!status) return <p className="text-xs text-[var(--admin-nav-idle)]">Loading…</p>;

  const hint = NEXT_BY_STATUS[status] ?? "Advance the inquiry based on client feedback and internal review.";
  return <p className="text-xs leading-relaxed text-[var(--admin-nav-idle)]">{hint}</p>;
}
