"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { AdminUserEditButton } from "@/app/(dashboard)/admin/users/admin-user-edit-button";
import { adminQuickSetAccountStatus } from "@/app/(dashboard)/admin/users/actions";
import type {
  GlobalUserSearchResponse,
  GlobalUserSearchResult,
} from "@/lib/admin/global-user-search-types";
import { getSiteUrl } from "@/lib/auth-flow";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ADMIN_OUTLINE_CONTROL_CLASS,
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_ROW_INTERACTIVE,
  ADMIN_TABLE_TH,
  ADMIN_TABLE_WRAP,
  LUXURY_GOLD_BUTTON_CLASS,
} from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const ROLE_OPTS = [
  { value: "all", label: "All roles" },
  { value: "talent", label: "Talent" },
  { value: "client", label: "Client" },
  { value: "admin", label: "Admin" },
] as const;

const STATUS_OPTS = [
  { value: "all", label: "Any status" },
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "suspended", label: "Suspended" },
] as const;

const PROFILE_OPTS = [
  { value: "all", label: "Any profile" },
  { value: "complete", label: "Complete" },
  { value: "incomplete", label: "Incomplete" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
] as const;

function initials(name: string | null) {
  const n = (name ?? "").trim();
  if (!n) return "?";
  const parts = n.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
  return n.slice(0, 2).toUpperCase();
}

function profileHref(r: GlobalUserSearchResult) {
  if (r.kind === "talent" && r.profileCode) {
    return `${getSiteUrl()}/t/${r.profileCode}?preview=1`;
  }
  return null;
}

export function AdminGlobalUserSearchClient({
  talentTypes,
}: {
  talentTypes: Array<{ id: string; name_en: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const qFromUrl = searchParams.get("q")?.trim() ?? "";
  const [pending, startTransition] = useTransition();
  const [q, setQ] = useState(qFromUrl);
  const [role, setRole] = useState<(typeof ROLE_OPTS)[number]["value"]>("all");
  const [status, setStatus] = useState<(typeof STATUS_OPTS)[number]["value"]>("all");
  const [profile, setProfile] = useState<(typeof PROFILE_OPTS)[number]["value"]>("all");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState("");
  const [talentType, setTalentType] = useState("");
  const [remote, setRemote] = useState<GlobalUserSearchResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const queryString = useMemo(() => {
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (role !== "all") sp.set("role", role);
    if (status !== "all") sp.set("status", status);
    if (profile !== "all") sp.set("profile", profile);
    if (city.trim()) sp.set("city", city.trim());
    if (country.trim()) sp.set("country", country.trim());
    if (talentType) sp.set("talent_type", talentType);
    return sp.toString();
  }, [q, role, status, profile, city, country, talentType]);

  const canSearch = useMemo(() => {
    if (q.trim().length > 0) return true;
    if (city.trim() || country.trim() || talentType) return true;
    if (status !== "all" || profile !== "all") return true;
    return false;
  }, [q, city, country, talentType, status, profile]);

  useEffect(() => {
    setQ(qFromUrl);
  }, [qFromUrl]);

  useEffect(() => {
    if (!canSearch) {
      setRemote(null);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/admin/users/global-search?${queryString}`, {
        signal: controller.signal,
      })
        .then(async (r) => {
          if (!r.ok) {
            setRemote({ results: [], truncated: false });
            return;
          }
          const data = (await r.json()) as GlobalUserSearchResponse | { error?: string };
          if ("error" in data && data.error) {
            setRemote({ results: [], truncated: false });
            return;
          }
          setRemote(data as GlobalUserSearchResponse);
        })
        .catch((err: unknown) => {
          if (err instanceof Error && err.name === "AbortError") return;
          setRemote({ results: [], truncated: false });
        })
        .finally(() => setLoading(false));
    }, 280);
    return () => {
      window.clearTimeout(t);
      controller.abort();
    };
  }, [canSearch, queryString]);

  const suspend = (userId: string | null) => {
    if (!userId) {
      toast.error("No linked login for this row.");
      return;
    }
    startTransition(async () => {
      const res = await adminQuickSetAccountStatus(userId, "suspended");
      if (res.error) toast.error(res.error);
      else {
        toast.success("Account suspended.");
        router.refresh();
        setLoading(true);
        fetch(`/api/admin/users/global-search?${queryString}`)
          .then(async (r) => {
            if (!r.ok) return;
            const data = (await r.json()) as GlobalUserSearchResponse;
            setRemote(data);
          })
          .finally(() => setLoading(false));
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-border/45 bg-card/40 p-4 shadow-sm sm:p-6">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, profile code, phone, company…"
            className={cn(
              "h-14 rounded-2xl border-border/55 bg-background/90 pl-12 pr-4 text-base shadow-sm",
              "placeholder:text-muted-foreground/70",
              "focus-visible:border-[var(--impronta-gold)]/45 focus-visible:ring-[var(--impronta-gold)]/20",
            )}
            aria-label="Search users"
          />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Client email matches use inquiry records when the address is tied to a registered client.
        </p>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Role
            </Label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as typeof role)}
              className={cn(
                "h-10 w-full rounded-xl border border-border/55 bg-background/90 px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
              )}
            >
              {ROLE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Account status
            </Label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as typeof status)}
              className={cn(
                "h-10 w-full rounded-xl border border-border/55 bg-background/90 px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
              )}
            >
              {STATUS_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Talent profile
            </Label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value as typeof profile)}
              className={cn(
                "h-10 w-full rounded-xl border border-border/55 bg-background/90 px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
              )}
            >
              {PROFILE_OPTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              City (talent)
            </Label>
            <Input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Contains…"
              className="h-10 rounded-xl border-border/55 bg-background/90"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Country (talent)
            </Label>
            <Input
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="Name or ISO2…"
              className="h-10 rounded-xl border-border/55 bg-background/90"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Talent type
            </Label>
            <select
              value={talentType}
              onChange={(e) => setTalentType(e.target.value)}
              className={cn(
                "h-10 w-full rounded-xl border border-border/55 bg-background/90 px-3 text-sm shadow-sm",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/35",
              )}
            >
              <option value="">Any type</option>
              {talentTypes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name_en}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        {loading ? (
          <span className="inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" aria-hidden />
            Searching…
          </span>
        ) : remote ? (
          <span className="tabular-nums">
            {remote.results.length} result{remote.results.length === 1 ? "" : "s"}
            {remote.truncated ? " (list truncated — refine filters)" : ""}
          </span>
        ) : (
          <span>Type a query or choose filters to search.</span>
        )}
      </div>

      {remote && remote.results.length === 0 && canSearch && !loading ? (
        <p className="rounded-2xl border border-dashed border-border/55 bg-muted/[0.04] px-4 py-10 text-center text-sm text-muted-foreground">
          No users match these criteria.
        </p>
      ) : null}

      {remote && remote.results.length > 0 ? (
        <div className={ADMIN_TABLE_WRAP}>
          <table className="w-full border-collapse text-sm">
            <thead className={ADMIN_TABLE_HEAD}>
              <tr className="border-b border-border/45 text-left">
                <th className={ADMIN_TABLE_TH}>User</th>
                <th className={cn("hidden md:table-cell", ADMIN_TABLE_TH)}>Role</th>
                <th className={cn("hidden lg:table-cell", ADMIN_TABLE_TH)}>Location</th>
                <th className={ADMIN_TABLE_TH}>Status</th>
                <th className={ADMIN_TABLE_TH}>Quick actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/25">
              {remote.results.map((r) => (
                <tr key={r.key} className={ADMIN_TABLE_ROW_INTERACTIVE}>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          "flex size-10 shrink-0 items-center justify-center rounded-full",
                          "bg-[var(--impronta-gold)]/14 text-xs font-bold text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/25",
                        )}
                        aria-hidden
                      >
                        {initials(r.displayName)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-display text-[15px] font-medium text-foreground">
                          {r.displayName ?? "Unnamed"}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.kind === "talent" && r.profileCode ? (
                            <span className="font-mono">{r.profileCode}</span>
                          ) : (
                            (r.subtitle ?? r.roleLabel)
                          )}
                          {r.talentTypeLabel ? (
                            <span className="text-muted-foreground"> · {r.talentTypeLabel}</span>
                          ) : null}
                          {r.kind === "talent" && r.completeness != null ? (
                            <span className="tabular-nums">
                              {" "}
                              · {Math.round(r.completeness)}% complete
                            </span>
                          ) : null}
                          {r.kind === "talent" && r.pendingMediaCount > 0 ? (
                            <span> · {r.pendingMediaCount} pending media</span>
                          ) : null}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3.5 md:table-cell">
                    <span className="text-muted-foreground">{r.roleLabel}</span>
                  </td>
                  <td className="hidden px-4 py-3.5 text-muted-foreground lg:table-cell">
                    {[r.city, r.country].filter(Boolean).join(", ") || "—"}
                  </td>
                  <td className="px-4 py-3.5 text-xs capitalize text-muted-foreground">
                    {r.statusLabel}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex max-w-[320px] flex-wrap gap-1.5">
                      {r.kind === "talent" ? (
                        <Button size="sm" className={cn("h-8 rounded-lg px-2.5 text-xs", LUXURY_GOLD_BUTTON_CLASS)} asChild>
                          <Link href={`/admin/talent/${r.id}`} scroll={false}>
                            Open
                          </Link>
                        </Button>
                      ) : r.kind === "client" ? (
                        <Button size="sm" className={cn("h-8 rounded-lg px-2.5 text-xs", LUXURY_GOLD_BUTTON_CLASS)} asChild>
                          <Link href={`/admin/clients/${r.userId}`} scroll={false}>
                            Open
                          </Link>
                        </Button>
                      ) : (
                        <Button size="sm" variant="outline" className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
                          <Link href="/admin/users/admins" scroll={false}>
                            Staff list
                          </Link>
                        </Button>
                      )}
                      {profileHref(r) ? (
                        <Button size="sm" variant="outline" className={cn("h-8 gap-1 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
                          <a href={profileHref(r)!} target="_blank" rel="noreferrer">
                            Preview
                            <ExternalLink className="size-3.5 opacity-70" aria-hidden />
                          </a>
                        </Button>
                      ) : null}
                      {r.userId ? (
                        <AdminUserEditButton
                          userId={r.userId}
                          talentProfile={
                            r.kind === "talent" && r.profileCode
                              ? {
                                  id: r.talentProfileId!,
                                  profile_code: r.profileCode,
                                  display_name: r.displayName,
                                }
                              : undefined
                          }
                          urlSync={{ pathname: "/admin/users/search" }}
                        />
                      ) : null}
                      {r.kind === "talent" && r.userId ? (
                        <Button size="sm" variant="outline" className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
                          <Link href={`/admin/talent/${r.id}`} scroll={false}>
                            Submissions
                          </Link>
                        </Button>
                      ) : null}
                      {r.userId && r.accountStatus !== "suspended" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={pending}
                          className={cn("h-8 rounded-lg px-2.5 text-xs text-destructive hover:text-destructive", ADMIN_OUTLINE_CONTROL_CLASS)}
                          onClick={() => suspend(r.userId)}
                        >
                          Suspend
                        </Button>
                      ) : null}
                      {r.kind === "client" && r.userId ? (
                        <Button size="sm" variant="outline" className={cn("h-8 rounded-lg px-2.5 text-xs", ADMIN_OUTLINE_CONTROL_CLASS)} asChild>
                          <Link href="/admin/inquiries" scroll={false}>
                            Inquiries
                          </Link>
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
