/**
 * Stable codes for the custom-domain action outcomes (TUL-1863).
 *
 * The server actions redirect with `?derr=<code>` / `?dmsg=<code>` (plus
 * `dhost=<domain>` and `dhint=<code>` when the sentence carries them) instead
 * of an English sentence, and the page maps the code to en/es copy.
 * Old links that still carry a sentence keep working: `decodeDomainActionParam`
 * passes unknown values through as text. Pure module, safe for server and client.
 * No em dashes.
 */
export const DOMAIN_ACTION_CODES = {
  unavailable: "Domain verification is unavailable until the server is configured.",
  workspace_access: "Workspace access could not be confirmed.",
  owner_only: "Only the workspace owner can manage custom domains.",
  supabase_unconfigured: "Domain settings are unavailable until Supabase is configured.",
  workspace_load_failed: "Workspace details could not be loaded.",
  existing_check_failed: "Existing domain records could not be checked.",
  already_connected: "{domain} is already connected.",
  restart_failed: "Verification could not be restarted for that domain.",
  connected_elsewhere: "That domain is already connected somewhere else.",
  save_failed: "That domain could not be saved.",
  dns_ready: "DNS instructions are ready for {domain}. Add the TXT record to verify it.",
  record_load_failed: "The saved domain record could not be loaded.",
  custom_not_attached: "That custom domain is not attached to this workspace.",
  already_verified: "{domain} is already verified.",
  token_missing: "No verification token is saved for that domain.",
  verified: "{domain} is now verified.",
  txt_not_found_final:
    "TXT record for {domain} still has not been found. You can add it now and check again, or reconnect the domain for a fresh token.",
  txt_propagating: "TXT record not found for {domain} yet. DNS changes may still be propagating.",
  recheck_failed: "The domain could not be re-checked right now.",
  not_attached: "That domain is not attached to this workspace.",
  already_primary: "{domain} is already the primary public URL.",
  primary_pending: "{domain} must finish routing and SSL checks before it can become the primary public URL.",
  primary_update_failed: "The primary public URL could not be updated.",
  now_primary: "{domain} is now the primary public URL.",
  now_fallback_primary: "{domain} is now the Tulala fallback primary URL.",
  fallback_required: "A branded fallback host is required before the primary custom domain can be removed.",
  fallback_restore_failed: "The fallback host could not be restored before removal.",
  remove_failed: "That custom domain could not be removed.",
  removed_fallback_primary: "{domain} was removed. The branded Tulala fallback host is primary again.",
  removed: "{domain} was removed.",
  routing_needs_txt: "{domain} still needs TXT verification before routing can be checked.",
  routing_live: "{domain} is now live with routing and HTTPS on Vercel.",
  routing_https_pending: "{domain} routing is detected. HTTPS is still finishing on Vercel.",
  routing_not_live: "Routing records for {domain} are not live yet. Add the Vercel A/CNAME record and check again.",
  routing_check_failed: "Routing and SSL could not be checked right now.",
} as const;

/** Trailing sentences the connect action appends; carried as `dhint=<code>`. */
export const DOMAIN_HINT_CODES = {
  vercel_not_configured:
    "Vercel project provisioning is not configured yet; finish DNS and run the verification sweep after env setup.",
  vercel_attention: "DNS token is ready, but Vercel project provisioning needs attention.",
} as const;

export type DomainActionCode = keyof typeof DOMAIN_ACTION_CODES;
export type DomainHintCode = keyof typeof DOMAIN_HINT_CODES;

export type EncodedDomainAction = { value: string; domain?: string; hint?: DomainHintCode };

function templateMatch(template: string, text: string): string | null {
  const [before = "", after = ""] = template.split("{domain}");
  if (text.length <= before.length + after.length) return null;
  if (!text.startsWith(before) || !text.endsWith(after)) return null;
  return text.slice(before.length, text.length - after.length);
}

/**
 * Turn an English outcome sentence into `{ value: code, domain?, hint? }`.
 * Text with no code (validation messages, plan-lock copy) is returned as is.
 */
export function encodeDomainActionText(text: string): EncodedDomainAction {
  let body = text;
  let hint: DomainHintCode | undefined;
  for (const [code, sentence] of Object.entries(DOMAIN_HINT_CODES)) {
    if (body.endsWith(` ${sentence}`)) {
      body = body.slice(0, -(sentence.length + 1));
      hint = code as DomainHintCode;
      break;
    }
  }
  for (const [code, template] of Object.entries(DOMAIN_ACTION_CODES)) {
    if (!template.includes("{domain}")) {
      if (template === body) return { value: code, ...(hint ? { hint } : {}) };
      continue;
    }
    const domain = templateMatch(template, body);
    if (domain) return { value: code, domain, ...(hint ? { hint } : {}) };
  }
  return { value: text };
}

/**
 * Map a `?derr=` / `?dmsg=` value (plus `dhost` / `dhint`) back to the English
 * sentence, ready for `translateDomainActionText`. Unknown values are old-style
 * text and pass through unchanged.
 */
export function decodeDomainActionParam(
  value: string,
  domain?: string | null,
  hint?: string | null,
): string {
  if (!Object.prototype.hasOwnProperty.call(DOMAIN_ACTION_CODES, value)) return value;
  const template = DOMAIN_ACTION_CODES[value as DomainActionCode];
  const sentence = template.replaceAll("{domain}", domain ?? "");
  if (hint && Object.prototype.hasOwnProperty.call(DOMAIN_HINT_CODES, hint)) {
    return `${sentence} ${DOMAIN_HINT_CODES[hint as DomainHintCode]}`;
  }
  return sentence;
}
