/**
 * Guest-path hide-until-confirmed for talent vanity sites.
 *
 * Oran has not confirmed Jorgelina's WhatsApp / social / email handles, and the
 * Resultados gallery still carries an honest "prototype photos" disclaimer.
 * Until he confirms channels or swaps in real client photos, the published
 * guest path must not show placeholder bands or disabled-looking stub buttons.
 *
 * Scope: talent_site / Max-site guest render only. The page builder still shows
 * the authored nodes so an owner can replace them; we only omit them on paint.
 *
 * Do NOT invent real handles here — when a button already has a real channel
 * href (wa.me / instagram / tiktok / mailto), it stays.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";

/** Substrings that mark Oran-unconfirmed placeholder copy (ES + EN seed). */
export const UNCONFIRMED_STUB_COPY_MARKERS = [
  "falta confirmar el WhatsApp",
  "generadas para este prototipo",
  "No son fotografías de clientas",
  "still need confirming",
  "generated for this prototype",
  "not photographs of Jorg Beauty clients",
] as const;

const CHANNEL_ICONS = new Set([
  "whatsapp",
  "instagram",
  "tiktok",
  "email",
  "mail",
]);

export function isUnconfirmedStubCopy(text: string | null | undefined): boolean {
  if (!text) return false;
  return UNCONFIRMED_STUB_COPY_MARKERS.some((m) => text.includes(m));
}

function collectNodeTexts(node: BuilderNode): string[] {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const out: string[] = [];
  if (typeof props.text === "string") out.push(props.text);
  if (typeof props.label === "string") out.push(props.label);
  const i18n = props.i18n;
  if (i18n && typeof i18n === "object" && !Array.isArray(i18n)) {
    for (const locale of Object.values(i18n as Record<string, unknown>)) {
      if (!locale || typeof locale !== "object" || Array.isArray(locale)) continue;
      const text = (locale as Record<string, unknown>).text;
      const label = (locale as Record<string, unknown>).label;
      if (typeof text === "string") out.push(text);
      if (typeof label === "string") out.push(label);
    }
  }
  return out;
}

function channelIconOf(node: BuilderNode): string | null {
  const props = (node.props ?? {}) as Record<string, unknown>;
  for (const key of ["leadingIcon", "trailingIcon", "icon"] as const) {
    const v = props[key];
    if (typeof v === "string" && CHANNEL_ICONS.has(v)) return v;
  }
  const label = typeof props.label === "string" ? props.label.trim().toLowerCase() : "";
  if (!label) return null;
  if (label === "whatsapp" || label.startsWith("whatsapp")) return "whatsapp";
  if (label === "tiktok") return "tiktok";
  if (label === "correo" || label === "email" || label === "mail") return "email";
  if (label.startsWith("@") || label.includes("instagram")) return "instagram";
  return null;
}

/** True when the href is a real public channel for that icon — not a stub. */
export function isConfirmedChannelHref(href: string, icon: string): boolean {
  const h = href.trim();
  if (!h || h === "#" || h.toLowerCase().startsWith("javascript:")) return false;
  switch (icon) {
    case "whatsapp":
      return /^https:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(h);
    case "instagram":
      return /^https?:\/\/(www\.)?instagram\.com\//i.test(h);
    case "tiktok":
      return /^https?:\/\/(www\.)?tiktok\.com\//i.test(h);
    case "email":
    case "mail":
      return /^mailto:/i.test(h);
    default:
      return false;
  }
}

function isUnconfirmedChannelButton(node: BuilderNode): boolean {
  if (node.kind !== "button") return false;
  const icon = channelIconOf(node);
  if (!icon) return false;
  const href =
    typeof (node.props as { href?: unknown }).href === "string"
      ? ((node.props as { href: string }).href ?? "")
      : "";
  return !isConfirmedChannelHref(href, icon);
}

function isUnconfirmedStubParagraph(node: BuilderNode): boolean {
  if (node.kind !== "paragraph") return false;
  return collectNodeTexts(node).some(isUnconfirmedStubCopy);
}

function shouldOmitGuestStub(node: BuilderNode): boolean {
  return isUnconfirmedStubParagraph(node) || isUnconfirmedChannelButton(node);
}

/**
 * Drop unconfirmed social stub buttons + prototype/disclaimer paragraphs from
 * a talent vanity guest tree. Empty containers left behind stay (harmless);
 * do not collapse arbitrary layout.
 */
export function pruneUnconfirmedGuestStubs(
  tree: ReadonlyArray<BuilderNode>,
): BuilderNode[] {
  const prune = (nodes: ReadonlyArray<BuilderNode>): BuilderNode[] =>
    nodes
      .filter((node) => !shouldOmitGuestStub(node))
      .map((node) =>
        "children" in node && Array.isArray(node.children)
          ? ({ ...node, children: prune(node.children) } as BuilderNode)
          : node,
      );
  return prune(tree);
}
