import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/** Hoisted Radix package root (absolute), for webpack. */
const radixReactIdRoot = path.resolve(
  path.dirname(require.resolve("@radix-ui/react-id")),
  "..",
);

/**
 * Turbopack `resolveAlias` must be project-relative; absolute paths are broken
 * (see Next "server relative imports" module-not-found).
 */
const radixReactIdTurbopackAlias =
  "./" +
  path.relative(process.cwd(), radixReactIdRoot).replaceAll("\\", "/");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;

let remotePatterns: NonNullable<
  NonNullable<NextConfig["images"]>["remotePatterns"]
> = [];

if (supabaseUrl) {
  try {
    const host = new URL(supabaseUrl).hostname;
    // Allow both public objects and short-lived signed URLs (private docs, gated
     // media). Without the sign pattern, next/image silently 400s on signed URLs.
    remotePatterns = [
      {
        protocol: "https",
        hostname: host,
        pathname: "/storage/v1/object/public/**",
      },
      {
        protocol: "https",
        hostname: host,
        pathname: "/storage/v1/object/sign/**",
      },
    ];
  } catch {
    /* ignore invalid URL */
  }
}

// Discover test seed — pravatar.cc serves placeholder talent photos for
// is_discoverable=true talents that haven't uploaded a real card variant
// yet. Production talents will use Supabase storage; allow-list this so
// next/image renders the dev catalog without throwing
// "hostname not configured" errors that crash the surface.
remotePatterns.push({
  protocol: "https",
  hostname: "i.pravatar.cc",
  pathname: "/**",
});

// Editorial placeholder imagery for the freeform builder designs (e.g. the
// Impronta discipline rail) until first-party agency photography is licensed.
// Allow-listed so the freeform renderer's P4-IMAGEOPT srcset can route these
// through the Next image optimizer instead of shipping full-size originals.
remotePatterns.push({
  protocol: "https",
  hostname: "images.unsplash.com",
  pathname: "/**",
});

const isProd = process.env.NODE_ENV === "production";

/**
 * CSP connect-src: Supabase REST, Auth, and Realtime from the browser.
 * - Always allow hosted project hosts (`*.supabase.co`).
 * - Also inject `NEXT_PUBLIC_SUPABASE_URL` origin (and matching ws/wss) so local
 *   CLI (`http://127.0.0.1:54321`) and custom Supabase domains work.
 * Google OAuth uses a separate popup window; that document is not governed by
 * this page CSP. postMessage back to the app is same-origin.
 */
function connectSrcDirectives(): string[] {
  const origins = new Set<string>([
    "'self'",
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ]);
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      origins.add(`${u.protocol}//${u.host}`);
      if (u.protocol === "https:") {
        origins.add(`wss://${u.host}`);
      }
      if (u.protocol === "http:") {
        origins.add(`ws://${u.host}`);
      }
    } catch {
      /* ignore invalid env */
    }
  }
  return [...origins];
}

/**
 * CSP media-src: where a `<video>` / `<audio>` element may load bytes from.
 *
 * Tenant media lives in Supabase storage, so the hosted-project wildcard plus
 * the configured project origin are both required. `blob:` covers a locally
 * previewed object URL (the upload field shows the file before it is stored)
 * and `data:` covers tiny inline placeholder clips. Deliberately NOT a blanket
 * `https:` the way `img-src` is: images already come from arbitrary CDNs across
 * this product, video does not, and keeping this list short means an
 * exfiltration-by-media-fetch has nowhere to point.
 */
function mediaSrcDirectives(): string[] {
  const origins = new Set<string>([
    "'self'",
    "blob:",
    "data:",
    "https://*.supabase.co",
  ]);
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (raw) {
    try {
      const u = new URL(raw);
      origins.add(`${u.protocol}//${u.host}`);
    } catch {
      /* ignore invalid env */
    }
  }
  return [...origins];
}

/**
 * Maps JavaScript API — allowlist CSP aligned with Google’s guidance:
 * https://developers.google.com/maps/documentation/javascript/content-security-policy
 * (narrow script/connect was causing partial loads / console CSP violations.)
 */
const googleMapsCsp = {
  script:
    "https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.ggpht.com https://*.googleusercontent.com blob:",
  connect:
    "https://*.googleapis.com https://*.google.com https://*.gstatic.com https://maps.googleapis.com data: blob:",
  frameSrc: "'self' https://*.google.com",
};

