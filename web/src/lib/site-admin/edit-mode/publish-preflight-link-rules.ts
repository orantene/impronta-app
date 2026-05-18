export type PreflightSeverity = "error" | "warn";

export interface LinkCandidate {
  path: string;
  href: string;
}

function looksLikeLinkKey(key: string): boolean {
  const normalized = key.trim().toLowerCase();
  return (
    normalized === "href" ||
    normalized === "url" ||
    normalized.endsWith("href") ||
    normalized.endsWith("url") ||
    normalized.endsWith("link")
  );
}

export function collectLinkCandidates(
  value: unknown,
  path: string = "props",
  out: LinkCandidate[] = [],
  underLinkKey: boolean = false,
): LinkCandidate[] {
  if (typeof value === "string") {
    // Only a string reached via a link-like key (href/url/link) is a link.
    // Without this gate, every string inside a non-link array/object (e.g.
    // featured_talent.manualProfileCodes — talent codes, never rendered as
    // anchors) gets URL-validated and hard-blocks publish.
    if (underLinkKey) out.push({ path, href: value });
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      collectLinkCandidates(entry, `${path}[${index}]`, out, underLinkKey),
    );
    return out;
  }
  if (!value || typeof value !== "object") return out;
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    collectLinkCandidates(
      nested,
      `${path}.${key}`,
      out,
      looksLikeLinkKey(key),
    );
  }
  return out;
}

export function classifyHrefIssue(hrefRaw: string): {
  severity: PreflightSeverity;
  message: string;
} | null {
  const href = hrefRaw.trim();
  if (!href) return null;
  const lower = href.toLowerCase();
  if (lower.startsWith("javascript:") || lower.startsWith("data:")) {
    return {
      severity: "error",
      message: `Unsafe link "${href}" uses a blocked protocol.`,
    };
  }
  if (
    href.startsWith("/") ||
    href.startsWith("#") ||
    lower.startsWith("mailto:") ||
    lower.startsWith("tel:")
  ) {
    return null;
  }

  let parsed: URL;
  try {
    parsed = new URL(href);
  } catch {
    return {
      severity: "error",
      message: `Link "${href}" is not a valid URL.`,
    };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return {
      severity: "error",
      message: `Link "${href}" uses unsupported protocol "${parsed.protocol}".`,
    };
  }
  if (parsed.protocol === "http:") {
    return {
      severity: "warn",
      message: `Link "${href}" uses http. Prefer https for publish.`,
    };
  }
  return null;
}

export function classifyCanonicalIssue(input: {
  canonicalUrl: string | null;
  noindex: boolean;
}): ReadonlyArray<{ severity: PreflightSeverity; message: string }> {
  const issues: Array<{ severity: PreflightSeverity; message: string }> = [];
  if (!input.canonicalUrl) return issues;

  const canonical = input.canonicalUrl.trim();
  if (!canonical) return issues;
  let parsed: URL;
  try {
    parsed = new URL(canonical);
  } catch {
    issues.push({
      severity: "error",
      message: `Canonical URL "${canonical}" is invalid.`,
    });
    return issues;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    issues.push({
      severity: "error",
      message: `Canonical URL uses unsupported protocol "${parsed.protocol}".`,
    });
  }
  if (parsed.protocol === "http:") {
    issues.push({
      severity: "warn",
      message: "Canonical URL uses http. Prefer https for production SEO.",
    });
  }
  if (parsed.hash) {
    issues.push({
      severity: "warn",
      message: "Canonical URL includes a hash fragment. Canonicals should usually be clean URLs.",
    });
  }
  if (input.noindex) {
    issues.push({
      severity: "warn",
      message: "Page is marked noindex while canonical URL is set. Confirm indexing intent.",
    });
  }
  return issues;
}
