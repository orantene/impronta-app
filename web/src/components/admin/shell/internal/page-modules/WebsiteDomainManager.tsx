"use client";

/**
 * WebsiteDomainManager.tsx — the REAL domain manager for Website → Setup.
 *
 * WHAT THIS REPLACES
 * ──────────────────
 * The old `DomainDrawer` (drawers/light-05.tsx) rendered the `WEBSITE_STATE`
 * prototype fixture — every tenant saw "Records 2/2 matched" and an invented
 * SSL renewal date, "Re-check DNS" was a toast stub, and the input saved into
 * `agencies.settings.domain`, a namespace nothing reads. This component talks
 * to the live `agency_domains` registry through the five server actions in
 * `admin/settings/domain-actions.ts` (connect / verify / check provisioning /
 * switch primary / remove) — the same actions the middleware host gate and the
 * verification sweep already trust.
 *
 * DATA: rows come from `effectiveWebsiteState.domain.records`, projected from
 * `loadWorkspaceDomainSummary` by `mergeWebsiteStateFromBridge`. Derivations
 * (status chips, DNS rows incl. the TXT ownership token, action eligibility)
 * live in `lib/admin/website-domain-rows.ts` and mirror the server's checks.
 *
 * GATES (both fixed here, matching the server EXACTLY):
 *   • capability — actions render only for holders of `manage_agency_domains`
 *     (owner-only), resolved server-side in the admin layout and passed via
 *     `bridgeSessionIdentity.canManageDomains`. Everyone else sees the live
 *     status read-only. The old surface showed "Manage" to role `admin`, who
 *     the server then refused.
 *   • plan — the connect form unlocks from `domain.canUseCustomDomain`, the
 *     same `customDomainEligible(plan)` the connect action checks. The old
 *     drawer unlocked at Studio and told Studio tenants to upgrade to Studio.
 *
 * Server actions redirect back to `/admin/website/setup?dmsg=…|derr=…`
 * (returnTo="website"); the banner below reads those once on mount.
 *
 * STYLING — admin token classes only (`ratchet/no-new-inline-style`).
 */

import { useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  connectCustomDomainAction,
  verifyCustomDomainNowAction,
  switchPrimaryDomainAction,
  removeCustomDomainAction,
  checkCustomDomainProvisioningAction,
} from "@/app/(workspace)/[tenantSlug]/admin/settings/domain-actions";
import {
  DOMAIN_STATUS_META,
  agencyDomainDnsRows,
  domainCanBecomePrimary,
  domainNeedsRoutingCheck,
  domainNeedsTxtVerification,
  type DomainStatusTone,
} from "@/lib/admin/website-domain-rows";

import { useAdminShell } from "../state";
import type { WebsiteDomainRecord } from "../state/types";

const K = "dashboard.adminWebsite.domain";

const TONE_CLASSES: Record<DomainStatusTone, string> = {
  success: "bg-admin-success-soft text-admin-success-deep",
  amber: "bg-admin-amber-soft text-admin-amber-deep",
  critical: "bg-admin-critical-soft text-admin-critical-deep",
  indigo: "bg-admin-indigo-soft text-admin-indigo-deep",
};

/** Submit button that reflects the surrounding form's pending state. */
function ActionSubmit({
  label,
  pendingLabel,
  tone = "neutral",
}: {
  label: string;
  pendingLabel: string;
  tone?: "neutral" | "primary" | "danger";
}) {
  const { pending } = useFormStatus();
  const toneClass =
    tone === "primary"
      ? "border-admin-accent bg-admin-accent text-white"
      : tone === "danger"
        ? "border-admin-critical-deep bg-admin-card text-admin-critical-deep"
        : "border-admin-border bg-admin-card text-admin-ink";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`cursor-pointer rounded-admin-md border px-[12px] py-[6px] text-admin-11h font-semibold disabled:cursor-not-allowed disabled:opacity-60 ${toneClass}`}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

/** Hidden fields every domain action needs. */
function ActionFields({ tenantSlug, hostname }: { tenantSlug: string; hostname: string }) {
  return (
    <>
      <input type="hidden" name="tenantSlug" value={tenantSlug} />
      <input type="hidden" name="hostname" value={hostname} />
      <input type="hidden" name="returnTo" value="website" />
    </>
  );
}

