"use client";

import { useEffect, useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import {
  checkTalentSiteDomainProvisioningAction,
  connectTalentSiteDomainAction,
  loadTalentSiteDomainsForPanel,
  removeTalentSiteDomainAction,
  setPrimaryTalentSiteDomainAction,
  verifyTalentSiteDomainAction,
  type TalentSiteDomainActionResult,
  type TalentSiteDomainView,
} from "@/lib/talent-site/server/talent-site-domain-actions";

/**
 * TalentSiteDomainPanel — SELF-CONTAINED custom-domain manager for the talent
 * Max site. Also embedded inside Domain setup drawer (`embedded`).
 *
 * Mirrors the agency domain settings UI: connect a domain, surface the DNS
 * records to add (A/CNAME + TXT), verify, check routing/SSL, set-primary, and
 * remove. All writes go through the Max + owner-gated server actions in
 * `lib/talent-site/server/talent-site-domain-actions.ts`; this component holds
 * no secrets and resolves the talent from the session server-side.
 *
 * Props:
 *   - `initialDomains` — optional SSR-hydrated rows (skip the first load).
 *   - `canManage`      — optional gate hint; when false the panel renders an
 *                        upgrade nudge instead of the editor. The server action
 *                        re-checks Max regardless, so this is UX-only.
 *   - `embedded`       — when true (drawer), drop outer card chrome / title so
 *                        Domain setup owns the hierarchy.
 */

type Copy = { t: (s: string) => string };

type Props = {
  initialDomains?: TalentSiteDomainView[];
  canManage?: boolean;
  /** Soften chrome when mounted inside Domain setup drawer. */
  embedded?: boolean;
};

export function TalentSiteDomainPanel({
  initialDomains,
  canManage = true,
  embedded = false,
}: Props) {
  const copy = useDashboardText();
  const [domains, setDomains] = useState<TalentSiteDomainView[]>(initialDomains ?? []);
  const [hostnameInput, setHostnameInput] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(Boolean(initialDomains));
  const [pending, startTransition] = useTransition();

  // Self-hydrate when no SSR rows were provided.
  useEffect(() => {
    if (initialDomains) return;
    let cancelled = false;
    void (async () => {
      const result = await loadTalentSiteDomainsForPanel();
      if (cancelled) return;
      if (result.ok) setDomains(result.domains);
      else if (result.domains) setDomains(result.domains);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialDomains]);

  function applyResult(result: TalentSiteDomainActionResult) {
    if (result.ok) {
      setMessage(result.message || null);
      setError(null);
      setDomains(result.domains);
    } else {
      setError(copy.t(result.error));
      setMessage(null);
      if (result.domains) setDomains(result.domains);
    }
  }

  function run(action: () => Promise<TalentSiteDomainActionResult>) {
    startTransition(async () => {
      setMessage(null);
      setError(null);
      applyResult(await action());
    });
  }

  function connect() {
    const value = hostnameInput.trim();
    if (!value) {
      setError(copy.t("Enter a domain to continue."));
      return;
    }
    run(async () => {
      const result = await connectTalentSiteDomainAction(value);
      if (result.ok) setHostnameInput("");
      return result;
    });
  }

  if (!canManage) {
    return (
      <Card embedded={embedded}>
        {embedded ? null : <Header copy={copy} />}
        <p
          style={{
            margin: embedded ? 0 : "10px 0 0",
            fontSize: 12.5,
            color: COLORS.inkMuted,
            lineHeight: 1.5,
          }}
        >
          {copy.t(
            "Connecting your own domain is a Web Office feature. Upgrade to Web Office to point a custom domain at your site.",
          )}
        </p>
      </Card>
    );
  }

  return (
    <Card embedded={embedded}>
      {embedded ? null : <Header copy={copy} />}

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: embedded ? 0 : 14,
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <input
          value={hostnameInput}
          onChange={(e) => setHostnameInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              connect();
            }
          }}
          placeholder="yourname.com"
          spellCheck={false}
          autoCapitalize="none"
          autoCorrect="off"
          disabled={pending}
          style={{
            flex: "1 1 220px",
            minWidth: 0,
            padding: "9px 12px",
            fontSize: 13,
            fontFamily: FONTS.body,
            color: COLORS.ink,
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
          }}
        />
        <PrimaryButton onClick={connect} disabled={pending}>
          {copy.t("Connect domain")}
        </PrimaryButton>
      </div>

      {message ? (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: COLORS.successDeep, lineHeight: 1.5 }}>
          {message}
        </p>
      ) : null}
      {error ? (
        <p style={{ margin: "12px 0 0", fontSize: 12.5, color: COLORS.criticalDeep, lineHeight: 1.5 }}>
          {error}
        </p>
      ) : null}

      <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
        {!loaded ? (
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted }}>{copy.t("Loading domains…")}</p>
        ) : domains.length === 0 ? (
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            {copy.t(
              "No custom domain yet. Add one above to serve your site from your own address. We will show the DNS records to add.",
            )}
          </p>
        ) : (
          domains.map((d) => (
            <DomainRow
              key={d.domain}
              domain={d}
              pending={pending}
              copy={copy}
              onVerify={() => run(() => verifyTalentSiteDomainAction(d.domain))}
              onCheck={() => run(() => checkTalentSiteDomainProvisioningAction(d.domain))}
              onSetPrimary={() => run(() => setPrimaryTalentSiteDomainAction(d.domain))}
              onRemove={() => run(() => removeTalentSiteDomainAction(d.domain))}
            />
          ))
        )}
      </div>
    </Card>
  );
}

