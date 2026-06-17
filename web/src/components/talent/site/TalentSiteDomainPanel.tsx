"use client";

import { useEffect, useState, useTransition } from "react";

import { COLORS, FONTS } from "@/components/admin/shell/internal/state";
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
 * Max site. The WS2 dashboard lead mounts this into the
 * `TALENT_SITE_DOMAIN_PANEL_SLOT`; it is NOT wired anywhere itself.
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
 */

const STATUS_META: Record<
  TalentSiteDomainView["status"],
  { label: string; fg: string; bg: string }
> = {
  pending: { label: "Pending", fg: COLORS.amberDeep, bg: COLORS.amberSoft },
  dns_verification_sent: {
    label: "Awaiting TXT",
    fg: COLORS.amberDeep,
    bg: COLORS.amberSoft,
  },
  verified: { label: "Verified", fg: COLORS.indigoDeep, bg: COLORS.indigoSoft },
  ssl_provisioned: {
    label: "Provisioning SSL",
    fg: COLORS.indigoDeep,
    bg: COLORS.indigoSoft,
  },
  active: { label: "Live", fg: COLORS.successDeep, bg: COLORS.successSoft },
  error: { label: "Needs attention", fg: COLORS.criticalDeep, bg: COLORS.criticalSoft },
};

type Props = {
  initialDomains?: TalentSiteDomainView[];
  canManage?: boolean;
};

export function TalentSiteDomainPanel({ initialDomains, canManage = true }: Props) {
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
      setError(result.error);
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
      setError("Enter a domain to continue.");
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
      <Card>
        <Header />
        <p style={{ margin: "10px 0 0", fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          Connecting your own domain is a Max feature. Upgrade to Max to point a
          custom domain at your site.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <Header />

      <div
        style={{
          display: "flex",
          gap: 8,
          marginTop: 14,
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
            background: "#fff",
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
          }}
        />
        <PrimaryButton onClick={connect} disabled={pending}>
          Connect domain
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
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted }}>Loading domains…</p>
        ) : domains.length === 0 ? (
          <p style={{ fontSize: 12.5, color: COLORS.inkMuted, lineHeight: 1.5 }}>
            No custom domain yet. Add one above to serve your site from your own
            address. We will show the DNS records to add.
          </p>
        ) : (
          domains.map((d) => (
            <DomainRow
              key={d.domain}
              domain={d}
              pending={pending}
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

function Header() {
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
        Custom domain
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.ink, marginTop: 4 }}>
        Serve your site from your own domain
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: "14px 16px",
        background: COLORS.surfaceAlt,
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 12,
        fontFamily: FONTS.body,
      }}
    >
      {children}
    </div>
  );
}

function DomainRow({
  domain,
  pending,
  onVerify,
  onCheck,
  onSetPrimary,
  onRemove,
}: {
  domain: TalentSiteDomainView;
  pending: boolean;
  onVerify: () => void;
  onCheck: () => void;
  onSetPrimary: () => void;
  onRemove: () => void;
}) {
  const meta = STATUS_META[domain.status];
  const needsTxt =
    domain.status === "pending" || domain.status === "dns_verification_sent";
  const needsRouting =
    domain.status === "verified" || domain.status === "ssl_provisioned";

  return (
    <div
      style={{
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        background: "#fff",
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
              Primary
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
              Verify
            </SecondaryButton>
          ) : null}
          {needsRouting ? (
            <SecondaryButton onClick={onCheck} disabled={pending}>
              Check routing
            </SecondaryButton>
          ) : null}
          {domain.canBecomePrimary ? (
            <SecondaryButton onClick={onSetPrimary} disabled={pending}>
              Make primary
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
            Remove
          </button>
        </div>
      </div>

      {domain.failureReason ? (
        <p style={{ margin: "8px 0 0", fontSize: 11.5, color: COLORS.inkMuted, lineHeight: 1.45 }}>
          {domain.failureReason}
        </p>
      ) : null}

      {needsTxt && domain.txtRecord ? (
        <DnsBlock
          title="1. Add this TXT record to prove you own the domain"
          rows={[
            { type: "TXT", host: domain.txtRecord.host, value: domain.txtRecord.value },
          ]}
        />
      ) : null}

      {(needsTxt || needsRouting) && domain.routingRecords.length > 0 ? (
        <DnsBlock
          title={
            needsTxt
              ? "2. Then point the domain at Vercel"
              : "Point the domain at Vercel"
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