/** One DNS record the owner must add, with a copy affordance per value. */
function DnsRow({
  row,
  onCopy,
}: {
  row: { type: string; host: string; value: string };
  onCopy: (value: string, label: string) => void;
}) {
  const t = useT();
  return (
    <div className="grid grid-cols-[52px_1fr_auto] items-start gap-[8px] rounded-admin-md border border-admin-border bg-admin-surface-alt px-[10px] py-[8px] font-mono text-admin-11h">
      <span className="font-semibold text-admin-ink">{row.type}</span>
      <span className="min-w-0">
        <span className="block break-all text-admin-ink-muted">
          <span className="text-admin-ink-dim">{t(`${K}.dnsHost`)} </span>
          {row.host}
        </span>
        <span className="mt-[2px] block break-all text-admin-ink">
          <span className="text-admin-ink-dim">{t(`${K}.dnsValue`)} </span>
          {row.value}
        </span>
      </span>
      <button
        type="button"
        onClick={() => onCopy(row.value, row.type)}
        className="cursor-pointer rounded-admin-sm border border-admin-border bg-admin-card px-[8px] py-[3px] font-sans text-admin-10 font-semibold uppercase tracking-[0.3px] text-admin-ink-muted"
      >
        {t(`${K}.copy`)}
      </button>
    </div>
  );
}

