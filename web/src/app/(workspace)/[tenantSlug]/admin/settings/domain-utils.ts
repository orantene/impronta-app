export type NormalizedCustomDomainResult =
  | { ok: true; hostname: string }
  | { ok: false; message: string };

export type WorkspaceSubdomainHost = {
  hostname: string;
  isPrimary: boolean;
};

const RESERVED_CUSTOM_DOMAIN_SUFFIXES = [
  ".tulala.digital",
  ".studiobooking.io",
] as const;

const RESERVED_CUSTOM_DOMAIN_HOSTS = new Set([
  "tulala.digital",
  "www.tulala.digital",
  "app.tulala.digital",
  "staging.tulala.digital",
]);

function isValidHostnameLabel(label: string): boolean {
  if (!label || label.length > 63) return false;
  if (label.startsWith("-") || label.endsWith("-")) return false;
  return /^[a-z0-9-]+$/i.test(label);
}

export function normalizeCustomDomainHostname(input: string): NormalizedCustomDomainResult {
  const trimmed = input.trim();
  if (!trimmed) {
    return { ok: false, message: "Enter a domain to continue." };
  }
  if (/\s/.test(trimmed)) {
    return { ok: false, message: "Domains cannot contain spaces." };
  }

  let url: URL;
  try {
    const candidate =
      trimmed.includes("://") || trimmed.startsWith("//")
        ? trimmed
        : `https://${trimmed}`;
    url = new URL(candidate);
  } catch {
    return { ok: false, message: "Enter a valid domain like example.com." };
  }

  // Node's URL parser applies ICU-based IDNA encoding, so non-ASCII
  // Unicode labels (e.g. tülala.digital) are converted to their Punycode
  // form (xn--tlala-z3a.digital) automatically. Re-parse via the URL
  // constructor to get the ICU-normalised hostname — this is the H1 IDN/
  // Punycode fix that prevents homograph bypass of is_reserved_platform_hostname.
  let parsedHostname: string;
  try {
    parsedHostname = new URL(`https://${url.hostname}`).hostname;
  } catch {
    return { ok: false, message: "Enter a valid domain like example.com." };
  }

  const hostname = parsedHostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!hostname || hostname === "localhost") {
    return { ok: false, message: "Use a real hostname instead of localhost." };
  }
  if (!hostname.includes(".")) {
    return { ok: false, message: "Domains need at least one dot, like example.com." };
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return { ok: false, message: "IP addresses cannot be used as custom domains." };
  }

  // Reject any hostname that still contains non-ASCII after ICU normalisation.
  // This catches cases where the URL parser accepted input but produced a
  // label that isn't a valid ASCII hostname (parse failure silent path).
  if (/[^\x00-\x7F]/.test(hostname)) {
    return { ok: false, message: "Enter a valid domain like example.com." };
  }

  const labels = hostname.split(".");
  if (!labels.every(isValidHostnameLabel)) {
    return { ok: false, message: "That domain contains an invalid hostname label." };
  }

  if (
    RESERVED_CUSTOM_DOMAIN_HOSTS.has(hostname) ||
    RESERVED_CUSTOM_DOMAIN_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  ) {
    return {
      ok: false,
      message: "That host is reserved by Tulala. Use your own brand domain.",
    };
  }

  return { ok: true, hostname };
}

export function pickFallbackSubdomainHostname(
  rows: WorkspaceSubdomainHost[],
): string | null {
  return (
    rows.find((row) => row.isPrimary)?.hostname
    ?? rows.find((row) => row.hostname.endsWith(".tulala.digital"))?.hostname
    ?? rows.find((row) => row.hostname.endsWith(".lvh.me"))?.hostname
    ?? rows.find((row) => row.hostname.endsWith(".local"))?.hostname
    ?? rows.find((row) => row.hostname.endsWith(".studiobooking.io"))?.hostname
    ?? rows[0]?.hostname
    ?? null
  );
}
