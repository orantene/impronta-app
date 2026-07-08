"use client";

import { useState, useTransition } from "react";
import { HQ, HQ_F, HQ_FM } from "./hq-kit";
import {
  Accordion,
  Btn,
  ConfirmModal,
  Feedback,
  inputStyle,
  type OnChanged,
  type SectionProps,
} from "./tenant-section-kit";
import {
  actionAddDomain,
  actionRemoveDomain,
  actionSetPrimaryDomain,
  actionUpdateTenantSettings,
  actionSetTenantStatus,
  actionDeleteTenant,
} from "./actions-control";
import type {
  TenantManagementDetail,
  TenantManagementDomain,
} from "../../tenant-management-data";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

// ─── Domain management ────────────────────────────────────────────────────────

const DOMAIN_KIND_LABEL_KEY: Record<string, string> = {
  subdomain: "dashboard.platform.tenants.domainKindSubdomain",
  custom: "dashboard.platform.tenants.domainKindCustom",
  marketing: "dashboard.platform.tenants.domainKindMarketing",
  app: "dashboard.platform.tenants.domainKindApp",
  hub: "dashboard.platform.tenants.domainKindHub",
};

function domainKindLabel(t: Translate, kind: string): string {
  const key = DOMAIN_KIND_LABEL_KEY[kind];
  return key ? t(key) : kind;
}

const STATUS_COLOR: Record<string, string> = {
  active: HQ.green,
  ssl_provisioned: HQ.green,
  verified: HQ.amber,
  pending: HQ.amber,
};

