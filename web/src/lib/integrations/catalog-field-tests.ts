/**
 * catalog-field-tests — offline plausibility checks for integration fields.
 *
 * Split out of `catalog.ts` (which sits at its 800-line budget) as a pure
 * leaf module: these are shape guards against a blank or obviously-wrong
 * paste, NOT authenticity checks against the provider. The only import is
 * the result TYPE, so there is no runtime edge back to the catalog.
 */

import type { IntegrationFieldTestResult } from "./catalog";

/**
 * Lightweight Maps-key plausibility check. Google Maps browser keys are ~39
 * chars and conventionally start with "AIza". We accept the "AIza" shape but
 * also tolerate other non-empty keys (Google has issued other prefixes) — this
 * is a guard against blank/obviously-wrong paste, NOT an authenticity check.
 * TODO(phase-later): real live validation via a Maps JS / Places probe call.
 */
export function testGoogleMapsApiKey(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 20) return { ok: false, reason: "implausible_length" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  return { ok: true };
}

/**
 * Offline format checks for the PUBLIC analytics identifiers. These are
 * plausibility/shape gates, NOT live API calls — they catch a wrong-id-type
 * paste (e.g. a GTM container id pasted into the GA4 field) before we write it
 * to config_json. All inputs are trimmed first.
 */

/** GA4 Measurement ID — "G-" + alphanumerics (e.g. G-XXXXXXXXXX). */
export function testGa4MeasurementId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^G-[A-Z0-9]+$/.test(v)) return { ok: false, reason: "expected_G-XXXX" };
  return { ok: true };
}

/** GTM container ID — "GTM-" + alphanumerics (e.g. GTM-XXXXXXX). */
export function testGtmContainerId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^GTM-[A-Z0-9]+$/.test(v)) return { ok: false, reason: "expected_GTM-XXXX" };
  return { ok: true };
}

/** Meta (Facebook) Pixel ID — a numeric string, typically 15-16 digits. */
export function testMetaPixelId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^\d{8,20}$/.test(v)) return { ok: false, reason: "expected_numeric_id" };
  return { ok: true };
}

/** TikTok Pixel ID — alphanumeric handle (e.g. C4A1B2C3D4E5...). */
export function testTikTokPixelId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^[A-Z0-9]{10,40}$/i.test(v)) return { ok: false, reason: "expected_alnum_id" };
  return { ok: true };
}

/** LinkedIn Insight Tag — numeric Partner ID. */
export function testLinkedInPartnerId(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (!/^\d{4,12}$/.test(v)) return { ok: false, reason: "expected_numeric_id" };
  return { ok: true };
}

/**
 * Google Search Console verification token — the value of the `content="…"`
 * attribute of the `google-site-verification` meta tag. Google's tokens are
 * ~43-char URL-safe base64 (`[A-Za-z0-9_-]`); we accept 20-100 of those chars.
 * We deliberately REJECT a pasted full `<meta>` tag (angle brackets / spaces):
 * the generic config writer stores the value verbatim into the emitted meta
 * tag, so the tenant must paste ONLY the token, not the whole snippet.
 */
export function testGoogleSiteVerificationToken(
  value: string,
): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (/[<>\s]/.test(v)) return { ok: false, reason: "paste_token_only" };
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(v)) {
    return { ok: false, reason: "expected_verification_token" };
  }
  return { ok: true };
}

/**
 * Captcha site key (PUBLIC) — hCaptcha keys look like a UUID; Turnstile keys
 * start with "0x". We accept both shapes (and any other non-empty token without
 * whitespace) as a plausibility gate — this guards against a blank/garbled paste,
 * not authenticity.
 */
export function testCaptchaSiteKey(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 8) return { ok: false, reason: "implausible_length" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  return { ok: true };
}

/** Captcha secret key (SECRET → vault). Same offline plausibility gate. */
export function testCaptchaSecretKey(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v.length < 8) return { ok: false, reason: "implausible_length" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  return { ok: true };
}

/** Captcha provider — one of the two supported values. */
export function testCaptchaProvider(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  if (v !== "hcaptcha" && v !== "turnstile") {
    return { ok: false, reason: "expected_hcaptcha_or_turnstile" };
  }
  return { ok: true };
}

/**
 * Sending domain (or sub-domain) — a bare hostname like `mail.example.com`.
 * No scheme, no path, at least one dot. Plausibility gate only.
 */
export function testEmailDomain(value: string): IntegrationFieldTestResult {
  const v = value.trim().toLowerCase();
  if (!v) return { ok: false, reason: "empty" };
  if (/\s/.test(v)) return { ok: false, reason: "contains_whitespace" };
  if (/^https?:\/\//.test(v) || v.includes("/") || v.includes("@")) {
    return { ok: false, reason: "expected_bare_hostname" };
  }
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) {
    return { ok: false, reason: "expected_hostname" };
  }
  return { ok: true };
}

/**
 * YouTube channel URL or @handle — plausibility gate for the manual fallback
 * field. Accepts a bare @handle / handle (2-80 chars) or any youtube.com /
 * youtu.be URL. The one-click OAuth path supplies the verified channel; this
 * gate only guards the manual paste.
 */
export function testYouTubeProfileUrl(value: string): IntegrationFieldTestResult {
  const v = value.trim();
  if (!v) return { ok: false, reason: "empty" };
  const handle = v.replace(/^@/, "");
  if (/^[A-Za-z0-9._-]{2,80}$/.test(handle)) return { ok: true };
  try {
    const url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    if (host === "youtube.com" || host.endsWith(".youtube.com") || host === "youtu.be") {
      return { ok: true };
    }
  } catch {
    // Fall through to the shape error below.
  }
  return { ok: false, reason: "expected_youtube_url_or_handle" };
}
