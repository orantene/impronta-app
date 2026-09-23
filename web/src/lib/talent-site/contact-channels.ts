/**
 * Contact channels on a talent's own site. Ask opens Messages in place.
 * WhatsApp and email are separate layers so she can show, hide, or reorder
 * each one. Empty WhatsApp and email links are dropped at hydrate time.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import {
  appointmentModeRank,
  getAppointmentsPlanPolicy,
} from "@/lib/scheduling/appointments-plan-policy";

export const TALENT_ASK_HREF = "#talent-ask";

export const CONTACT_LAYER = {
  ask: "Ask a question",
  whatsapp: "WhatsApp",
  email: "Email",
} as const;

/** English tree copy. es/fr live in web/messages and must match these keys. */
export const CONTACT_COPY = {
  confirmByHand: "She confirms by hand.",
  bookInstant: "You can book a time on this page.",
} as const;

const PRUNED_LAYERS = new Set<string>([CONTACT_LAYER.whatsapp, CONTACT_LAYER.email]);

/** The default-tree Contact section. Same three channels as `contactBlock`. */
export function contactSectionNode(
  id: (suffix: string) => string,
  headingStyle: Record<string, unknown>,
): BuilderNode {
  const names = ["contact-ask", "contact-whatsapp", "contact-email"];
  let cursor = 0;
  return {
    id: id("contact"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      align: "center",
      layerLabel: "Contact",
      style: {
        maxWidth: "reading",
        paddingY: "l",
        paddingX: "m",
        marginTop: "m",
        marginBottom: "l",
      },
    },
    children: [
      {
        id: id("contact-heading"),
        kind: "heading",
        props: {
          text: "Let's work together",
          level: 2,
          style: { ...headingStyle, align: "center" },
        },
      },
      {
        id: id("contact-copy"),
        kind: "paragraph",
        props: {
          text: "{{contactCopy}}",
          style: { tone: "muted", align: "center" },
        },
      },
      ...contactChannelButtons(() => id(names[cursor++] ?? "contact-extra")),
    ],
  } as BuilderNode;
}

/**
 * Three contact buttons, in order: Ask, WhatsApp, email.
 * `makeId` is called once per button, in that order.
 */
export function contactChannelButtons(makeId: () => string): BuilderNode[] {
  return [
    {
      id: makeId(),
      kind: "button",
      props: {
        label: CONTACT_LAYER.ask,
        href: TALENT_ASK_HREF,
        tone: "primary",
        layerLabel: CONTACT_LAYER.ask,
        style: { marginTop: "s" },
      },
    },
    {
      id: makeId(),
      kind: "button",
      props: {
        label: CONTACT_LAYER.whatsapp,
        href: "{{whatsappHref}}",
        tone: "secondary",
        layerLabel: CONTACT_LAYER.whatsapp,
      },
    },
    {
      id: makeId(),
      kind: "button",
      props: {
        label: CONTACT_LAYER.email,
        href: "{{emailHref}}",
        tone: "secondary",
        layerLabel: CONTACT_LAYER.email,
      },
    },
  ] as BuilderNode[];
}

/**
 * Drop WhatsApp and email buttons whose href resolved empty. A button the
 * talent marked hidden stays, so her choice is not overwritten on hydrate.
 */
export function pruneEmptyContactChannels(tree: BuilderNode[]): BuilderNode[] {
  const prune = (nodes: BuilderNode[]): BuilderNode[] =>
    nodes
      .filter((node) => {
        if (node.kind !== "button") return true;
        const props = node.props as {
          href?: unknown;
          layerLabel?: unknown;
          style?: { visibility?: unknown };
        };
        const label = typeof props.layerLabel === "string" ? props.layerLabel : "";
        if (!PRUNED_LAYERS.has(label)) return true;
        if (props.style?.visibility === "hidden") return true;
        const href = typeof props.href === "string" ? props.href.trim() : "";
        return href.length > 0;
      })
      .map((node) =>
        "children" in node && Array.isArray(node.children)
          ? ({ ...node, children: prune(node.children) } as BuilderNode)
          : node,
      );
  return prune(tree);
}

/** Portfolio is the website plan (instant). Every other talent plan is free (request). */
export function appointmentsTierForTalentPlan(
  planKey: string | null | undefined,
): "free" | "website" {
  return planKey?.trim() === "talent_portfolio" ? "website" : "free";
}

export function talentOffersInstantBooking(planKey: string | null | undefined): boolean {
  const policy = getAppointmentsPlanPolicy(appointmentsTierForTalentPlan(planKey));
  return appointmentModeRank(policy.maxMode) >= appointmentModeRank("instant");
}

export function contactCopyForPlan(planKey: string | null | undefined): string {
  return talentOffersInstantBooking(planKey)
    ? CONTACT_COPY.bookInstant
    : CONTACT_COPY.confirmByHand;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const WHATSAPP_SHELL = "shell://whatsapp/";

function digitsOf(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Public contact links only. WhatsApp comes from a shell link, a wa.me link,
 * or her phone. Email comes from a mailto link she published. An invitation
 * address is not an input.
 */
export function talentContactHrefs(input: {
  phone?: string | null;
  phoneE164?: string | null;
  socialLinks?: unknown;
}): { whatsappHref: string; emailHref: string } {
  const links = Array.isArray(input.socialLinks) ? input.socialLinks : [];
  let whatsapp = "";
  let email = "";
  for (const link of links) {
    if (!link || typeof link !== "object") continue;
    const href = "href" in link && typeof link.href === "string" ? link.href.trim() : "";
    if (!href) continue;
    if (!whatsapp && href.startsWith(WHATSAPP_SHELL)) {
      let raw = href.slice(WHATSAPP_SHELL.length);
      try {
        raw = decodeURIComponent(raw);
      } catch {
        raw = "";
      }
      const digits = digitsOf(raw);
      if (digits.length >= 8) whatsapp = `https://wa.me/${digits}`;
    } else if (!whatsapp && /^https:\/\/(wa\.me|api\.whatsapp\.com)\//.test(href)) {
      whatsapp = href;
    } else if (!email && href.toLowerCase().startsWith("mailto:")) {
      const addr = href.slice("mailto:".length).split("?")[0]?.trim() ?? "";
      if (EMAIL_RE.test(addr)) email = `mailto:${addr}`;
    }
  }
  if (!whatsapp) {
    const digits = digitsOf(input.phoneE164?.trim() || input.phone?.trim() || "");
    if (digits.length >= 8) whatsapp = `https://wa.me/${digits}`;
  }
  return { whatsappHref: whatsapp, emailHref: email };
}
