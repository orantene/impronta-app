import type { NextConfig } from "next";
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
    remotePatterns = [
      {
        protocol: "https",
        hostname: host,
        pathname: "/storage/v1/object/public/**",
      },
    ];
  } catch {
    /* ignore invalid URL */
  }
}

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

function contentSecurityPolicy(): string {
  const googleTag = "https://www.googletagmanager.com https://www.google-analytics.com";
  const directives = [
    "default-src 'self'",
    isProd
      ? `script-src 'self' 'unsafe-inline' ${googleMapsCsp.script} ${googleTag}`
      : `script-src 'self' 'unsafe-inline' 'unsafe-eval' ${googleMapsCsp.script} ${googleTag}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' data: https://fonts.gstatic.com",
    `img-src 'self' data: blob: https: https://www.google-analytics.com`,
    `connect-src ${connectSrcDirectives().join(" ")} ${googleMapsCsp.connect} ${googleTag} https://*.google-analytics.com https://*.analytics.google.com https://analytics.google.com`,
    `frame-src ${googleMapsCsp.frameSrc}`,
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
  images: {
    remotePatterns,
  },
  allowedDevOrigins: [
    "marketing.local",
    "app.local",
    "hub.local",
    "impronta.local",
    "nova.local",
    "midnight.local",
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
  /** Common typo: inqueries → inquiries */
  async redirects() {
    return [
      {
        source: "/talent/inqueries",
        destination: "/talent/inquiries",
        permanent: false,
      },
      {
        source: "/talent/inqueries/:path*",
        destination: "/talent/inquiries/:path*",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