function Header({ copy }: { copy: Copy }) {
  return (
    <div>
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: COLORS.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.4,
        }}
      >
        {copy.t("Custom domain")}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, marginTop: 4 }}>
        {copy.t("Serve your site from your own domain")}
      </div>
    </div>
  );
}

function Card({
  children,
  embedded,
}: {
  children: React.ReactNode;
  embedded?: boolean;
}) {
  if (embedded) {
    return (
      <div style={{ padding: 0, background: "transparent", border: "none", fontFamily: FONTS.body }}>
        {children}
      </div>
    );
  }
  return (
    <div
      style={{
        padding: "14px 16px",
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 14,
        fontFamily: FONTS.body,
      }}
    >
      {children}
    </div>
  );
}

function statusMeta(
  status: TalentSiteDomainView["status"],
  copy: Copy,
): { label: string; fg: string; bg: string } {
  switch (status) {
    case "pending":
      return { label: copy.t("Pending"), fg: COLORS.amberDeep, bg: COLORS.amberSoft };
    case "dns_verification_sent":
      return { label: copy.t("Awaiting TXT"), fg: COLORS.amberDeep, bg: COLORS.amberSoft };
    case "verified":
      return { label: copy.t("Verified"), fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
    case "ssl_provisioned":
      return { label: copy.t("Provisioning SSL"), fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
    case "active":
      return { label: copy.t("Live"), fg: COLORS.successDeep, bg: COLORS.successSoft };
    case "error":
      return { label: copy.t("Needs attention"), fg: COLORS.criticalDeep, bg: COLORS.criticalSoft };
  }
}

function DomainRow({
  domain,
  pending,
  copy,
  onVerify,
  onCheck,
  onSetPrimary,
  onRemove,
}: {
  domain: TalentSiteDomainView;
  pending: boolean;
  copy: Copy;
  onVerify: () => void;
  onCheck: () => void;
  onSetPrimary: () => void;
  onRemove: () => void;
}) {
  const meta = statusMeta(domain.status, copy);
  const purchased = domain.acquisition === "purchased";
  // Purchased (Vercel DNS) never asks the talent for TXT / routing records.
  const needsTxt =
    !purchased &&
    (domain.status === "pending" || domain.status === "dns_verification_sent");
  const needsRouting =
    !purchased &&
    (domain.status === "verified" || domain.status === "ssl_provisioned");

  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        background: COLORS.card,
        padding: 12,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: COLORS.ink }}>
            {domain.domain}
          </span>
          {domain.isPrimary ? (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: COLORS.accent,
                background: COLORS.accentSoft,
                padding: "2px 7px",
                borderRadius: 999,
                textTransform: "uppercase",
                letterSpacing: 0.3,
              }}
            >
              {copy.t("Primary")}
            </span>
          ) : null}
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: meta.fg,
              background: meta.bg,
              padding: "2px 7px",
              borderRadius: 999,
              textTransform: "uppercase",
              letterSpacing: 0.3,
            }}
          >
            {meta.label}
          </span>
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {needsTxt ? (
            <SecondaryButton onClick={onVerify} disabled={pending}>
              {copy.t("Verify")}
            </SecondaryButton>
          ) : null}
          {needsRouting ? (
            <SecondaryButton onClick={onCheck} disabled={pending}>
              {copy.t("Check routing")}
            </SecondaryButton>
          ) : null}
          {domain.canBecomePrimary ? (
            <SecondaryButton onClick={onSetPrimary} disabled={pending}>
              {copy.t("Make primary")}
            </SecondaryButton>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            disabled={pending}
            style={{
              fontSize: 12,
              fontFamily: FONTS.body,
              color: COLORS.criticalDeep,
              background: "transparent",
              border: "none",
              cursor: pending ? "not-allowed" : "pointer",
              padding: "7px 6px",
            }}
          >
            {copy.t("Remove")}
          </button>
        </div>
      </div>

      {domain.failureReason ? (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
          {domain.failureReason}
        </p>
      ) : null}

      {purchased && domain.status === "active" ? (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
          {copy.t("Bought through Tulala. No DNS setup needed.")}
        </p>
      ) : null}

      {needsTxt && domain.txtRecord ? (
        <DnsBlock
          title={copy.t("1. Add this TXT record to prove you own the domain")}
          rows={[
            { type: "TXT", host: domain.txtRecord.host, value: domain.txtRecord.value },
          ]}
        />
      ) : null}

      {(needsTxt || needsRouting) && domain.routingRecords.length > 0 ? (
        <DnsBlock
          title={
            needsTxt
              ? copy.t("2. Then point the domain at Vercel")
              : copy.t("Point the domain at Vercel")
          }
          rows={domain.routingRecords.map((r) => ({
            type: r.type,
            host: r.host,
            value: r.value,
          }))}
        />
      ) : null}
    </div>
  );
}

function DnsBlock({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ type: string; host: string; value: string }>;
}) {
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 600, color: COLORS.inkMuted, marginBottom: 6 }}>
        {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {rows.map((r, i) => (
          <div
            key={`${r.type}-${r.host}-${i}`}
            style={{
              display: "grid",
              gridTemplateColumns: "56px 1fr",
              gap: 8,
              alignItems: "start",
              fontSize: 11.5,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              background: COLORS.surfaceAlt,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
              padding: "8px 10px",
            }}
          >
            <span style={{ fontWeight: 700, color: COLORS.ink }}>{r.type}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: COLORS.inkMuted, wordBreak: "break-all" }}>
                <span style={{ color: COLORS.inkDim }}>host </span>
                {r.host}
              </div>
              <div style={{ color: COLORS.ink, wordBreak: "break-all", marginTop: 2 }}>
                <span style={{ color: COLORS.inkDim }}>value </span>
                {r.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