/**
 * Stripe — covers BOTH Stripe.js (embedded Payment Element checkout in
 * Messages) AND Connect.js embedded components (talent/workspace payout
 * onboarding). Without these the SDKs are silently blocked:
 * `loadStripe`/`loadConnectAndInitialize` reject with "Failed to load …"
 * and the iframes never mount. `js.stripe.com` ≠ `*.js.stripe.com` (the
 * wildcard doesn't match the bare host), so both are listed.
 * Per https://docs.stripe.com/connect/get-started-connect-embedded-components#csp
 */
const stripeCsp = {
  script: "https://js.stripe.com https://connect-js.stripe.com https://*.js.stripe.com",
  connect:
    "https://api.stripe.com https://connect-js.stripe.com https://*.js.stripe.com https://merchant-ui-api.stripe.com",
  frame:
    "https://js.stripe.com https://connect-js.stripe.com https://*.js.stripe.com https://hooks.stripe.com",
};

const builderEmbedCsp = {
  frame:
    "https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://calendly.com https://*.calendly.com",
};

// Instagram / TikTok post embeds (lib/social-embed/social-post-url.ts). Both
// providers hydrate a <blockquote> from their own embed.js, so each needs a
// script-src AND a frame-src host. A missing directive fails SILENTLY — the
// blockquote simply never hydrates and the block renders blank.
const socialPostCsp = {
  script: "https://www.instagram.com https://www.tiktok.com",
  frame: "https://www.instagram.com https://www.tiktok.com",
};

// Talent featured-media safe embeds (lib/talent-integrations/media-embed.ts).
// YouTube/Vimeo are already covered by builderEmbedCsp; Spotify + SoundCloud
// players need their own frame-src hosts.
const talentMediaEmbedCsp = {
  frame: "https://open.spotify.com https://w.soundcloud.com",
};

// Tenant tracking connections (Website → Setup → Tracking, lib/site-admin/
// tracking.ts). A provider whose host is missing here is not "degraded" — the
// browser blocks the tag outright and the tenant sees an admin screen that says
// "connected" while no data is ever collected. So the two lists are paired by a
// test: `lib/site-admin/tracking.test.ts` reads THIS FILE and asserts every host
// declared on a provider spec appears in the directive it needs.
//
// Google Analytics 4 and Google Tag Manager needed NOTHING new:
// www.googletagmanager.com and www.google-analytics.com were already in
// script-src and connect-src for the platform's own tag. The three hosts below
// are the additions this PR makes, each a single exact origin, no wildcards:
//
//   • connect.facebook.net  (script-src)  — Meta pixel's fbevents.js loader.
//   • www.facebook.com      (connect-src) — where fbevents.js posts events.
//     img-src already allows `https:`, so the <img> fallback needed nothing.
//   • plausible.io          (script + connect) — Plausible's script and the
//     /api/event endpoint it beacons to. Hosted plausible.io only; a
//     self-hosted instance would mean a per-tenant policy host, which is
//     deliberately not offered.
//
// NOT added, and why: www.googletagmanager.com in `frame-src`. Google's GTM
// snippet has a <noscript> iframe half, which is not emitted — a visitor with
// JavaScript off cannot run any of these providers anyway, so widening the
// frame policy for every tenant and the platform hub would buy nothing.
const tenantTrackingCsp = {
  script: "https://connect.facebook.net https://plausible.io",
  connect: "https://www.facebook.com https://plausible.io",
};