function DomainRow({
  record,
  tenantSlug,
  canManage,
  onCopy,
}: {
  record: WebsiteDomainRecord;
  tenantSlug: string;
  canManage: boolean;
  onCopy: (value: string, label: string) => void;
}) {
  const t = useT();
  const [confirming, setConfirming] = useState<"primary" | "remove" | null>(null);
  const meta = DOMAIN_STATUS_META[record.status];
  const isCustom = record.kind === "custom";
  const needsTxt = isCustom && domainNeedsTxtVerification(record.status);
  const needsRouting = isCustom && domainNeedsRoutingCheck(record.status);
  const offerPrimary = canManage && domainCanBecomePrimary(record);
  const dns = isCustom
    ? agencyDomainDnsRows(record.hostname, record.verificationToken)
    : { txt: null, routing: [] };

  return (
    <div className="rounded-admin-lg border border-admin-border bg-admin-card p-[12px]">
      <div className="flex flex-wrap items-center justify-between gap-[10px]">
        <div className="flex min-w-0 flex-wrap items-center gap-[8px]">
          <span className="break-all font-mono text-admin-13h font-semibold text-admin-ink">
            {record.hostname}
          </span>
          {record.isPrimary ? (
            <span className="rounded-full bg-admin-accent-soft px-[7px] py-[2px] text-admin-10 font-bold uppercase tracking-[0.3px] text-admin-accent-deep">
              {t(`${K}.primaryBadge`)}
            </span>
          ) : null}
          <span
            className={`rounded-full px-[7px] py-[2px] text-admin-10 font-bold uppercase tracking-[0.3px] ${TONE_CLASSES[meta.tone]}`}
          >
            {t(`${K}.status.${meta.labelKey}`)}
          </span>
        </div>
        {canManage && isCustom ? (
          <div className="flex flex-wrap items-center gap-[6px]">
            {needsTxt ? (
              <form action={verifyCustomDomainNowAction}>
                <ActionFields tenantSlug={tenantSlug} hostname={record.hostname} />
                <ActionSubmit
                  label={t(`${K}.verifyNow`)}
                  pendingLabel={t(`${K}.working`)}
                />
              </form>
            ) : null}
            {needsRouting ? (
              <form action={checkCustomDomainProvisioningAction}>
                <ActionFields tenantSlug={tenantSlug} hostname={record.hostname} />
                <ActionSubmit
                  label={t(`${K}.checkRouting`)}
                  pendingLabel={t(`${K}.working`)}
                />
              </form>
            ) : null}
            {offerPrimary && confirming === null ? (
              <button
                type="button"
                onClick={() => setConfirming("primary")}
                className="cursor-pointer rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-11h font-semibold text-admin-ink"
              >
                {t(`${K}.makePrimary`)}
              </button>
            ) : null}
            {confirming === null ? (
              <button
                type="button"
                onClick={() => setConfirming("remove")}
                className="cursor-pointer border-none bg-transparent px-[6px] py-[6px] text-admin-11h font-semibold text-admin-critical-deep"
              >
                {t(`${K}.remove`)}
              </button>
            ) : null}
          </div>
        ) : offerPrimary && !isCustom ? (
          // Subdomain rows have exactly one action: become primary again.
          <div className="flex items-center gap-[6px]">
            {confirming === null ? (
              <button
                type="button"
                onClick={() => setConfirming("primary")}
                className="cursor-pointer rounded-admin-md border border-admin-border bg-admin-card px-[12px] py-[6px] text-admin-11h font-semibold text-admin-ink"
              >
                {t(`${K}.makePrimary`)}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Inline confirms — switching or removing changes the LIVE address, so
          neither fires on a single click. */}
      {confirming === "primary" ? (
        <div className="mt-[10px] flex flex-wrap items-center gap-[8px] rounded-admin-md border border-admin-amber-deep/40 bg-admin-amber-soft px-[10px] py-[8px]">
          <span className="min-w-0 flex-1 text-admin-11h text-admin-ink">
            {interpolate(t(`${K}.makePrimaryConfirm`), { host: record.hostname })}
          </span>
          <form action={switchPrimaryDomainAction}>
            <ActionFields tenantSlug={tenantSlug} hostname={record.hostname} />
            <ActionSubmit
              label={t(`${K}.makePrimaryConfirmYes`)}
              pendingLabel={t(`${K}.working`)}
              tone="primary"
            />
          </form>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="cursor-pointer border-none bg-transparent text-admin-11h font-semibold text-admin-ink-muted"
          >
            {t(`${K}.cancel`)}
          </button>
        </div>
      ) : null}
      {confirming === "remove" ? (
        <div className="mt-[10px] flex flex-wrap items-center gap-[8px] rounded-admin-md border border-admin-critical-deep/40 bg-admin-critical-soft px-[10px] py-[8px]">
          <span className="min-w-0 flex-1 text-admin-11h text-admin-ink">
            {interpolate(t(`${K}.removeConfirm`), { host: record.hostname })}
          </span>
          <form action={removeCustomDomainAction}>
            <ActionFields tenantSlug={tenantSlug} hostname={record.hostname} />
            <ActionSubmit
              label={t(`${K}.removeConfirmYes`)}
              pendingLabel={t(`${K}.working`)}
              tone="danger"
            />
          </form>
          <button
            type="button"
            onClick={() => setConfirming(null)}
            className="cursor-pointer border-none bg-transparent text-admin-11h font-semibold text-admin-ink-muted"
          >
            {t(`${K}.cancel`)}
          </button>
        </div>
      ) : null}

      {record.failureReason ? (
        <p className="m-0 mt-[8px] text-admin-11h leading-relaxed text-admin-critical-deep">
          {record.failureReason}
        </p>
      ) : null}

      {!isCustom ? (
        <p className="m-0 mt-[6px] text-admin-11h leading-relaxed text-admin-ink-muted">
          {t(`${K}.subdomainNote`)}
        </p>
      ) : null}

      {/* The REAL records to add, incl. the TXT ownership token the registry
          stores — previously loaded on every request and rendered nowhere. */}
      {needsTxt && dns.txt ? (
        <div className="mt-[10px]">
          <div className="mb-[6px] text-admin-11h font-semibold text-admin-ink-muted">
            {t(`${K}.txtStepTitle`)}
          </div>
          <DnsRow row={dns.txt} onCopy={onCopy} />
        </div>
      ) : null}
      {(needsTxt || needsRouting) && dns.routing.length > 0 ? (
        <div className="mt-[10px]">
          <div className="mb-[6px] text-admin-11h font-semibold text-admin-ink-muted">
            {needsTxt ? t(`${K}.routingStepTitle`) : t(`${K}.routingOnlyTitle`)}
          </div>
          <div className="flex flex-col gap-[6px]">
            {dns.routing.map((row) => (
              <DnsRow key={`${row.type}-${row.host}`} row={row} onCopy={onCopy} />
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WebsiteDomainManager() {
  const t = useT();
  const { effectiveWebsiteState, bridgeSessionIdentity, tenantSlug, toast, openUpgrade } =
    useAdminShell();
  const domain = effectiveWebsiteState.domain;
  const slug = tenantSlug ?? "";
  // Server-resolved `manage_agency_domains` (owner-only) — the SAME capability
  // every domain action requires. No bridge (standalone demo) => no actions.
  const canManage = Boolean(bridgeSessionIdentity?.canManageDomains) && slug !== "";
  const [banner, setBanner] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  // The actions land back here with ?dmsg= / ?derr=. Read once on mount;
  // location is a browser-only read so this cannot run during SSR.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ok = params.get("dmsg");
    const err = params.get("derr");
    if (ok) setBanner({ kind: "ok", text: ok });
    else if (err) setBanner({ kind: "error", text: err });
  }, []);

  const copyValue = (value: string, label: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(value).catch(() => {});
    }
    toast(interpolate(t(`${K}.copiedToast`), { label }));
  };

  const subdomains = domain.records.filter((r) => r.kind === "subdomain");
  const customs = domain.records.filter((r) => r.kind === "custom");
  const ordered = [...customs, ...subdomains];

  return (
    <div className="flex flex-col gap-[10px]">
      {banner ? (
        <div
          className={`rounded-admin-md border px-[10px] py-[8px] text-admin-12h ${
            banner.kind === "ok"
              ? "border-admin-success-deep/40 bg-admin-success-soft text-admin-success-deep"
              : "border-admin-critical-deep/40 bg-admin-critical-soft text-admin-critical-deep"
          }`}
        >
          {banner.text}
        </div>
      ) : null}

      {ordered.length === 0 ? (
        <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">
          {t(`${K}.emptyList`)}
        </p>
      ) : (
        ordered.map((record) => (
          <DomainRow
            key={record.hostname}
            record={record}
            tenantSlug={slug}
            canManage={canManage}
            onCopy={copyValue}
          />
        ))
      )}

      {!canManage ? (
        bridgeSessionIdentity ? (
          <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">
            {t(`${K}.ownerOnly`)}
          </p>
        ) : null
      ) : domain.canUseCustomDomain ? (
        <form
          action={connectCustomDomainAction}
          className="flex flex-col gap-[6px] rounded-admin-lg border border-dashed border-admin-border bg-admin-surface-alt p-[12px]"
        >
          <label
            htmlFor="website-domain-connect"
            className="text-admin-11h font-semibold text-admin-ink"
          >
            {t(`${K}.connectLabel`)}
          </label>
          <div className="flex flex-wrap items-center gap-[8px]">
            <input type="hidden" name="tenantSlug" value={slug} />
            <input type="hidden" name="returnTo" value="website" />
            <input
              id="website-domain-connect"
              name="hostname"
              placeholder={t(`${K}.connectPlaceholder`)}
              spellCheck={false}
              autoCapitalize="none"
              autoCorrect="off"
              required
              className="min-w-0 flex-1 basis-[220px] rounded-admin-md border border-admin-border bg-admin-card px-[10px] py-[7px] font-mono text-admin-12h text-admin-ink"
            />
            <ActionSubmit
              label={t(`${K}.connectAction`)}
              pendingLabel={t(`${K}.working`)}
              tone="primary"
            />
          </div>
          <p className="m-0 text-admin-11h leading-relaxed text-admin-ink-muted">
            {t(`${K}.connectHelp`)}
          </p>
        </form>
      ) : (
        /* Honest plan gate: names the plan the SERVER requires (Agency) — the
           old drawer told Studio tenants to upgrade to Studio. */
        <div className="flex flex-col gap-[8px] rounded-admin-lg border border-admin-border bg-admin-accent-soft p-[12px]">
          <p className="m-0 text-admin-12h leading-relaxed text-admin-ink">
            {t(`${K}.planLockedBody`)}
          </p>
          <button
            type="button"
            onClick={() =>
              openUpgrade({
                feature: t(`${K}.planLockedFeature`),
                why: t(`${K}.planLockedWhy`),
                requiredPlan: "agency",
              })
            }
            className="cursor-pointer self-start rounded-full border-none bg-admin-accent px-[14px] py-[7px] text-admin-11h font-bold text-white"
          >
            {t(`${K}.planLockedCta`)}
          </button>
        </div>
      )}
    </div>
  );
}
