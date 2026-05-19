export type HeaderSocialPlatform =
  | "instagram"
  | "tiktok"
  | "facebook"
  | "youtube"
  | "linkedin"
  | "x";

export type HeaderContactType = "phone" | "email" | "whatsapp";

export type NormalizedHeaderSocialLink = {
  platform: HeaderSocialPlatform;
  href: string;
  label?: string;
};

export type NormalizedHeaderContactLink = {
  type: HeaderContactType;
  value: string;
  label?: string;
};

const SOCIAL_DOMAINS: Record<HeaderSocialPlatform, string[]> = {
  instagram: ["instagram.com"],
  tiktok: ["tiktok.com"],
  facebook: ["facebook.com", "fb.com"],
  youtube: ["youtube.com", "youtu.be"],
  linkedin: ["linkedin.com"],
  x: ["x.com", "twitter.com"],
};

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? "").trim();
  return trimmed.length > 0 ? trimmed : null;
}

function hostMatches(hostname: string, domains: string[]): boolean {
  const host = hostname.toLowerCase().replace(/^www\./, "");
  return domains.some((domain) => host === domain || host.endsWith(`.${domain}`));
}

function parseHttpUrl(
  value: string,
  allowedDomains?: string[],
): URL | null {
  const raw = value.trim();
  if (!raw) return null;
  const hasProtocol = /^https?:\/\//i.test(raw);
  if (!hasProtocol && allowedDomains) {
    const possibleHost = raw.split(/[/?#]/)[0] ?? "";
    if (!hostMatches(possibleHost, allowedDomains)) return null;
  }
  const candidate = hasProtocol ? raw : raw.includes(".") ? `https://${raw}` : raw;
  if (!/^https?:\/\//i.test(candidate)) return null;
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url;
  } catch {
    return null;
  }
}

function handleFromValue(value: string): string | null {
  const handle = value
    .trim()
    .replace(/^@/, "")
    .replace(/^\/+/, "")
    .split(/[?#\s,]/)[0];
  return /^[A-Za-z0-9._-]{2,80}$/.test(handle) ? handle : null;
}

function socialHandleHref(
  platform: HeaderSocialPlatform,
  handle: string,
): string {
  switch (platform) {
    case "instagram":
      return `https://instagram.com/${handle}`;
    case "tiktok":
      return `https://tiktok.com/@${handle}`;
    case "facebook":
      return `https://facebook.com/${handle}`;
    case "youtube":
      return `https://youtube.com/@${handle}`;
    case "linkedin":
      return `https://linkedin.com/company/${handle}`;
    case "x":
      return `https://x.com/${handle}`;
  }
}

export function normalizeHeaderSocialLink(
  platform: HeaderSocialPlatform,
  value: string | null | undefined,
  label?: string,
): NormalizedHeaderSocialLink | null {
  const raw = clean(value);
  if (!raw) return null;

  const url = parseHttpUrl(raw, SOCIAL_DOMAINS[platform]);
  if (url) {
    if (!hostMatches(url.hostname, SOCIAL_DOMAINS[platform])) return null;
    return {
      platform,
      href: url.toString(),
      ...(label ? { label } : {}),
    };
  }

  const handle = handleFromValue(raw);
  if (!handle) return null;
  return {
    platform,
    href: socialHandleHref(platform, handle),
    ...(label ? { label } : {}),
  };
}

function normalizeEmail(value: string): string | null {
  const withoutScheme = value.replace(/^mailto:/i, "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(withoutScheme)
    ? withoutScheme
    : null;
}

function normalizePhone(value: string, { allowPlus }: { allowPlus: boolean }): string | null {
  const withoutScheme = value.replace(/^tel:/i, "").trim();
  const digits = withoutScheme.replace(/\D/g, "");
  if (digits.length < 8) return null;
  return allowPlus && withoutScheme.startsWith("+") ? `+${digits}` : digits;
}

export function normalizeHeaderContactLink(
  type: HeaderContactType,
  value: string | null | undefined,
  label?: string,
): NormalizedHeaderContactLink | null {
  const raw = clean(value);
  if (!raw) return null;

  if (type === "email") {
    const email = normalizeEmail(raw);
    return email ? { type, value: email, ...(label ? { label } : {}) } : null;
  }

  const normalized = normalizePhone(raw, { allowPlus: type === "phone" });
  if (!normalized) return null;
  return {
    type,
    value: normalized,
    ...(label ? { label } : {}),
  };
}

export function headerContactHref(
  type: HeaderContactType,
  value: string,
): string | null {
  const normalized = normalizeHeaderContactLink(type, value);
  if (!normalized) return null;
  if (type === "email") return `mailto:${normalized.value}`;
  if (type === "phone") return `tel:${normalized.value}`;
  return `https://wa.me/${normalized.value}`;
}
