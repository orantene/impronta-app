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

export function deriveLegacySectionChildNodes(
  sectionNodeId: string,
  slot: LegacySnapshotSlot,
): BuilderNode[] {
  if (slot.sectionTypeKey === "blank_section") {
    return [];
  }
  if (isCompositionOwnedSectionType(slot.sectionTypeKey)) {
    return [];
  }
  if (slot.sectionTypeKey === "hero") {
    return heroChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "cta_banner") {
    return ctaBannerChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "featured_talent") {
    return featuredTalentChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "talent_type_grid") {
    return talentTypeGridChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "directory") {
    return directoryChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "editorial_split_hero") {
    return editorialSplitHeroChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "hero_search") {
    return heroSearchChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "location_discovery") {
    return locationDiscoveryChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "category_grid") {
    return categoryGridChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "contact_form") {
    return contactFormChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "faq_accordion") {
    return faqAccordionChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "pricing_grid") {
    return pricingGridChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "logo_cloud") {
    return logoCloudChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "team_grid") {
    return teamGridChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "event_listing") {
    return eventListingChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "content_tabs") {
    return contentTabsChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "process_steps") {
    return processStepsChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "destinations_mosaic") {
    return destinationsMosaicChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "stats") {
    return statsChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "timeline") {
    return timelineChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "values_trio") {
    return valuesTrioChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "comparison_table") {
    return comparisonTableChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "hero_split") {
    return heroSplitChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "image_copy_alternating") {
    return imageCopyAlternatingChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "split_screen") {
    return splitScreenChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "before_after") {
    return beforeAfterChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "booking_widget") {
    return bookingWidgetChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "lookbook") {
    return lookbookChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "magazine_layout") {
    return magazineLayoutChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "map_overlay") {
    return mapOverlayChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "press_strip") {
    return pressStripChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "masonry") {
    return masonryChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "sticky_scroll") {
    return stickyScrollChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "scroll_carousel") {
    return scrollCarouselChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "lottie") {
    return lottieChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "video_reel") {
    return videoReelChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "image_orbit") {
    return imageOrbitChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "testimonials_trio") {
    return testimonialsTrioChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "gallery_strip") {
    return galleryStripChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "trust_strip") {
    return trustStripChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "code_embed") {
    return codeEmbedChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "blog_index") {
    return blogIndexChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "donation_form") {
    return donationFormChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "code_snippet") {
    return codeSnippetChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "blog_detail") {
    return blogDetailChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "site_header") {
    return siteHeaderChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "site_footer") {
    return siteFooterChildNodes(sectionNodeId, slot.props);
  }
  if (slot.sectionTypeKey === "anchor_nav") {
    return [];
  }
  if (slot.sectionTypeKey === "marquee") {
    return [];
  }
  if (slot.sectionTypeKey === "join_register") {
    return [];
  }
  // WS-A A5 — header-widget embeds wrap a live widget and derive no child layers.
  if (slot.sectionTypeKey === "header_search") {
    return [];
  }
  if (slot.sectionTypeKey === "header_account") {
    return [];
  }
  if (slot.sectionTypeKey === "header_inquiry") {
    return [];
  }
  if (slot.sectionTypeKey === "header_favorites") {
    return [];
  }
  if (slot.sectionTypeKey === "header_language") {
    return [];
  }
  return [];
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
