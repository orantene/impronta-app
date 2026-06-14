/**
 * Add Gallery section template node helpers.
 *
 * Layer naming rules:
 * - Use operator-facing names via `layerLabel` (Intro Text, Title, Description…).
 * - Never use Eyebrow/Kicker — prefer Intro Text for kicker lines.
 * - Form fields live on `form.props.fields` (single Form layer); splitting into
 *   child layers requires a stretch refactor (see marathon inventory doc).
 * - Connected wrappers expose one labeled `section_embed` child (Talent Grid, etc.).
 */
import { createImage, makeId, randomUuid } from "@/lib/site-admin/builder-node/create";
import type {
  BuilderNode,
  BuilderNodeStyle,
} from "@/lib/site-admin/builder-node/types";

/** Operator-facing layer name stored on node props (display-only). */
export type SectionTemplateLayerLabel = string;

function withLayerLabel<T extends object>(
  props: T,
  layerLabel?: SectionTemplateLayerLabel,
): T & { layerLabel?: string } {
  return layerLabel ? { ...props, layerLabel } : (props as T & { layerLabel?: string });
}

/**
 * Root gallery block — a freeform `container`, not a legacy `section` shell.
 * Legacy `section` nodes are slot-bound composition wrappers; Add Gallery
 * templates need full container drop/edit freedom from day one.
 */
export function tplSection(label: string, children: BuilderNode[]): BuilderNode {
  return tplContainer(children, {
    layerLabel: label,
    layout: "stack",
    gap: "m",
    align: "stretch",
  });
}

export function tplContainer(
  children: BuilderNode[],
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    layout?: "stack" | "row" | "grid";
    gap?: "s" | "m" | "l";
    columns?: 1 | 2 | 3 | 4;
    align?: "start" | "center" | "end" | "stretch";
    style?: BuilderNodeStyle;
    responsive?: {
      tablet?: {
        layout?: "stack" | "row" | "grid";
        columns?: 1 | 2 | 3 | 4;
      };
      mobile?: {
        layout?: "stack" | "row" | "grid";
        columns?: 1 | 2 | 3 | 4;
      };
    };
  } = {},
): BuilderNode {
  const { layerLabel, responsive, layout = "stack", ...rest } = options;
  return {
    id: makeId("container"),
    kind: "container",
    props: withLayerLabel(
      {
        layout,
        ...rest,
        responsive,
      },
      layerLabel,
    ),
    children,
  };
}

export function tplCard(
  children: BuilderNode[],
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    variant?: "elevated" | "outline" | "ghost";
    style?: BuilderNodeStyle;
  } = {},
): BuilderNode {
  return {
    id: makeId("card"),
    kind: "card",
    props: withLayerLabel(
      {
        variant: options.variant ?? "elevated",
        style: options.style,
      },
      options.layerLabel,
    ),
    children,
  };
}

export function tplCtaGroup(
  children: BuilderNode[],
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    layout?: "row" | "stack";
    gap?: "s" | "m" | "l";
    align?: "start" | "center" | "end" | "stretch";
  } = {},
): BuilderNode {
  return {
    id: makeId("cta_group"),
    kind: "cta_group",
    props: withLayerLabel(
      {
        layout: options.layout ?? "row",
        gap: options.gap ?? "m",
        align: options.align ?? "center",
      },
      options.layerLabel,
    ),
    children,
  };
}

export function tplIntroText(
  text: string,
  style?: BuilderNodeStyle,
): BuilderNode {
  return tplLabeledParagraph(text, "Intro Text", {
    size: "sm",
    tone: "muted",
    align: "center",
    ...style,
  });
}

export function tplTitle(
  text: string,
  level: 1 | 2 | 3 | 4 = 1,
  style?: BuilderNodeStyle,
): BuilderNode {
  return {
    id: makeId("heading"),
    kind: "heading",
    props: withLayerLabel(
      {
        text,
        level,
        style: { align: "center", ...style },
      },
      "Title",
    ),
  };
}

export function tplLabeledParagraph(
  text: string,
  layerLabel: SectionTemplateLayerLabel,
  style?: BuilderNodeStyle,
): BuilderNode {
  return {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: withLayerLabel({ text, style }, layerLabel),
  };
}

export function tplDescription(
  text: string,
  layerLabel = "Description",
  style?: BuilderNodeStyle,
): BuilderNode {
  return tplLabeledParagraph(text, layerLabel, {
    align: "center",
    tone: "muted",
    ...style,
  });
}

export function tplButton(
  label: string,
  href: string,
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    tone?: "primary" | "secondary";
    style?: BuilderNodeStyle;
  } = {},
): BuilderNode {
  return {
    id: makeId("button"),
    kind: "button",
    props: withLayerLabel(
      {
        label,
        href,
        tone: options.tone ?? "primary",
        style: options.style,
      },
      options.layerLabel,
    ),
  };
}

