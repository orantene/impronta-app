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

// Talent featured-media safe embeds (lib/talent-integrations/media-embed.ts).
// YouTube/Vimeo are already covered by builderEmbedCsp; Spotify + SoundCloud
// players need their own frame-src hosts.
const talentMediaEmbedCsp = {
  frame: "https://open.spotify.com https://w.soundcloud.com",
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
      ? `script-src 'self' 'unsafe-inline' ${googleMapsCsp.script} ${stripeCsp.script} ${googleTag} ${captchaScript} ${vercelInsights}`
      : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${googleMapsCsp.script} ${stripeCsp.script} ${googleTag} ${captchaScript} ${vercelInsights}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https: https://www.google-analytics.com`,
    `connect-src ${connectSrcDirectives().join(" ")} ${googleMapsCsp.connect} ${stripeCsp.connect} ${googleTag} ${captchaConnect} https://*.google-analytics.com https://*.analytics.google.com https://analytics.google.com ${vercelInsights} https://*.sentry.io`,
    `frame-src ${googleMapsCsp.frameSrc} ${stripeCsp.frame} ${builderEmbedCsp.frame} ${captchaFrame} ${talentMediaEmbedCsp.frame}`,
    /** Maps workers use blob: URLs */
    "worker-src blob:",
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
   *  /talent/inbox; there is no /talent/inquiries route — it 404s). */
  async redirects() {
    return [
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

export default withSentryConfig(nextConfig, {
  org: "tulala-digital",
  project: "javascript-nextjs",
  silent: !process.env.CI,
  webpack: {
    reactComponentAnnotation: { enabled: true },
    automaticVercelMonitors: true,
  },
});
