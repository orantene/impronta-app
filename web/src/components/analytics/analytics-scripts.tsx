import Script from "next/script";

import { sanitizeAnalyticsId } from "@/lib/integrations/analytics-id-guard";
import { GA4_INTEGRATION_KEY } from "@/lib/integrations/catalog";

/**
 * Per-tenant analytics injection props.
 *
 * All values are optional plain strings — the server resolves them from
 * tenant_integrations.config_json and passes them in here. A missing value
 * means that analytics integration is off for this tenant (or platform-level
 * when tenantId is not available).
 *
 * gaId falls back to the platform-level NEXT_PUBLIC_GA_MEASUREMENT_ID when a
 * tenant-specific ID is not present (inherit behaviour). All other analytics
 * (Meta, TikTok, LinkedIn, GTM) are tenant-only — no platform fallback.
 */
export interface AnalyticsScriptsProps {
  /** GA4 Measurement ID (e.g. G-XXXXXXXXXX). Falls back to platform env when absent. */
  gaId?: string | null;
  /** GTM Container ID (e.g. GTM-XXXXXXX). Tenant-only — omit to skip GTM. */
  gtmId?: string | null;
  /** Meta (Facebook) Pixel ID (numeric string). Tenant-only. */
  metaPixelId?: string | null;
  /** TikTok Pixel ID (alphanumeric). Tenant-only. */
  tiktokPixelId?: string | null;
  /** LinkedIn Insight Tag Partner ID (numeric string). Tenant-only. */
  linkedInPartnerId?: string | null;
}

const PLATFORM_GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || null;

/**
 * GA4 via gtag.js with Consent Mode v2 defaults read from `localStorage` on
 * first paint (`impronta_analytics_consent`: granted | denied). First-time
 * visitors default to denied until the user accepts in
 * {@link AnalyticsConsentBanner}.
 *
 * All per-tenant analytics are injected here: GA4 (gtag), GTM, Meta Pixel,
 * TikTok Pixel, and LinkedIn Insight Tag. Each is only injected when its ID is
 * present. Consent gating: GA4 + GTM run under Consent Mode (default-denied via
 * the ga-consent-default snippet), while Meta, TikTok, and LinkedIn read the
 * shared consent localStorage key `impronta_analytics_consent` at init time and
 * only load/fire when it is 'granted'.
 *
 * This is a pure SERVER component — it renders only injected <Script> tags and
 * holds NO React hooks or browser APIs at the React level. All runtime / consent
 * / browser logic lives INSIDE the injected `dangerouslySetInnerHTML` strings,
 * which execute in the browser regardless. The `beforeInteractive` strategy on
 * the consent-default snippet requires a Server Component (App Router forbids it
 * in a client component), which is why there is no 'use client' directive. The
 * server resolves all IDs and passes them as plain string props from layout.tsx.
 */