export function tplIcon(
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    icon?: "check" | "sparkle" | "star" | "heart" | "arrow_right" | "calendar" | "map_pin" | "mail" | "phone" | "play" | "users" | "camera";
    label?: string;
    size?: "sm" | "md" | "lg";
  } = {},
): BuilderNode {
  return {
    id: makeId("icon"),
    kind: "icon",
    props: withLayerLabel(
      {
        icon: options.icon ?? "sparkle",
        label: options.label ?? "",
        size: options.size ?? "md",
      },
      options.layerLabel ?? "Quote Icon",
    ),
  };
}

export function tplImageLayer(
  index = 0,
  layerLabel = "Image",
  style?: BuilderNodeStyle,
): BuilderNode {
  const image = createImage(index, style);
  if (image.kind !== "image") return image;
  return {
    id: image.id,
    kind: "image",
    props: { ...image.props, layerLabel },
  };
}

export function tplSplitColumn(
  left: BuilderNode[],
  right: BuilderNode[],
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    ratio?: "50-50" | "40-60" | "60-40" | "30-70" | "70-30";
    gap?: "s" | "m" | "l";
    collapseOnMobile?: boolean;
  } = {},
): BuilderNode {
  return {
    id: makeId("split"),
    kind: "split",
    props: withLayerLabel(
      {
        ratio: options.ratio ?? "50-50",
        gap: options.gap ?? "l",
        collapseOnMobile: options.collapseOnMobile ?? true,
      },
      options.layerLabel ?? "Split Layout",
    ),
    children: [
      tplContainer(left, { layerLabel: "Content Column", layout: "stack", gap: "m" }),
      tplContainer(right, { layerLabel: "Media Column", layout: "stack", gap: "m" }),
    ],
  };
}

export function tplMasonryGrid(
  imageCount: number,
  options: {
    layerLabel?: SectionTemplateLayerLabel;
    columns?: 2 | 3 | 4 | 5;
    gap?: "s" | "m" | "l";
    imageLabelPrefix?: string;
  } = {},
): BuilderNode {
  const prefix = options.imageLabelPrefix ?? "Gallery Image";
  const children = Array.from({ length: imageCount }, (_, i) =>
    tplImageLayer(i, `${prefix} ${i + 1}`),
  );
  return {
    id: makeId("masonry"),
    kind: "masonry",
    props: withLayerLabel(
      {
        columns: options.columns ?? 3,
        gap: options.gap ?? "m",
      },
      options.layerLabel ?? "Gallery Grid",
    ),
    children,
  };
}

export function tplServiceCard(
  title: string,
  description: string,
  index: number,
): BuilderNode {
  return tplCard(
    [
      {
        id: makeId("heading"),
        kind: "heading",
        props: withLayerLabel(
          { text: title, level: 3, style: { align: "left" } },
          "Service Title",
        ),
      },
      tplLabeledParagraph(description, "Service Description", {
        align: "left",
        tone: "muted",
      }),
    ],
    {
      layerLabel: index === 0 ? "Service Card" : "Service Card",
      variant: "elevated",
      style: {
        paddingTop: "24px",
        paddingBottom: "24px",
        paddingLeft: "24px",
        paddingRight: "24px",
      },
    },
  );
}

export function tplStatCard(
  value: string,
  label: string,
  index: number,
): BuilderNode {
  return tplCard(
    [
      {
        id: makeId("heading"),
        kind: "heading",
        props: withLayerLabel(
          { text: value, level: 3, style: { align: "center" } },
          "Stat Value",
        ),
      },
      tplLabeledParagraph(label, "Stat Label", {
        align: "center",
        tone: "muted",
        size: "sm",
      }),
    ],
    {
      layerLabel: index === 0 ? "Stat Card" : "Stat Card",
      variant: "outline",
      style: {
        paddingTop: "20px",
        paddingBottom: "20px",
        paddingLeft: "16px",
        paddingRight: "16px",
      },
    },
  );
}

export function tplCategoryCard(
  title: string,
  description: string,
  index: number,
): BuilderNode {
  return tplCard(
    [
      {
        id: makeId("heading"),
        kind: "heading",
        props: withLayerLabel(
          { text: title, level: 3, style: { align: "left" } },
          "Category Title",
        ),
      },
      tplLabeledParagraph(description, "Category Description", {
        align: "left",
        tone: "muted",
      }),
    ],
    { layerLabel: index === 0 ? "Category Card" : "Category Card" },
  );
}

