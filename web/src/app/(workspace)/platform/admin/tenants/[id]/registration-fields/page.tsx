// Platform HQ — per-tenant Registration Fields configurator.
//
// Lets a super_admin choose which profile fields appear (and are required,
// and in what order) on this workspace's talent registration wizard — writing
// per-tenant overrides into workspace_profile_field_settings that the resolver
// (profile-fields-service.loadFieldsForMode('registration')) folds in. No
// deploy required. Service-role read via the data loader; the platform layout
// enforces super_admin. HQ dark theme (mirrors the catalog posture page).

import Link from "next/link";
import { notFound } from "next/navigation";
import { HQ, F, FD } from "../../../catalog/_ui";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { loadTenantRegistrationFields } from "./registration-fields-data";
import { RegistrationFieldsClient } from "./registration-fields-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ id: string }>;

const RF = "dashboard.platform.tenants.registrationFieldsPage";

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, color: tone ?? HQ.ink, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

export default async function TenantRegistrationFieldsPage({ params }: { params: PageParams }) {
  const { id } = await params;
  const data = await loadTenantRegistrationFields(id);
  if (!data.ok || !data.header) notFound();

  const h = data.header;
  const t = createTranslator(await getRequestLocale());

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {/* Breadcrumbs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          marginBottom: 16,
          fontSize: 12,
          color: HQ.inkMuted,
        }}
      >
        <Link href="/platform/admin/tenants" style={{ color: HQ.inkMuted, textDecoration: "none" }}>
          {t(`${RF}.breadcrumbAll`)}
        </Link>
        <span style={{ color: HQ.inkDim }}>›</span>
        <Link href={`/platform/admin/tenants/${id}`} style={{ color: HQ.inkMuted, textDecoration: "none" }}>
          {h.name}
        </Link>
        <span style={{ color: HQ.inkDim }}>›</span>
        <span style={{ color: HQ.ink }}>{t(`${RF}.breadcrumbRegistrationFields`)}</span>
      </div>

      {/* Title */}
      <h1
        style={{
          fontFamily: FD,
          fontSize: 22,
          fontWeight: 600,
          letterSpacing: -0.4,
          color: HQ.ink,
          margin: "0 0 4px",
        }}
      >
        {t(`${RF}.title`)}
      </h1>
      <div style={{ fontSize: 12.5, color: HQ.inkMuted, marginBottom: 18, maxWidth: 720 }}>
        {t(`${RF}.introBodyPre`)}{" "}
        <span style={{ color: HQ.ink }}>{h.name}</span>
        {t(`${RF}.introBodyPost`)}{" "}
        <Link href={`/platform/admin/tenants/${id}/catalog`} style={{ color: HQ.green, textDecoration: "none" }}>
          {t(`${RF}.introCatalogLink`)}
        </Link>{" "}
        {t(`${RF}.introBodyEnd`)}
      </div>

      {/* Stats */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 18 }}>
        <Stat label={t(`${RF}.statEligibleFields`)} value={data.counts.total} />
        <Stat label={t(`${RF}.statShownAtRegistration`)} value={data.counts.shown} tone={HQ.green} />
        <Stat label={t(`${RF}.statRequired`)} value={data.counts.required} tone={HQ.amber} />
        <Stat
          label={t(`${RF}.statOverridden`)}
          value={data.counts.overridden}
          tone={data.counts.overridden > 0 ? HQ.violet : undefined}
        />
      </div>

      <RegistrationFieldsClient tenantId={id} groups={data.groups} />
    </div>
  );
}
