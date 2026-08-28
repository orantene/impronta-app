import type { BuilderNode, BuilderNodeTree } from "./types";

export interface LegacySnapshotSlot {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey: string;
  name: string;
  props?: Record<string, unknown>;
}

function heroChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 1 },
    });
  }
  const subheadline =
    typeof rawProps.subheadline === "string" ? rawProps.subheadline.trim() : "";
  if (subheadline) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: subheadline },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  const secondaryCta =
    rawProps.secondaryCta && typeof rawProps.secondaryCta === "object"
      ? (rawProps.secondaryCta as Record<string, unknown>)
      : null;
  const secondaryLabel =
    secondaryCta && typeof secondaryCta.label === "string"
      ? secondaryCta.label.trim()
      : "";
  const secondaryHref =
    secondaryCta && typeof secondaryCta.href === "string"
      ? secondaryCta.href.trim()
      : "";
  if (secondaryLabel && secondaryHref) {
    children.push({
      id: `${sectionNodeId}:button:secondaryCta`,
      kind: "button",
      props: { label: secondaryLabel, href: secondaryHref, tone: "secondary" },
    });
  }
  return children;
}

function ctaBannerChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const copy = typeof rawProps.copy === "string" ? rawProps.copy.trim() : "";
  if (copy) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: copy },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  const secondaryCta =
    rawProps.secondaryCta && typeof rawProps.secondaryCta === "object"
      ? (rawProps.secondaryCta as Record<string, unknown>)
      : null;
  const secondaryLabel =
    secondaryCta && typeof secondaryCta.label === "string"
      ? secondaryCta.label.trim()
      : "";
  const secondaryHref =
    secondaryCta && typeof secondaryCta.href === "string"
      ? secondaryCta.href.trim()
      : "";
  if (secondaryLabel && secondaryHref) {
    children.push({
      id: `${sectionNodeId}:button:secondaryCta`,
      kind: "button",
      props: { label: secondaryLabel, href: secondaryHref, tone: "secondary" },
    });
  }
  return children;
}

function featuredTalentChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const copy = typeof rawProps.copy === "string" ? rawProps.copy.trim() : "";
  if (copy) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: copy },
    });
  }
  const footerCta =
    rawProps.footerCta && typeof rawProps.footerCta === "object"
      ? (rawProps.footerCta as Record<string, unknown>)
      : null;
  const footerLabel =
    footerCta && typeof footerCta.label === "string" ? footerCta.label.trim() : "";
  const footerHref =
    footerCta && typeof footerCta.href === "string" ? footerCta.href.trim() : "";
  if (footerLabel && footerHref) {
    children.push({
      id: `${sectionNodeId}:button:footerCta`,
      kind: "button",
      props: { label: footerLabel, href: footerHref, tone: "secondary" },
    });
  }
  return children;
}

function talentTypeGridChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const subheadline =
    typeof rawProps.subheadline === "string" ? rawProps.subheadline.trim() : "";
  if (subheadline) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: subheadline },
    });
  }
  return children;
}

function directoryChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const copy = typeof rawProps.copy === "string" ? rawProps.copy.trim() : "";
  if (copy) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: copy },
    });
  }
  return children;
}

function editorialSplitHeroChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 1 },
    });
  }
  const body = typeof rawProps.body === "string" ? rawProps.body.trim() : "";
  if (body) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: body },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  const secondaryCta =
    rawProps.secondaryCta && typeof rawProps.secondaryCta === "object"
      ? (rawProps.secondaryCta as Record<string, unknown>)
      : null;
  const secondaryLabel =
    secondaryCta && typeof secondaryCta.label === "string"
      ? secondaryCta.label.trim()
      : "";
  const secondaryHref =
    secondaryCta && typeof secondaryCta.href === "string"
      ? secondaryCta.href.trim()
      : "";
  if (secondaryLabel && secondaryHref) {
    children.push({
      id: `${sectionNodeId}:button:secondaryCta`,
      kind: "button",
      props: { label: secondaryLabel, href: secondaryHref, tone: "secondary" },
    });
  }
  return children;
}

function heroSearchChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 1 },
    });
  }
  const subheadline =
    typeof rawProps.subheadline === "string" ? rawProps.subheadline.trim() : "";
  if (subheadline) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: subheadline },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  const secondaryCta =
    rawProps.secondaryCta && typeof rawProps.secondaryCta === "object"
      ? (rawProps.secondaryCta as Record<string, unknown>)
      : null;
  const secondaryLabel =
    secondaryCta && typeof secondaryCta.label === "string"
      ? secondaryCta.label.trim()
      : "";
  const secondaryHref =
    secondaryCta && typeof secondaryCta.href === "string"
      ? secondaryCta.href.trim()
      : "";
  if (secondaryLabel && secondaryHref) {
    children.push({
      id: `${sectionNodeId}:button:secondaryCta`,
      kind: "button",
      props: { label: secondaryLabel, href: secondaryHref, tone: "secondary" },
    });
  }
  return children;
}

function locationDiscoveryChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const subheadline =
    typeof rawProps.subheadline === "string" ? rawProps.subheadline.trim() : "";
  if (subheadline) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: subheadline },
    });
  }
  return children;
}

function categoryGridChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const copy = typeof rawProps.copy === "string" ? rawProps.copy.trim() : "";
  if (copy) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: copy },
    });
  }
  const footerCta =
    rawProps.footerCta && typeof rawProps.footerCta === "object"
      ? (rawProps.footerCta as Record<string, unknown>)
      : null;
  const footerLabel =
    footerCta && typeof footerCta.label === "string" ? footerCta.label.trim() : "";
  const footerHref =
    footerCta && typeof footerCta.href === "string" ? footerCta.href.trim() : "";
  if (footerLabel && footerHref) {
    children.push({
      id: `${sectionNodeId}:button:footerCta`,
      kind: "button",
      props: { label: footerLabel, href: footerHref, tone: "secondary" },
    });
  }
  return children;
}

function contactFormChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  const submitLabel =
    typeof rawProps.submitLabel === "string" ? rawProps.submitLabel.trim() : "";
  if (submitLabel) {
    const action = typeof rawProps.action === "string" ? rawProps.action.trim() : "";
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: {
        label: submitLabel,
        href: action || "/",
        tone: "primary",
      },
    });
  }
  return children;
}

function faqAccordionChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  return children;
}

function pricingGridChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  return children;
}

function logoCloudChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function teamGridChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  return children;
}

function eventListingChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function contentTabsChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function processStepsChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const copy = typeof rawProps.copy === "string" ? rawProps.copy.trim() : "";
  if (copy) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: copy },
    });
  }
  return children;
}

function destinationsMosaicChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const copy = typeof rawProps.copy === "string" ? rawProps.copy.trim() : "";
  if (copy) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: copy },
    });
  }
  return children;
}

function statsChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function timelineChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function valuesTrioChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function comparisonTableChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  return children;
}

function heroSplitChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 1 },
    });
  }
  const subheadline =
    typeof rawProps.subheadline === "string" ? rawProps.subheadline.trim() : "";
  if (subheadline) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: subheadline },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  const secondaryCta =
    rawProps.secondaryCta && typeof rawProps.secondaryCta === "object"
      ? (rawProps.secondaryCta as Record<string, unknown>)
      : null;
  const secondaryLabel =
    secondaryCta && typeof secondaryCta.label === "string"
      ? secondaryCta.label.trim()
      : "";
  const secondaryHref =
    secondaryCta && typeof secondaryCta.href === "string"
      ? secondaryCta.href.trim()
      : "";
  if (secondaryLabel && secondaryHref) {
    children.push({
      id: `${sectionNodeId}:button:secondaryCta`,
      kind: "button",
      props: { label: secondaryLabel, href: secondaryHref, tone: "secondary" },
    });
  }
  return children;
}

function imageCopyAlternatingChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function splitScreenChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const body = typeof rawProps.body === "string" ? rawProps.body.trim() : "";
  if (body) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: body },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  const secondaryCta =
    rawProps.secondaryCta && typeof rawProps.secondaryCta === "object"
      ? (rawProps.secondaryCta as Record<string, unknown>)
      : null;
  const secondaryLabel =
    secondaryCta && typeof secondaryCta.label === "string"
      ? secondaryCta.label.trim()
      : "";
  const secondaryHref =
    secondaryCta && typeof secondaryCta.href === "string"
      ? secondaryCta.href.trim()
      : "";
  if (secondaryLabel && secondaryHref) {
    children.push({
      id: `${sectionNodeId}:button:secondaryCta`,
      kind: "button",
      props: { label: secondaryLabel, href: secondaryHref, tone: "secondary" },
    });
  }
  return children;
}

function beforeAfterChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function bookingWidgetChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  const variant = typeof rawProps.variant === "string" ? rawProps.variant.trim() : "";
  const buttonLabel =
    typeof rawProps.buttonLabel === "string" ? rawProps.buttonLabel.trim() : "";
  const url = typeof rawProps.url === "string" ? rawProps.url.trim() : "";
  if (variant === "button" && buttonLabel && url) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: buttonLabel, href: url, tone: "primary" },
    });
  }
  return children;
}

function lookbookChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function magazineLayoutChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function mapOverlayChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const card = rawProps.card && typeof rawProps.card === "object"
    ? (rawProps.card as Record<string, unknown>)
    : null;
  const body = card && typeof card.body === "string" ? card.body.trim() : "";
  if (body) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: body },
    });
  }
  return children;
}

function pressStripChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  return children;
}

function masonryChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function stickyScrollChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function scrollCarouselChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function lottieChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const caption = typeof rawProps.caption === "string" ? rawProps.caption.trim() : "";
  if (caption) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: caption },
    });
  }
  return children;
}

function videoReelChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function imageOrbitChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function testimonialsTrioChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function galleryStripChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const caption = typeof rawProps.caption === "string" ? rawProps.caption.trim() : "";
  if (caption) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: caption },
    });
  }
  return children;
}

function trustStripChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function codeEmbedChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const caption = typeof rawProps.caption === "string" ? rawProps.caption.trim() : "";
  if (caption) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: caption },
    });
  }
  return children;
}

function blogIndexChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function donationFormChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  const intro = typeof rawProps.intro === "string" ? rawProps.intro.trim() : "";
  if (intro) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: intro },
    });
  }
  const ctaLabel = typeof rawProps.ctaLabel === "string" ? rawProps.ctaLabel.trim() : "";
  if (ctaLabel) {
    const checkoutUrl =
      typeof rawProps.checkoutUrl === "string" ? rawProps.checkoutUrl.trim() : "";
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: ctaLabel, href: checkoutUrl || "/", tone: "primary" },
    });
  }
  return children;
}

function codeSnippetChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const eyebrow = typeof rawProps.eyebrow === "string" ? rawProps.eyebrow.trim() : "";
  if (eyebrow) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: eyebrow },
    });
  }
  const headline = typeof rawProps.headline === "string" ? rawProps.headline.trim() : "";
  if (headline) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: headline, level: 2 },
    });
  }
  return children;
}

function blogDetailChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const category = typeof rawProps.category === "string" ? rawProps.category.trim() : "";
  if (category) {
    children.push({
      id: `${sectionNodeId}:paragraph:subheadline`,
      kind: "paragraph",
      props: { text: category },
    });
  }
  const title = typeof rawProps.title === "string" ? rawProps.title.trim() : "";
  if (title) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: title, level: 1 },
    });
  }
  const byline = typeof rawProps.byline === "string" ? rawProps.byline.trim() : "";
  if (byline) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: byline },
    });
  }
  return children;
}

function siteHeaderChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const brand =
    rawProps.brand && typeof rawProps.brand === "object"
      ? (rawProps.brand as Record<string, unknown>)
      : null;
  const brandLabel = brand && typeof brand.label === "string" ? brand.label.trim() : "";
  if (brandLabel) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: brandLabel, level: 2 },
    });
  }
  const primaryCta =
    rawProps.primaryCta && typeof rawProps.primaryCta === "object"
      ? (rawProps.primaryCta as Record<string, unknown>)
      : null;
  const primaryLabel =
    primaryCta && typeof primaryCta.label === "string" ? primaryCta.label.trim() : "";
  const primaryHref =
    primaryCta && typeof primaryCta.href === "string" ? primaryCta.href.trim() : "";
  if (primaryLabel && primaryHref) {
    children.push({
      id: `${sectionNodeId}:button:primaryCta`,
      kind: "button",
      props: { label: primaryLabel, href: primaryHref, tone: "primary" },
    });
  }
  return children;
}

function siteFooterChildNodes(
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
): BuilderNode[] {
  if (!rawProps) return [];
  const children: BuilderNode[] = [];
  const brand =
    rawProps.brand && typeof rawProps.brand === "object"
      ? (rawProps.brand as Record<string, unknown>)
      : null;
  const brandLabel = brand && typeof brand.label === "string" ? brand.label.trim() : "";
  if (brandLabel) {
    children.push({
      id: `${sectionNodeId}:heading:headline`,
      kind: "heading",
      props: { text: brandLabel, level: 2 },
    });
  }
  const tagline = brand && typeof brand.tagline === "string" ? brand.tagline.trim() : "";
  if (tagline) {
    children.push({
      id: `${sectionNodeId}:paragraph:copy`,
      kind: "paragraph",
      props: { text: tagline },
    });
  }
  return children;
}

/**
 * CMS section types whose nested builder nodes are **persisted composition**
 * only (7A blank canvas). They never mirror flat props into synthetic tree rows,
 * and `syncBuilderTreeSectionChildren` must not overwrite inserted blocks with an
 * empty legacy derivation.
 */
export const COMPOSITION_OWNED_SECTION_TYPE_KEYS = new Set<string>([
  "blank_section",
]);

export function isCompositionOwnedSectionType(sectionTypeKey: string): boolean {
  return COMPOSITION_OWNED_SECTION_TYPE_KEYS.has(sectionTypeKey);
}

/**
 * Every section type that derives child layers, mapped to the deriver that
 * produces them. This table is the SINGLE source of truth: both
 * `deriveLegacySectionChildNodes` (what actually runs) and
 * `sectionTypeHasDerivableChildren` (what the UI offers) read it, so the
 * affordance and the behaviour cannot drift apart. It replaced a ~170-line
 * `if (slot.sectionTypeKey === ...)` chain whose fall-through `return []`
 * silently swallowed every unhandled type.
 *
 * Section types deliberately ABSENT from this table derive nothing:
 * `blank_section` (composition-owned, see below), `anchor_nav`, `marquee`,
 * `join_register`, and the five header-widget embeds (`header_search`,
 * `header_account`, `header_inquiry`, `header_favorites`, `header_language`)
 * which wrap a live widget rather than static layers. Unlocking one of those
 * would report success and leave a BLANK section, so the UI must not offer it.
 */
type SectionChildDeriver = (
  sectionNodeId: string,
  rawProps: Record<string, unknown> | undefined,
) => BuilderNode[];

