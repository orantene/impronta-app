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
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

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

type Translate = (key: string) => string;

function filterLines(ctx: InspectorContext, t: Translate): string[] {
  const sp = ctx.searchParams;
  const lines: string[] = [];
  const status = sp.get("status");
  if (status && status !== "all") {
    lines.push(
      interpolate(t("dashboard.adminInquiriesInspector.filterStatus"), {
        status: status.replace(/_/g, " "),
      }),
    );
  }
  if (sp.get("q")?.trim()) {
    lines.push(
      interpolate(t("dashboard.adminInquiriesInspector.filterSearch"), {
        query: sp.get("q")!.trim(),
      }),
    );
  }
  if (sp.get("client_account_id")) lines.push(t("dashboard.adminInquiriesInspector.filterClientAccount"));
  if (sp.get("client_user_id")) lines.push(t("dashboard.adminInquiriesInspector.filterPlatformClient"));
  if (sp.get("assigned_staff_id")) lines.push(t("dashboard.adminInquiriesInspector.filterAssignee"));
  if (sp.get("created_from") || sp.get("created_to")) lines.push(t("dashboard.adminInquiriesInspector.filterCreatedRange"));
  return lines;
}

const NEXT_STATUS_KEY_BY_STATUS: Record<string, string> = {
  new: "new",
  reviewing: "reviewing",
  in_progress: "inProgress",
  waiting_for_client: "waitingForClient",
  talent_suggested: "talentSuggested",
  converted: "converted",
  closed: "closed",
  archived: "archived",
};

function nextStepHint(status: string | null | undefined, t: Translate): string | null {
  if (!status) return null;
  const key = NEXT_STATUS_KEY_BY_STATUS[status];
  if (!key) return null;
  return t(`dashboard.adminInquiriesInspector.nextStep.${key}`);
}

export function InquiriesFiltersModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
  if (!isInquiriesList(ctx)) return null;
  const lines = filterLines(ctx, t);
  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      {lines.length ? (
        <ul className="list-inside list-disc space-y-1">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p>{t("dashboard.adminInquiriesInspector.noFilters")}</p>
      )}
    </div>
  );
}

export function InquiriesNextStepModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
  if (!isInquiriesList(ctx)) return null;
  const st = ctx.searchParams.get("status") ?? "all";
  const hint =
    (st !== "all" ? nextStepHint(st, t) : null) ?? nextStepHint("new", t)!;
  return <p className="text-xs leading-relaxed text-[var(--admin-nav-idle)]">{hint}</p>;
}

export function InquiriesDraftShortcutModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
  if (!isInquiriesList(ctx)) return null;
  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      <p>
        {t("dashboard.adminInquiriesInspector.draftShortcutBefore")}{" "}
        <span className="text-[var(--admin-workspace-fg)]">
          {t("dashboard.adminInquiriesInspector.draftShortcutSurface")}
        </span>{" "}
        {t("dashboard.adminInquiriesInspector.draftShortcutAfter")}
      </p>
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/settings" scroll={false}>
          {t("dashboard.adminInquiriesInspector.featureFlags")}
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
  const t = useT();
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
  if (loading) return <p className="text-xs text-[var(--admin-nav-idle)]">{t("dashboard.adminInquiriesInspector.loadingInquiry")}</p>;
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!data) return null;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <AdminCommercialStatusBadge kind="inquiry" status={data.status} />
        <span className="text-[var(--admin-nav-idle)]">
          {interpolate(
            t(
              data.talent_names.length === 1
                ? "dashboard.adminInquiriesInspector.talentCount.one"
                : "dashboard.adminInquiriesInspector.talentCount.other",
            ),
            { count: data.talent_names.length },
          )}
          {" · "}
          {interpolate(
            t(
              data.linked_booking_count === 1
                ? "dashboard.adminInquiriesInspector.bookingCount.one"
                : "dashboard.adminInquiriesInspector.bookingCount.other",
            ),
            { count: data.linked_booking_count },
          )}
        </span>
      </div>
      <p className="font-medium text-[var(--admin-workspace-fg)]">{data.contact_name}</p>
      <p className="text-[var(--admin-nav-idle)]">{data.contact_email}</p>
      {data.company ? <p className="text-[var(--admin-nav-idle)]">{data.company}</p> : null}
      <Button asChild size="sm" variant="secondary" className="h-8 rounded-lg text-xs">
        <Link href={`/admin/inquiries/${data.id}`} scroll={false}>
          {t("dashboard.adminInquiriesInspector.openWorkspace")}
        </Link>
      </Button>
    </div>
  );
}