function contentSecurityPolicy(): string {
  const googleTag = "https://www.googletagmanager.com https://www.google-analytics.com";
  // Tenant captcha integrations (hCaptcha + Cloudflare Turnstile). The widget
  // script + iframe + the browser-side siteverify XHR must be allow-listed or
  // the storefront contact-form captcha is silently blocked.
  const captchaScript = "https://js.hcaptcha.com https://challenges.cloudflare.com";
  const captchaFrame = "https://newassets.hcaptcha.com https://challenges.cloudflare.com";
  const captchaConnect = "https://hcaptcha.com https://*.hcaptcha.com https://challenges.cloudflare.com";
  // @vercel/analytics + @vercel/speed-insights load scripts from va.vercel-scripts.com
  // and beacon to vitals.vercel-insights.com. Without these directives the
  // packages are silently blocked by CSP and never report — the Vercel dashboard
  // shows "Not Enabled" even though the React components are mounted.
  const vercelInsights = "https://va.vercel-scripts.com https://vitals.vercel-insights.com";
  const directives = [
    "default-src 'self'",
    isProd
      ? `script-src 'self' 'unsafe-inline' ${googleMapsCsp.script} ${stripeCsp.script} ${googleTag} ${captchaScript} ${vercelInsights} ${socialPostCsp.script} ${tenantTrackingCsp.script}`
      : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${googleMapsCsp.script} ${stripeCsp.script} ${googleTag} ${captchaScript} ${vercelInsights} ${socialPostCsp.script} ${tenantTrackingCsp.script}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https: https://www.google-analytics.com`,
    // `media-src` governs <video>/<audio> src. It was ABSENT until 2026-08-17,
    // which means it fell back to `default-src 'self'` and every cross-origin
    // video was blocked by the browser: the `video` builder node, the
    // `video_reel` section and the section-presentation video background all
    // point at Supabase storage, so all three were silently dead on any page
    // that served them. `connect-src` already lists the same origins but does
    // NOT govern a media element, which is why the hole survived. Mirrors
    // `connectSrcDirectives()` so a custom / local Supabase host works too.
    `media-src ${mediaSrcDirectives().join(" ")}`,
    `connect-src ${connectSrcDirectives().join(" ")} ${googleMapsCsp.connect} ${stripeCsp.connect} ${googleTag} ${captchaConnect} https://*.google-analytics.com https://*.analytics.google.com https://analytics.google.com ${vercelInsights} https://*.sentry.io ${tenantTrackingCsp.connect}`,
    `frame-src ${googleMapsCsp.frameSrc} ${stripeCsp.frame} ${builderEmbedCsp.frame} ${captchaFrame} ${talentMediaEmbedCsp.frame} ${socialPostCsp.frame}`,
    /** Maps workers use blob: URLs; service worker needs 'self'. */
    "worker-src 'self' blob:",
    "frame-ancestors 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ];
  return directives.join("; ");
}

const securityHeaders: { key: string; value: string }[] = [
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy() },
];

if (isProd) {
  securityHeaders.push({
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  });
}

