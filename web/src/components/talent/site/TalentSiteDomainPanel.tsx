"use client";

import { useEffect, useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { PrimaryButton, SecondaryButton } from "@/components/admin/shell/internal/primitives";
import { InfoTip } from "@/components/ui/info-tip";
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
 * Connect → copy-paste DNS cards with live status → one primary action per
 * state (Verify / Check connection / Make primary). Plain language; (i) tips
 * for jargon. D2 may later add more challenge rows to the view — this panel
 * already maps every txt + routing record into the same card shape.
 */

type Copy = { t: (s: string) => string };

type Props = {
  initialDomains?: TalentSiteDomainView[];
  canManage?: boolean;
  /** Soften chrome when mounted inside Domain setup drawer. */
  embedded?: boolean;
  /** Primary connect CTA label (drawer uses "Connect mine"). */
  connectLabel?: string;
};

type DnsLiveStatus = "waiting" | "checking" | "done";

export function TalentSiteDomainPanel({
  initialDomains,
  canManage = true,
  embedded = false,
  connectLabel,
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
          placeholder={copy.t("yourname.com")}
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
        {domains.some(
          (d) =>
            d.status === "pending" ||
            d.status === "dns_verification_sent" ||
            d.status === "verified" ||
            d.status === "ssl_provisioned" ||
            d.canBecomePrimary,
        ) ? (
          <SecondaryButton onClick={connect} disabled={pending}>
            {connectLabel ?? copy.t("Connect mine")}
          </SecondaryButton>
        ) : (
          <PrimaryButton onClick={connect} disabled={pending}>
            {connectLabel ?? copy.t("Connect mine")}
          </PrimaryButton>
        )}
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
            {copy.t("No custom domain yet. Add yours above and we will show the DNS steps.")}
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
      return { label: copy.t("Waiting on DNS"), fg: COLORS.amberDeep, bg: COLORS.amberSoft };
    case "verified":
      return { label: copy.t("Verified"), fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
    case "ssl_provisioned":
      return { label: copy.t("Finishing secure link"), fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
    case "active":
      return { label: copy.t("Live"), fg: COLORS.successDeep, bg: COLORS.successSoft };
    case "error":
      return { label: copy.t("Needs attention"), fg: COLORS.criticalDeep, bg: COLORS.criticalSoft };
  }
}

function liveStatusFor(
  domain: TalentSiteDomainView,
  kind: "txt" | "routing",
): DnsLiveStatus {
  if (kind === "txt") {
    if (domain.status === "pending" || domain.status === "dns_verification_sent") return "waiting";
    if (domain.status === "error") return "waiting";
    return "done";
  }
  if (domain.status === "active") return "done";
  if (domain.status === "ssl_provisioned") return "checking";
  if (domain.status === "verified") return "waiting";
  return "waiting";
}

function liveLabel(status: DnsLiveStatus, copy: Copy): { text: string; fg: string; bg: string } {
  switch (status) {
    case "done":
      return { text: copy.t("Done"), fg: COLORS.successDeep, bg: COLORS.successSoft };
    case "checking":
      return { text: copy.t("Checking…"), fg: COLORS.indigoDeep, bg: COLORS.indigoSoft };
    default:
      return { text: copy.t("Waiting"), fg: COLORS.amberDeep, bg: COLORS.amberSoft };
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
  const needsTxt =
    domain.status === "pending" || domain.status === "dns_verification_sent";
  const needsRouting =
    domain.status === "verified" || domain.status === "ssl_provisioned";

  const dnsRows: Array<{
    key: string;
    type: string;
    name: string;
    value: string;
    live: DnsLiveStatus;
    tip: string;
  }> = [];

  if (needsTxt && domain.txtRecord) {
    dnsRows.push({
      key: "txt",
      type: "TXT",
      name: domain.txtRecord.host,
      value: domain.txtRecord.value,
      live: liveStatusFor(domain, "txt"),
      tip: copy.t("This record proves you own the domain. Add it where you manage DNS."),
    });
  }

  if ((needsTxt || needsRouting) && domain.routingRecords.length > 0) {
    for (const [i, r] of domain.routingRecords.entries()) {
      dnsRows.push({
        key: `route-${r.type}-${i}`,
        type: r.type,
        name: r.host,
        value: r.value,
        live: liveStatusFor(domain, "routing"),
        tip:
          r.type === "CNAME"
            ? copy.t("Points a subdomain (like www) to your Tulala site.")
            : copy.t("Points your domain to the address that serves your site."),
      });
    }
  }

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

      {domain.failureReason ? (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: COLORS.criticalDeep, lineHeight: 1.45 }}>
          {copy.t(domain.failureReason)}
        </p>
      ) : null}

      {dnsRows.length > 0 ? (
        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ fontSize: 12, fontWeight: 650, color: COLORS.ink }}>
              {copy.t("DNS steps")}
            </span>
            <InfoTip
              label={copy.t("Copy each row into the DNS settings of the place where you bought the domain.")}
              triggerLabel={copy.t("More info")}
              className="text-admin-ink-dim hover:text-admin-ink"
            />
          </div>
          {dnsRows.map((row) => (
            <DnsCopyCard key={row.key} row={row} copy={copy} />
          ))}
        </div>
      ) : null}

      <div style={{ marginTop: 12, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {needsTxt ? (
          <PrimaryButton onClick={onVerify} disabled={pending}>
            {copy.t("I added the records · Verify")}
          </PrimaryButton>
        ) : null}
        {needsRouting ? (
          <PrimaryButton onClick={onCheck} disabled={pending}>
            {copy.t("Check connection")}
          </PrimaryButton>
        ) : null}
        {domain.canBecomePrimary ? (
          <PrimaryButton onClick={onSetPrimary} disabled={pending}>
            {copy.t("Make primary")}
          </PrimaryButton>
        ) : null}
        {domain.status === "active" && !domain.canBecomePrimary ? (
          <SecondaryButton onClick={onCheck} disabled={pending}>
            {copy.t("Recheck")}
          </SecondaryButton>
        ) : null}
      </div>
    </div>
  );
}

function DnsCopyCard({
  row,
  copy,
}: {
  row: {
    type: string;
    name: string;
    value: string;
    live: DnsLiveStatus;
    tip: string;
  };
  copy: Copy;
}) {
  const live = liveLabel(row.live, copy);
  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        background: COLORS.surfaceAlt,
        padding: "10px 12px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
          marginBottom: 8,
          flexWrap: "wrap",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              color: COLORS.ink,
              background: COLORS.card,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 6,
              padding: "2px 7px",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            }}
          >
            {row.type}
          </span>
          <InfoTip
            label={row.tip}
            triggerLabel={copy.t("More info")}
            className="text-admin-ink-dim hover:text-admin-ink"
          />
        </div>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: live.fg,
            background: live.bg,
            padding: "2px 7px",
            borderRadius: 999,
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          {live.text}
        </span>
      </div>
      <CopyField label={copy.t("Name")} value={row.name} copy={copy} />
      <div style={{ height: 6 }} />
      <CopyField label={copy.t("Value")} value={row.value} copy={copy} />
    </div>
  );
}

function CopyField({
  label,
  value,
  copy,
}: {
  label: string;
  value: string;
  copy: Copy;
}) {
  const [copied, setCopied] = useState(false);

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 650,
          color: COLORS.inkMuted,
          marginBottom: 3,
          textTransform: "uppercase",
          letterSpacing: 0.3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          gap: 6,
        }}
      >
        <code
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 11.5,
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
            color: COLORS.ink,
            background: COLORS.card,
            border: `1px solid ${COLORS.borderSoft}`,
            borderRadius: 8,
            padding: "8px 10px",
            wordBreak: "break-all",
          }}
        >
          {value}
        </code>
        <button
          type="button"
          onClick={() => void onCopy()}
          style={{
            flexShrink: 0,
            fontSize: 11.5,
            fontWeight: 650,
            fontFamily: FONTS.body,
            color: COLORS.ink,
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            padding: "0 10px",
            cursor: "pointer",
          }}
        >
          {copied ? copy.t("Copied") : copy.t("Copy")}
        </button>
      </div>
    </div>
  );
}
