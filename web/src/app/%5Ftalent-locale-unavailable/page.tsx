/**
 * Soft "this site is only in one language" notice (TUL-516 B1).
 *
 * Talent hosts rewrite here when the URL carries a platform locale the talent
 * does not publish (e.g. `/en` on a Spanish-only demo). Explicit, not a silent
 * redirect to the Spanish home. Whitelisted in the proxy short-circuit.
 *
 * `?requested=` is the prefix the visitor asked for (set by the host rewrite);
 * the request locale header is the site's own language. The talent comes from
 * the same gated proxy headers as `_talent-site` (never from the URL).
 */
import { cache } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { getRequestLocale } from "@/i18n/request-locale";
import { HOST_CONTEXT_HEADER, HOST_TALENT_PROFILE_HEADER } from "@/lib/saas/host-context";
import {
  talentLocaleUnavailableCopy,
  talentNoticeDisplayName,
} from "@/lib/saas/talent-locale-unavailable-copy";
import { loadMaxSiteByProfileId, loadTalentSiteIdentity } from "@/lib/talent-site/server/load-max-site";
import { resolveGatedTalentProfileId } from "@/lib/talent-site/server/talent-site-host-gate";

type Props = { searchParams: Promise<{ requested?: string | string[] }> };

async function copyFor(props: Props) {
  const { requested } = await props.searchParams;
  return talentLocaleUnavailableCopy({
    requested: Array.isArray(requested) ? requested[0] : requested,
    site: await getRequestLocale(),
  });
}

const loadTalentBrand = cache(async (): Promise<{ name: string | null; logoUrl: string | null }> => {
  try {
    const h = await headers();
    const talentProfileId = resolveGatedTalentProfileId({
      hostContext: h.get(HOST_CONTEXT_HEADER),
      talentProfileId: h.get(HOST_TALENT_PROFILE_HEADER),
    });
    if (!talentProfileId) return { name: null, logoUrl: null };
    const [site, identity] = await Promise.all([
      loadMaxSiteByProfileId(talentProfileId),
      loadTalentSiteIdentity(talentProfileId),
    ]);
    return { name: talentNoticeDisplayName(identity), logoUrl: site?.logoUrl ?? null };
  } catch {
    return { name: null, logoUrl: null };
  }
});

export async function generateMetadata(props: Props): Promise<Metadata> {
  const [copy, brand] = await Promise.all([copyFor(props), loadTalentBrand()]);
  return {
    title: { absolute: brand.name ? `${brand.name} · ${copy.title}` : copy.title },
    robots: { index: false, follow: false },
  };
}

export default async function TalentLocaleUnavailablePage(props: Props) {
  const [copy, brand] = await Promise.all([copyFor(props), loadTalentBrand()]);
  return (
    <div
      lang={copy.lang}
      style={{
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 20,
        padding: "48px 24px",
        background: "#FAFAF7",
      }}
    >
      {brand.name || brand.logoUrl ? (
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            color: "#0B0B0D",
            textDecoration: "none",
          }}
        >
          {brand.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- talent logo is any remote host
            <img
              src={brand.logoUrl}
              alt={brand.name ?? ""}
              style={{ height: 36, width: "auto", maxWidth: 160, objectFit: "contain" }}
            />
          ) : null}
          {brand.name ? (
            <span
              style={{
                fontFamily: '"Inter", system-ui, sans-serif',
                fontSize: 17,
                fontWeight: 600,
                letterSpacing: -0.2,
              }}
            >
              {brand.name}
            </span>
          ) : null}
        </Link>
      ) : null}
      <div
        style={{
          width: "100%",
          maxWidth: 480,
          background: "#ffffff",
          border: "1px solid rgba(24,24,27,0.10)",
          borderRadius: 16,
          padding: "32px 32px",
        }}
      >
        <h1
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 26,
            fontWeight: 600,
            color: "#0B0B0D",
            letterSpacing: -0.4,
            marginTop: 0,
            marginBottom: 0,
          }}
        >
          {copy.heading}
        </h1>
        <p
          style={{
            fontFamily: '"Inter", system-ui, sans-serif',
            fontSize: 13.5,
            color: "rgba(11,11,13,0.60)",
            lineHeight: 1.55,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {copy.body}
        </p>
        {copy.siteLine ? (
          <p
            lang={copy.siteLine.lang}
            style={{
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 12.5,
              color: "rgba(11,11,13,0.50)",
              lineHeight: 1.5,
              marginTop: 8,
              marginBottom: 0,
            }}
          >
            {copy.siteLine.text}
          </p>
        ) : null}
        <div style={{ marginTop: 24 }}>
          <Link
            href="/"
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "9px 18px",
              borderRadius: 999,
              background: "#0F4F3E",
              color: "#ffffff",
              fontFamily: '"Inter", system-ui, sans-serif',
              fontSize: 13.5,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            {copy.homeCta}
          </Link>
        </div>
      </div>
    </div>
  );
}