export function tplSectionEmbed(
  sectionTypeKey: string,
  layerLabel: SectionTemplateLayerLabel,
  config?: Record<string, unknown>,
): BuilderNode {
  return {
    id: makeId("section_embed"),
    kind: "section_embed",
    props: {
      sectionTypeKey,
      ...(config !== undefined ? { config } : {}),
      layerLabel,
    },
  };
}

export function tplContactForm(): BuilderNode {
  return {
    id: makeId("form"),
    kind: "form",
    props: {
      action: "internal",
      honeypotName: "website",
      layerLabel: "Contact Form",
      fields: [
          {
            id: randomUuid(),
            name: "name",
            type: "text",
            label: "Name",
            placeholder: "Your name",
            required: true,
          },
          {
            id: randomUuid(),
            name: "email",
            type: "email",
            label: "Email",
            placeholder: "you@example.com",
            required: true,
          },
          {
            id: randomUuid(),
            name: "message",
            type: "textarea",
            label: "Message",
            placeholder: "How can we help?",
          },
          {
            id: randomUuid(),
            name: "submit",
            type: "submit",
            label: "Send message",
          },
        ],
        style: {
          maxWidthFree: "560px",
          marginLeftFree: "auto",
          marginRightFree: "auto",
          width: "100%",
        },
      },
  };
}

export function tplDirectorySearchForm(
  placeholder: string,
  submitLabel: string,
): BuilderNode {
  return {
    id: makeId("form"),
    kind: "form",
    props: {
      action: "/directory",
      method: "get",
      layerLabel: "Search Form",
      fields: [
          {
            id: randomUuid(),
            name: "q",
            type: "text",
            label: "Search",
            placeholder,
            required: false,
          },
          {
            id: randomUuid(),
            name: "submit",
            type: "submit",
            label: submitLabel,
          },
        ],
        style: {
          maxWidthFree: "640px",
          marginLeftFree: "auto",
          marginRightFree: "auto",
          width: "100%",
        },
      },
  };
}

export function tplSearchFormRow(
  placeholder: string,
  submitLabel: string,
): BuilderNode {
  return tplContainer([tplDirectorySearchForm(placeholder, submitLabel)], {
    layerLabel: "Search Form",
    layout: "row",
    align: "center",
  });
}

/** Centered marketing column — hero, CTA, testimonials. */
export function tplContentColumn(children: BuilderNode[]): BuilderNode {
  return tplContainer(children, {
    layerLabel: "Container",
    layout: "stack",
    gap: "l",
    align: "center",
    style: {
      maxWidthFree: "1120px",
      marginLeftFree: "auto",
      marginRightFree: "auto",
      paddingTop: "48px",
      paddingBottom: "48px",
      paddingLeft: "40px",
      paddingRight: "40px",
    },
  });
}

/** Left-aligned editorial column — about, services copy blocks. */
export function tplContentColumnLeft(children: BuilderNode[]): BuilderNode {
  return tplContainer(children, {
    layerLabel: "Container",
    layout: "stack",
    gap: "l",
    align: "start",
    style: {
      maxWidthFree: "1120px",
      marginLeftFree: "auto",
      marginRightFree: "auto",
      paddingTop: "48px",
      paddingBottom: "48px",
      paddingLeft: "40px",
      paddingRight: "40px",
    },
  });
}

export function tplFaqItem(question: string, answer: string): BuilderNode {
  return {
    id: makeId("accordion_item"),
    kind: "accordion_item",
    props: { title: question },
    children: [
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: { text: answer, layerLabel: "Answer" },
      },
    ],
  };
}

export function tplFaqAccordion(
  items: ReadonlyArray<{ question: string; answer: string }>,
): BuilderNode {
  return {
    id: makeId("accordion"),
    kind: "accordion",
    props: { allowMultiple: false, layerLabel: "FAQ Accordion" },
    children: items.map((item) => tplFaqItem(item.question, item.answer)),
  };
}

export function tplTestimonialCard(
  quote: string,
  clientName: string,
  clientRole: string,
  index: number,
): BuilderNode {
  return tplCard(
    [
      tplLabeledParagraph("\u201C", "Quote Mark", {
        size: "lg",
        tone: "muted",
        align: "left",
      }),
      tplLabeledParagraph(quote, "Quote Text", { size: "lg", tone: "default" }),
      tplLabeledParagraph(clientName, "Client Name", {
        size: "sm",
        tone: "strong",
      }),
      tplLabeledParagraph(clientRole, "Client Role", {
        size: "sm",
        tone: "muted",
      }),
    ],
    {
      layerLabel: index === 0 ? "Testimonial Card" : "Testimonial Card",
      variant: "elevated",
      style: {
        paddingTop: "24px",
        paddingBottom: "24px",
        paddingLeft: "24px",
        paddingRight: "24px",
      },
    },
  );
}
