/**
 * SmartImage — `<Image>` when the URL host is known to the Next.js image
 * optimizer (so Vercel can transcode + cache it), plain `<img>` otherwise.
 *
 * The editorial section primitives intentionally accept arbitrary URLs (a
 * site admin can paste an Unsplash link into a hero). Wrapping every such
 * `<img>` in `<Image>` would throw at runtime for hosts not listed in
 * `next.config.ts` -> `images.remotePatterns`. SmartImage routes only the
 * URLs we own (Supabase Storage + dev placeholders) through the optimizer
 * — those are the ones blowing up Supabase egress.
 *
 * Egress impact: every Supabase-hosted image rendered through this wrapper
 * gets AVIF/WebP transcode + 60-day Vercel edge cache (per next.config
 * `images.minimumCacheTTL`) instead of a per-request Supabase Storage
 * round-trip at full resolution.
 */
import Image from "next/image";
import type { CSSProperties } from "react";

const KNOWN_HOSTS = (() => {
  const set = new Set<string>(["i.pravatar.cc"]);
  const supa = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (supa) {
    try {
      set.add(new URL(supa).hostname);
    } catch {
      /* ignore */
    }
  }
  return set;
})();

function isOptimizable(src: string | null | undefined): boolean {
  if (!src) return false;
  if (src.startsWith("/")) return true; // same-origin static
  try {
    return KNOWN_HOSTS.has(new URL(src).hostname);
  } catch {
    return false;
  }
}

export interface SmartImageProps {
  src: string | null | undefined;
  alt: string;
  /** Use with a positioned parent (relative/absolute). Mirrors Next/Image's `fill`. */
  fill?: boolean;
  /** Explicit dimensions — required when `fill` is not set. */
  width?: number;
  height?: number;
  /** Responsive `sizes` hint — drives which transcoded variant the optimizer picks. */
  sizes?: string;
  /** Image loading. Default "lazy"; pass "eager" for above-the-fold hero. */
  loading?: "lazy" | "eager";
  /** Defaults to false; set true for LCP candidates. */
  priority?: boolean;
  className?: string;
  style?: CSSProperties;
  /** Falls through to the underlying tag. */
  draggable?: boolean;
}

export function SmartImage({
  src,
  alt,
  fill,
  width,
  height,
  sizes,
  loading = "lazy",
  priority,
  className,
  style,
  draggable,
}: SmartImageProps) {
  if (!src) return null;

  if (isOptimizable(src)) {
    if (fill) {
      return (
        <Image
          src={src}
          alt={alt}
          fill
          sizes={sizes ?? "100vw"}
          priority={priority}
          loading={priority ? undefined : loading}
          className={className}
          style={style}
          draggable={draggable}
        />
      );
    }
    return (
      <Image
        src={src}
        alt={alt}
        width={width ?? 800}
        height={height ?? 1000}
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : loading}
        className={className}
        style={style}
        draggable={draggable}
      />
    );
  }

  // Unknown host (CMS author pasted an external link) — fall back to plain
  // `<img>` so we don't crash. These bypass the optimizer; that's an
  // accepted trade-off until/unless we add a server-side rehoster.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={loading}
      decoding="async"
      className={className}
      style={style}
      draggable={draggable}
      width={width}
      height={height}
    />
  );
}