export function AnalyticsScripts({
  gaId: tenantGaId,
  gtmId,
  metaPixelId,
  tiktokPixelId,
  linkedInPartnerId,
}: AnalyticsScriptsProps) {
  // Tenant GA4 wins; platform GA4 is the inherit fallback; null = no GA4. The
  // platform env value is re-sanitized here (the same whitelist + catalog test
  // the resolver applies to tenant ids) so nothing unsafe reaches the raw
  // script-string interpolation below — defense in depth at the boundary.
  const gaId =
    sanitizeAnalyticsId(tenantGaId, GA4_INTEGRATION_KEY, "measurement_id") ||
    sanitizeAnalyticsId(PLATFORM_GA_ID, GA4_INTEGRATION_KEY, "measurement_id");
  const gtm = gtmId?.trim() || null;
  const meta = metaPixelId?.trim() || null;
  const tiktok = tiktokPixelId?.trim() || null;
  const linkedin = linkedInPartnerId?.trim() || null;

  const hasAnyScript = !!(gaId || gtm || meta || tiktok || linkedin);
  if (!hasAnyScript) return null;

  return (
    <>
      {/* ── Consent Mode default (must run before any gtag config / pixel fires) ── */}
      {/* eslint-disable-next-line @next/next/no-before-interactive-script-outside-document -- GA4 consent + gtag ordering */}
      <Script
        id="ga-consent-default"
        strategy="beforeInteractive"
        dangerouslySetInnerHTML={{
          __html: `
(function(){
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  window.gtag = gtag;
  var consent='denied';
  try{
    var s=localStorage.getItem('impronta_analytics_consent');
    if(s==='granted') consent='granted';
  }catch(e){}
  gtag('consent','default',{
    analytics_storage: consent,
    ad_storage: consent,
    ad_user_data: consent,
    ad_personalization: consent,
    wait_for_update: 500
  });
})();`,
        }}
      />

      {/* ── GA4 ────────────────────────────────────────────────────────────────── */}
      {gaId && (
        <>
          <Script
            id="ga-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('js', new Date());
gtag('config', '${gaId}', { send_page_view: true });`,
            }}
          />
          <Script
            id="ga-gtag-src"
            strategy="afterInteractive"
            src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
          />
        </>
      )}

      {/* ── Google Tag Manager ─────────────────────────────────────────────────── */}
      {gtm && (
        <>
          <Script
            id="gtm-init"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${gtm}');`,
            }}
          />
          {/*
           * GTM <noscript> iframe — not injectable via next/script; lives here as
           * a raw element. Intentionally placed after the <Script> tags so the JS
           * path runs first. Consent-gating does not apply to noscript since JS is
           * disabled — GTM's own consent settings govern it.
           */}
        </>
      )}

      {/* ── Meta (Facebook) Pixel ─────────────────────────────────────────────── */}
      {meta && (
        <Script
          id="meta-pixel-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window,document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
(function(){
  var granted=false;
  try{granted=localStorage.getItem('impronta_analytics_consent')==='granted';}catch(e){}
  fbq('consent',granted?'grant':'revoke');
})();
fbq('init','${meta}');
fbq('track','PageView');`,
          }}
        />
      )}

      {/* ── TikTok Pixel ──────────────────────────────────────────────────────── */}
      {tiktok && (
        <Script
          id="tiktok-pixel-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var granted=false;
  try{granted=localStorage.getItem('impronta_analytics_consent')==='granted';}catch(e){}
  if(!granted) return;
  !function(w,d,t){
    w.TiktokAnalyticsObject=t;
    var ttq=w[t]=w[t]||[];
    ttq.methods=['page','track','identify','instances','debug','on','off','once','ready','alias','group','enableCookie','disableCookie'];
    ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
    for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
    ttq.instance=function(t){for(var e=ttq._i[t]||[],n=0;n<ttq.methods.length;n++)ttq.setAndDefer(e,ttq.methods[n]);return e};
    ttq.load=function(e,n){var i='https://analytics.tiktok.com/i18n/pixel/events.js';ttq._i=ttq._i||{};ttq._i[e]=[];ttq._i[e]._u=i;ttq._t=ttq._t||{};ttq._t[e]=+new Date;ttq._o=ttq._o||{};ttq._o[e]=n||{};var o=document.createElement('script');o.type='text/javascript';o.async=!0;o.src=i+'?sdkid='+e+'&lib='+t;var a=document.getElementsByTagName('script')[0];a.parentNode.insertBefore(o,a)};
    ttq.load('${tiktok}');
    ttq.page();
  }(window,document,'ttq');
})();`,
          }}
        />
      )}

      {/* ── LinkedIn Insight Tag ───────────────────────────────────────────────── */}
      {linkedin && (
        <Script
          id="linkedin-insight-init"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `
(function(){
  var granted=false;
  try{granted=localStorage.getItem('impronta_analytics_consent')==='granted';}catch(e){}
  if(!granted) return;
  window._linkedin_partner_id='${linkedin}';
  window._linkedin_data_partner_ids=window._linkedin_data_partner_ids||[];
  window._linkedin_data_partner_ids.push(window._linkedin_partner_id);
  (function(l){if(!l){window.lintrk=function(a,b){window.lintrk.q.push([a,b])};window.lintrk.q=[]}
  var s=document.getElementsByTagName('script')[0];
  var b=document.createElement('script');
  b.type='text/javascript';b.async=true;
  b.src='https://snap.licdn.com/li.lms-analytics/insight.min.js';
  s.parentNode.insertBefore(b,s)})(window.lintrk);
})();`,
          }}
        />
      )}
    </>
  );
}