const SECTION_CHILD_DERIVERS: Record<string, SectionChildDeriver> = {
  hero: heroChildNodes,
  cta_banner: ctaBannerChildNodes,
  featured_talent: featuredTalentChildNodes,
  talent_type_grid: talentTypeGridChildNodes,
  directory: directoryChildNodes,
  editorial_split_hero: editorialSplitHeroChildNodes,
  hero_search: heroSearchChildNodes,
  location_discovery: locationDiscoveryChildNodes,
  category_grid: categoryGridChildNodes,
  contact_form: contactFormChildNodes,
  faq_accordion: faqAccordionChildNodes,
  pricing_grid: pricingGridChildNodes,
  logo_cloud: logoCloudChildNodes,
  team_grid: teamGridChildNodes,
  event_listing: eventListingChildNodes,
  content_tabs: contentTabsChildNodes,
  process_steps: processStepsChildNodes,
  destinations_mosaic: destinationsMosaicChildNodes,
  stats: statsChildNodes,
  timeline: timelineChildNodes,
  values_trio: valuesTrioChildNodes,
  comparison_table: comparisonTableChildNodes,
  hero_split: heroSplitChildNodes,
  image_copy_alternating: imageCopyAlternatingChildNodes,
  split_screen: splitScreenChildNodes,
  before_after: beforeAfterChildNodes,
  booking_widget: bookingWidgetChildNodes,
  lookbook: lookbookChildNodes,
  magazine_layout: magazineLayoutChildNodes,
  map_overlay: mapOverlayChildNodes,
  press_strip: pressStripChildNodes,
  masonry: masonryChildNodes,
  sticky_scroll: stickyScrollChildNodes,
  scroll_carousel: scrollCarouselChildNodes,
  lottie: lottieChildNodes,
  video_reel: videoReelChildNodes,
  image_orbit: imageOrbitChildNodes,
  testimonials_trio: testimonialsTrioChildNodes,
  gallery_strip: galleryStripChildNodes,
  trust_strip: trustStripChildNodes,
  code_embed: codeEmbedChildNodes,
  blog_index: blogIndexChildNodes,
  donation_form: donationFormChildNodes,
  code_snippet: codeSnippetChildNodes,
  blog_detail: blogDetailChildNodes,
  site_header: siteHeaderChildNodes,
  site_footer: siteFooterChildNodes,
};

/**
 * Can this section type produce child layers at all?
 *
 * "Unlock design" ejects a curated section into freeform blocks by deriving
 * its child layers. For a type with no deriver that yields an EMPTY section:
 * the operator's content appears to vanish. Callers use this to disable the
 * unlock affordance with an honest reason instead of failing silently.
 *
 * Derived from `SECTION_CHILD_DERIVERS`, never from a hand-kept parallel list.
 */
export function sectionTypeHasDerivableChildren(sectionTypeKey: string): boolean {
  if (isCompositionOwnedSectionType(sectionTypeKey)) return false;
  return Object.prototype.hasOwnProperty.call(
    SECTION_CHILD_DERIVERS,
    sectionTypeKey,
  );
}

export function deriveLegacySectionChildNodes(
  sectionNodeId: string,
  slot: LegacySnapshotSlot,
): BuilderNode[] {
  if (!sectionTypeHasDerivableChildren(slot.sectionTypeKey)) return [];
  const derive = SECTION_CHILD_DERIVERS[slot.sectionTypeKey];
  return derive ? derive(sectionNodeId, slot.props) : [];
}

/**
 * Phase 4 bridge helper.
 *
 * Converts legacy section-slot snapshots into a typed BuilderNode tree where
 * each slot entry becomes a `section` node. This keeps existing section-first
 * publishing fully intact while giving us a non-breaking typed tree payload
 * on every newly published snapshot.
 */
export function buildLegacySectionBuilderTree(
  slots: ReadonlyArray<LegacySnapshotSlot>,
): BuilderNodeTree {
  return slots.map((slot) => {
    const id = `legacy:${slot.slotKey}:${slot.sortOrder}:${slot.sectionId}`;
    const children = deriveLegacySectionChildNodes(id, slot);
    return children.length > 0
      ? {
          id,
          kind: "section",
          props: {
            sectionId: slot.sectionId,
            sectionTypeKey: slot.sectionTypeKey,
            label: slot.name,
            slotKey: slot.slotKey,
            sortOrder: slot.sortOrder,
          },
          children,
        }
      : {
          id,
          kind: "section",
          props: {
            sectionId: slot.sectionId,
            sectionTypeKey: slot.sectionTypeKey,
            label: slot.name,
            slotKey: slot.slotKey,
            sortOrder: slot.sortOrder,
          },
        };
  });
}