const nextConfig: NextConfig = {
  /**
   * Skip the integrated `next build` type-check. Under Next 16.2.3 (Turbopack)
   * this phase intermittently HANGS on Vercel's build machines after a clean
   * compile — the log freezes at "Running TypeScript ..." and the deploy is
   * killed by the 45-minute build timeout (observed across multiple branches).
   * Type-safety is NOT lost: CI (`ci.yml` Gate 1) runs `npx tsc --noEmit` with
   * a zero-error baseline on every PR to `main`, and `main` is the only branch
   * that builds production — so type-error code can never reach a prod build.
   */
  typescript: {
    ignoreBuildErrors: true,
  },
  /**
   * The talent media-kit PDF embeds a Noto Sans subset so Cyrillic/Greek names
   * render instead of degrading to `?`. `src/lib/talent/media-kit-font.ts`
   * `readFile`s those `.ttf`s at request time, and Next's tracer only follows
   * `import`s — a runtime path string is invisible to it, so without this entry
   * the files simply are not in the serverless Function and every kit silently
   * falls back to Helvetica. Listing them copies them into the Function with
   * their path relative to this project root preserved, which is what the
   * loader's `process.cwd()`-based lookup expects.
   */
  outputFileTracingIncludes: {
    "/api/talent/media-kit": ["./src/lib/talent/fonts/*.ttf"],
  },
  /**
   * Opt into Next.js' integration with React's `<ViewTransition>` component
   * (https://react.dev/reference/react/ViewTransition). Enabling this is
   * harmless on its own — it only takes effect where content is wrapped
   * with `<ViewTransition>`. The editor's locale switcher already animates
   * via the browser-native `document.startViewTransition` API; this flag
   * prepares the codebase to opt admin/storefront routes into declarative
   * React-managed transitions without another config flip.
   */
  experimental: {
    viewTransition: true,
    // Vercel Skew Protection (`skewProtection: true`) is injected just below the
    // `experimental` block via a typed augmentation, not inline here: this Next
    // version's `ExperimentalConfig` is a closed interface without the key, so an
    // inline literal would fail `tsc`. See the long note at the assignment site.
    /**
     * Talent/agency photo uploads POST the image to a Server Action. Next's
     * default Server Action body limit is 1 MB, which silently rejected real
     * profile photos with "Body exceeded 1 MB limit" — surfaced on the client
     * as the opaque "An unexpected response was received from the server."
     * Raise to 4 MB, kept just under Vercel's ~4.5 MB serverless body cap so
     * the boundary is the platform's, not an arbitrarily-lower app default.
     */
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
  images: {
    remotePatterns,
    // Talent photos are content-addressed (storage key changes on re-upload), so
    // hold optimized variants at the edge for 60 days. Cuts repeated billable
    // transforms on the Vercel Image Optimization meter ~95%.
    minimumCacheTTL: 60 * 60 * 24 * 60,
    // Prefer AVIF (smaller) with WebP fallback. Default order is reversed; AVIF
    // first gives mobile clients the smaller asset when supported.
    formats: ["image/avif", "image/webp"],
  },
  allowedDevOrigins: [
    "marketing.local",
    "app.local",
    "hub.local",
    "impronta.local",
    "nova.local",
    "midnight.local",
    "lvh.me",
    "impronta.lvh.me",
    "app.lvh.me",
    // Local-host-proxy QA harness (scripts/local-host-proxy.mjs): the browser
    // connects to localhost:<port> while the proxy forwards the real Host. Next
    // dev's cross-origin guard otherwise blocks the proxied /_next assets + HMR,
    // so the page renders but never hydrates (every button inert). See
    // web/docs/dev-qa-3-surfaces.md.
    "localhost",
    "127.0.0.1",
    "tulala.digital",
    "app.tulala.digital",
  ],
  /**
   * npm often hoists `@radix-ui/react-id` to the app root while other
   * `@radix-ui/*` deps stay nested under `@radix-ui/react-dialog`. Bundlers can
   * then resolve a non-existent nested path (ENOENT on dist/index.mjs). Pin the
   * package root for both Turbopack (default `next build`) and webpack (`dev
   * --webpack`).
   */
  turbopack: {
    resolveAlias: {
      "@radix-ui/react-id": radixReactIdTurbopackAlias,
    },
  },
  webpack: (config) => {
    const prev = config.resolve?.alias;
    const base =
      prev && typeof prev === "object" && !Array.isArray(prev)
        ? prev
        : {};
    config.resolve = config.resolve ?? {};
    config.resolve.alias = {
      ...base,
      "@radix-ui/react-id": radixReactIdRoot,
    };
    return config;
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  /** Common typo: inqueries → the talent inbox (the talent inquiry surface is
   *  /talent/inbox; there is no /talent/inquiries route — it 404s).
   *
   *  Plus the Commerce consolidation: Pricing and Stripe health became tabs of
   *  /platform/admin/commerce. `permanent: false` on purpose — the consolidation
   *  is still in flight (Billing folds in next), and a 308 would be cached by
   *  every admin's browser long after the shape settles. */
  async redirects() {
    return [
      {
        source: "/platform/admin/pricing",
        destination: "/platform/admin/commerce?tab=catalog",
        permanent: false,
      },
      {
        source: "/platform/admin/stripe-health",
        destination: "/platform/admin/commerce?tab=health",
        permanent: false,
      },
      {
        source: "/talent/inqueries",
        destination: "/talent/inbox",
        permanent: false,
      },
      {
        source: "/talent/inqueries/:path*",
        destination: "/talent/inbox/:path*",
        permanent: false,
      },
      {
        source: "/talent/inquiries",
        destination: "/talent/inbox",
        permanent: false,
      },
      {
        source: "/talent/inquiries/:path*",
        destination: "/talent/inbox/:path*",
        permanent: false,
      },
    ];
  },
};

/**
 * Vercel Skew Protection. After a new deploy ships, an already-loaded client can
 * still hold the previous build's chunks / Server-Action ids; a mismatched
 * client/server pair produced a recoverable React #310 hydration crash on the
 * client message surface in prod (see incident_client_310_hydration). Skew
 * Protection pins each client to the deployment it loaded so requests resolve
 * against matching assets/functions until the user reloads.
 *
 * KEY CAVEAT — read before "fixing" this:
 * Next 16.2.3 has NO `skewProtection` config key. Verified against this version's
 * node_modules: `config-schema.js` (runtime validation) and the `ExperimentalConfig`
 * interface in `config-shared.d.ts` expose only top-level `deploymentId` and
 * `experimental.useSkewCookie` — there is no `skewProtection` anywhere, and
 * `ExperimentalConfig` is a closed interface (no index signature), so an inline
 * `experimental: { skewProtection: true }` literal fails `tsc` with an
 * excess-property error. We therefore assign it through a typed augmentation so
 * the central `tsc --noEmit` gate stays green.
 *
 * Next's own unknown-key handling treats this as a NON-FATAL warning, so it will
 * not break the build — but on a plain `next build` it is effectively a no-op.
 * The REAL enablement lives in the Vercel project dashboard
 * (Settings → Advanced → Skew Protection), where Vercel wires the deployment id
 * automatically. This flag is the documented "common form" and is kept here so
 * (a) intent is colocated with the build config and (b) it is picked up
 * automatically if/when Next promotes it to a first-class option. If you are
 * enabling this for real, ALSO flip it in the Vercel dashboard.
 */
(nextConfig.experimental as Record<string, unknown>).skewProtection = true;

export default withSentryConfig(nextConfig, {
  org: "tulala-digital",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  webpack: {
    reactComponentAnnotation: { enabled: true },
    automaticVercelMonitors: true,
  },
});