export function InquiryDetailSummaryModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
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
  if (!data) return <p className="text-xs text-[var(--admin-nav-idle)]">{t("dashboard.adminInquiriesInspector.loadingSummary")}</p>;

  return (
    <dl className="grid gap-2 text-xs text-[var(--admin-nav-idle)]">
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">{t("dashboard.adminInquiriesInspector.labelEvent")}</dt>
        <dd>{data.event_location ?? "—"}</dd>
      </div>
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">{t("dashboard.adminInquiriesInspector.labelDateQty")}</dt>
        <dd>
          {data.event_date ?? "—"} · {data.quantity != null ? `${data.quantity}` : "—"}
        </dd>
      </div>
      {data.client_account_name ? (
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">{t("dashboard.adminInquiriesInspector.labelAccount")}</dt>
          <dd>{data.client_account_name}</dd>
        </div>
      ) : null}
      <div>
        <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">{t("dashboard.adminInquiriesInspector.labelShortlist")}</dt>
        <dd>{data.talent_names.length ? data.talent_names.join(", ") : t("dashboard.adminInquiriesInspector.shortlistNoneYet")}</dd>
      </div>
    </dl>
  );
}

export function InquiryDetailDraftModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
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
        setError(t("dashboard.adminInquiriesInspector.polishNeedsText"));
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
        setError(e instanceof Error ? e.message : t("dashboard.adminInquiriesInspector.requestFailed"));
      } finally {
        setBusy(null);
      }
    },
    [payload, readBriefFromDom, t],
  );

  if (!isInquiryDetail(ctx) || !id) return null;
  if (!payload) return <p className="text-xs text-[var(--admin-nav-idle)]">{t("dashboard.adminInquiriesInspector.loadingDraftContext")}</p>;

  return (
    <AIInlineAssistant>
      <div className="flex flex-wrap gap-2">
        <AIActionButton type="button" disabled={busy !== null} onClick={() => void run("generate")}>
          {busy === "generate"
            ? t("dashboard.adminInquiriesInspector.generating")
            : t("dashboard.adminInquiriesInspector.generateBrief")}
        </AIActionButton>
        <AIActionButton type="button" disabled={busy !== null} onClick={() => void run("polish")}>
          {busy === "polish"
            ? t("dashboard.adminInquiriesInspector.polishing")
            : t("dashboard.adminInquiriesInspector.polishBrief")}
        </AIActionButton>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
      <p className="text-[11px] text-[var(--admin-nav-idle)]">
        {t("dashboard.adminInquiriesInspector.draftEndpointBefore")}{" "}
        <code className="rounded bg-[var(--admin-code-bg)] px-1">POST /api/ai/inquiry-draft</code>
        {t("dashboard.adminInquiriesInspector.draftEndpointAfter")}
      </p>
      {output ? (
        <div className="space-y-1">
          <label className="text-[10px] font-medium uppercase tracking-wide text-[var(--admin-gold-muted)]">
            {t("dashboard.adminInquiriesInspector.draftOutput")}
          </label>
          <Textarea value={output} readOnly rows={6} className="resize-y text-xs" />
        </div>
      ) : null}
    </AIInlineAssistant>
  );
}

export function InquiriesWorkspaceListLinkModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
  if (!isInquiryDetail(ctx)) return null;
  return (
    <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
      <Link href="/admin/inquiries" scroll={false}>
        {t("dashboard.adminInquiriesInspector.backToInquiries")}
      </Link>
    </Button>
  );
}

export function InquiryDetailNextStepModule({ ctx }: { ctx: InspectorContext }) {
  const t = useT();
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
  if (!status) return <p className="text-xs text-[var(--admin-nav-idle)]">{t("dashboard.adminInquiriesInspector.loading")}</p>;

  const hint = nextStepHint(status, t) ?? t("dashboard.adminInquiriesInspector.nextStepFallback");
  return <p className="text-xs leading-relaxed text-[var(--admin-nav-idle)]">{hint}</p>;
}
