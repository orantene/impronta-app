/**
 * Reserved top-level domains (RFC 2606 / RFC 6761). No mail server can exist
 * for them, so a send is a guaranteed hard bounce, and bounces damage the
 * sending domain's reputation. QA and demo accounts live on these domains
 * (e.g. demo talents on @impronta.test), so the sender drops them instead.
 */
const RESERVED_TLDS = ["test", "example", "invalid", "localhost"] as const;

/**
 * Reserved second-level domains (RFC 2606 section 3). They resolve but have no
 * mail server, so Resend rejects them ("Invalid `to` field"). Exact domain or
 * a subdomain of it only; "myexample.com" and "example.com.au" stay deliverable.
 */
const RESERVED_DOMAINS = ["example.com", "example.net", "example.org"] as const;

export function isReservedDomainAddress(address: string): boolean {
  // Accept both "a@b.test" and "Name <a@b.test>".
  const bracketed = address.match(/<([^>]+)>/);
  const email = (bracketed ? bracketed[1] : address).trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at < 0) return false;
  const domain = email.slice(at + 1).replace(/\.$/, "");
  const tld = domain.split(".").pop() ?? "";
  if ((RESERVED_TLDS as readonly string[]).includes(tld)) return true;
  return RESERVED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`));
}

/** Split recipients into deliverable and reserved-domain ones. */
export function partitionReservedRecipients(to: string | string[]): {
  deliverable: string[];
  reserved: string[];
} {
  const list = Array.isArray(to) ? to : [to];
  const deliverable: string[] = [];
  const reserved: string[] = [];
  for (const addr of list) (isReservedDomainAddress(addr) ? reserved : deliverable).push(addr);
  return { deliverable, reserved };
}