function DomainRow({
  domain,
  tenantId,
  onChanged,
}: {
  domain: TenantManagementDomain;
  tenantId: string;
  onChanged: OnChanged;
}) {
  const t = useT();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<"remove" | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setMsg(null);
    start(async () => {
      const res = await fn();
      if (res.ok) { setConfirm(null); await onChanged(); }
      else { setMsg({ tone: "err", text: res.error ?? t("dashboard.platform.tenants.actionFailed") }); setConfirm(null); }
    });
  }

  const canSetPrimary = !domain.isPrimary && ["active", "ssl_provisioned", "verified"].includes(domain.status);
  const canRemove = domain.kind !== "subdomain" && !domain.isPrimary;

  return (
    <div style={{ padding: "9px 0", borderTop: `1px solid ${HQ.borderSoft}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 12.5,
              color: HQ.ink,
              fontFamily: HQ_FM,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {domain.hostname}
            {domain.isPrimary && (
              <span style={{ fontSize: 10, fontWeight: 700, color: HQ.green, letterSpacing: 0.5, textTransform: "uppercase", fontFamily: HQ_F }}>
                {t("dashboard.platform.tenants.domainPrimary")}
              </span>
            )}
          </div>
          <div style={{ marginTop: 3, display: "flex", gap: 5, flexWrap: "wrap" }}>
            <span style={{ fontSize: 10.5, color: HQ.inkDim, fontFamily: HQ_F }}>
              {domainKindLabel(t, domain.kind)}
            </span>
            <span style={{ fontSize: 10.5, color: STATUS_COLOR[domain.status] ?? HQ.inkDim }}>
              · {domain.status}
            </span>
          </div>
        </div>
        <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
          {canSetPrimary && (
            <Btn size="sm" onClick={() => run(() => actionSetPrimaryDomain({ tenantId, domainId: domain.id }))} disabled={pending}>
              {t("dashboard.platform.tenants.setPrimary")}
            </Btn>
          )}
          {canRemove && (
            <Btn size="sm" tone="danger" onClick={() => setConfirm("remove")} disabled={pending}>
              {t("dashboard.platform.tenants.remove")}
            </Btn>
          )}
        </div>
      </div>
      <Feedback msg={msg} />
      <ConfirmModal
        open={confirm === "remove"}
        title={t("dashboard.platform.tenants.removeDomainTitle")}
        body={interpolate(t("dashboard.platform.tenants.removeDomainBody"), { hostname: domain.hostname })}
        confirmLabel={t("dashboard.platform.tenants.removeDomainConfirm")}
        pending={pending}
        onCancel={() => setConfirm(null)}
        onConfirm={() => run(() => actionRemoveDomain({ tenantId, domainId: domain.id }))}
      />
    </div>
  );
}

function AddDomainForm({ detail, onChanged }: { detail: TenantManagementDetail; onChanged: OnChanged }) {
  const t = useT();
  const [hostname, setHostname] = useState("");
  const [kind, setKind] = useState("custom");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await actionAddDomain({ tenantId: detail.id, hostname, kind });
      if (res.ok) { setHostname(""); setMsg({ tone: "ok", text: t("dashboard.platform.tenants.domainAdded") }); await onChanged(); }
      else setMsg({ tone: "err", text: res.error });
    });
  }

  return (
    <div style={{ marginTop: 10, padding: "10px 12px", background: HQ.cardSofter, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.inkDim, marginBottom: 8 }}>
        {t("dashboard.platform.tenants.addDomain")}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder={t("dashboard.platform.tenants.addDomainPlaceholder")}
          value={hostname}
          disabled={pending}
          onChange={(e) => setHostname(e.target.value)}
          style={{ ...inputStyle, flex: "1 1 200px" }}
        />
        <select value={kind} disabled={pending} onChange={(e) => setKind(e.target.value)} style={{ ...inputStyle, width: "auto" }}>
          <option value="custom">{t("dashboard.platform.tenants.domainCustom")}</option>
          <option value="subdomain">{t("dashboard.platform.tenants.domainSubdomain")}</option>
        </select>
        <Btn tone="primary" onClick={submit} disabled={pending || !hostname.trim()}>
          {pending ? t("dashboard.platform.tenants.adding") : t("dashboard.platform.tenants.add")}
        </Btn>
      </div>
      <p style={{ fontSize: 10.5, color: HQ.inkDim, margin: "6px 0 0" }}>
        {t("dashboard.platform.tenants.addDomainNote")}
      </p>
      <Feedback msg={msg} />
    </div>
  );
}

export function DomainSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const t = useT();
  return (
    <Accordion
      title={t("dashboard.platform.tenants.sectionDomains")}
      hint={`${detail.domains.length}`}
      defaultOpen={defaultOpen ?? false}
    >
      <div style={{ paddingTop: 2 }}>
        {detail.domains.length === 0 ? (
          <div style={{ padding: "12px 0", fontSize: 12.5, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.noDomains")}
          </div>
        ) : (
          detail.domains.map((d) => (
            <DomainRow
              key={d.id}
              domain={d}
              tenantId={detail.id}
              onChanged={onChanged}
            />
          ))
        )}
        <AddDomainForm detail={detail} onChanged={onChanged} />
      </div>
    </Accordion>
  );
}

// ─── Workspace settings + danger zone ─────────────────────────────────────────

export function TenantSettingsSection({ detail, onChanged, defaultOpen }: SectionProps) {
  const t = useT();
  const [name, setName] = useState(detail.name);
  const [kind, setKind] = useState(detail.entityType);
  const [pendingSettings, startSettings] = useTransition();
  const [msgSettings, setMsgSettings] = useState<{ tone: "ok" | "err"; text: string } | null>(null);

  const [statusReason, setStatusReason] = useState("");
  const [pendingStatus, startStatus] = useTransition();
  const [msgStatus, setMsgStatus] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmStatus, setConfirmStatus] = useState<string | null>(null);

  const [deleteSlug, setDeleteSlug] = useState("");
  const [pendingDelete, startDelete] = useTransition();
  const [msgDelete, setMsgDelete] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function saveSettings() {
    setMsgSettings(null);
    startSettings(async () => {
      const res = await actionUpdateTenantSettings({ tenantId: detail.id, displayName: name, kind });
      if (res.ok) { setMsgSettings({ tone: "ok", text: t("dashboard.platform.tenants.settingsSaved") }); await onChanged(); }
      else setMsgSettings({ tone: "err", text: res.error });
    });
  }

  function setStatus(status: string) {
    setMsgStatus(null);
    startStatus(async () => {
      const res = await actionSetTenantStatus({ tenantId: detail.id, status, reason: statusReason || null });
      if (res.ok) {
        setConfirmStatus(null);
        setStatusReason("");
        setMsgStatus({ tone: "ok", text: interpolate(t("dashboard.platform.tenants.statusSetTo"), { status }) });
        await onChanged();
      } else {
        setMsgStatus({ tone: "err", text: res.error });
        setConfirmStatus(null);
      }
    });
  }

  function doDelete() {
    setMsgDelete(null);
    startDelete(async () => {
      const res = await actionDeleteTenant({ tenantId: detail.id, confirmSlug: deleteSlug });
      if (res.ok) {
        setConfirmDelete(false);
        setMsgDelete({ tone: "ok", text: t("dashboard.platform.tenants.workspaceCancelled") });
        await onChanged();
      } else {
        setMsgDelete({ tone: "err", text: res.error });
        setConfirmDelete(false);
      }
    });
  }

  const isActive = detail.status === "active";
  const isSuspended = detail.status === "suspended";

  return (
    <Accordion title={t("dashboard.platform.tenants.sectionSettingsDanger")} defaultOpen={defaultOpen ?? false}>
      <div style={{ paddingTop: 8, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Display name + entity type */}
        <div style={{ padding: "10px 12px", background: HQ.cardSofter, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.tenants.displaySettings")}
          </div>
          <label style={{ fontSize: 11, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.fieldDisplayNameLabel")}
            <input
              type="text"
              value={name}
              disabled={pendingSettings}
              onChange={(e) => setName(e.target.value)}
              style={{ ...inputStyle, marginTop: 3 }}
            />
          </label>
          <label style={{ fontSize: 11, color: HQ.inkMuted }}>
            {t("dashboard.platform.tenants.fieldWorkspaceType")}
            <select
              value={kind}
              disabled={pendingSettings}
              onChange={(e) => setKind(e.target.value)}
              style={{ ...inputStyle, marginTop: 3 }}
            >
              <option value="agency">{t("dashboard.platform.tier.agency")}</option>
              <option value="hub">Hub</option>
            </select>
          </label>
          <Btn
            tone="primary"
            onClick={saveSettings}
            disabled={pendingSettings || (!name.trim() || (name === detail.name && kind === detail.entityType))}
          >
            {pendingSettings ? t("dashboard.platform.tenants.saving") : t("dashboard.platform.tenants.saveSettings")}
          </Btn>
          <Feedback msg={msgSettings} />
        </div>

        {/* Status controls */}
        <div style={{ padding: "10px 12px", background: HQ.cardSofter, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.inkDim }}>
            {t("dashboard.platform.tenants.statusControlCurrent")} <span style={{ color: isSuspended ? HQ.red : isActive ? HQ.green : HQ.amber }}>{detail.status}</span>
          </div>
          {!isActive && (
            <Btn tone="primary" onClick={() => setConfirmStatus("active")} disabled={pendingStatus}>
              {t("dashboard.platform.tenants.activateWorkspace")}
            </Btn>
          )}
          {!isSuspended && (
            <>
              <label style={{ fontSize: 11, color: HQ.inkMuted }}>
                {t("dashboard.platform.tenants.reasonOnSuspend")}
                <input
                  type="text"
                  placeholder={t("dashboard.platform.tenants.reasonSuspendPlaceholder")}
                  value={statusReason}
                  disabled={pendingStatus}
                  onChange={(e) => setStatusReason(e.target.value)}
                  style={{ ...inputStyle, marginTop: 3 }}
                />
              </label>
              <Btn tone="danger" onClick={() => setConfirmStatus("suspended")} disabled={pendingStatus}>
                {t("dashboard.platform.tenants.freezeSuspend")}
              </Btn>
            </>
          )}
          {isSuspended && (
            <Btn tone="danger" onClick={() => setConfirmStatus("archived")} disabled={pendingStatus}>
              {t("dashboard.platform.tenants.archiveWorkspace")}
            </Btn>
          )}
          <Feedback msg={msgStatus} />
        </div>

        {/* Danger: cancel */}
        <div style={{ padding: "10px 12px", background: "rgba(243,103,114,0.06)", border: "1px solid rgba(243,103,114,0.2)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: HQ.red }}>
            {t("dashboard.platform.tenants.cancelWorkspace")}
          </div>
          <p style={{ fontSize: 11.5, color: HQ.inkMuted, margin: 0, lineHeight: 1.55 }}>
            {t("dashboard.platform.tenants.cancelWorkspaceDesc")}
          </p>
          <Btn tone="danger" onClick={() => setConfirmDelete(true)} disabled={pendingDelete}>
            {t("dashboard.platform.tenants.cancelWorkspaceEllipsis")}
          </Btn>
          <Feedback msg={msgDelete} />
        </div>
      </div>

      {/* Status confirm */}
      <ConfirmModal
        open={Boolean(confirmStatus)}
        title={confirmStatus === "active" ? t("dashboard.platform.tenants.activateWorkspace") : confirmStatus === "suspended" ? t("dashboard.platform.tenants.freezeWorkspace") : t("dashboard.platform.tenants.archiveWorkspace")}
        body={
          confirmStatus === "active"
            ? interpolate(t("dashboard.platform.tenants.confirmActivateBody"), { workspace: detail.name })
            : confirmStatus === "suspended"
            ? interpolate(t("dashboard.platform.tenants.confirmSuspendBody"), { workspace: detail.name, reason: statusReason || t("dashboard.platform.tenants.reasonNone") })
            : interpolate(t("dashboard.platform.tenants.confirmArchiveBody"), { workspace: detail.name })
        }
        confirmLabel={confirmStatus === "active" ? t("dashboard.platform.tenants.activate") : confirmStatus === "suspended" ? t("dashboard.platform.tenants.freeze") : t("dashboard.platform.tenants.archive")}
        pending={pendingStatus}
        onCancel={() => setConfirmStatus(null)}
        onConfirm={() => confirmStatus && setStatus(confirmStatus)}
      />

      {/* Cancel confirm */}
      <ConfirmModal
        open={confirmDelete}
        title={t("dashboard.platform.tenants.cancelWorkspaceConfirmTitle")}
        body={
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <p style={{ margin: 0, fontSize: 13, color: HQ.inkMuted }}>
              {interpolate(t("dashboard.platform.tenants.cancelWorkspaceConfirmBody"), { workspace: detail.name, slug: detail.slug })}
            </p>
            <input
              type="text"
              placeholder={detail.slug}
              value={deleteSlug}
              onChange={(e) => setDeleteSlug(e.target.value)}
              style={{ ...inputStyle }}
            />
          </div>
        }
        confirmLabel={t("dashboard.platform.tenants.cancelWorkspace")}
        pending={pendingDelete}
        onCancel={() => { setConfirmDelete(false); setDeleteSlug(""); }}
        onConfirm={doDelete}
      />
    </Accordion>
  );
}
