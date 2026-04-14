import Script from "next/script";

const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();

/**
 * GA4 via gtag.js with Consent Mode defaults read from `localStorage` on first paint
 * (`impronta_analytics_consent`: granted | denied). First-time visitors default to denied until
 * the user accepts in {@link AnalyticsConsentBanner}.
 */
export function AnalyticsScripts() {
  if (!gaId) return null;

  return (
    <>
      {/* Consent default must run before gtag config. */}
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
  );
}
