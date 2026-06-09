import {
  createButton,
  createHeading,
  createParagraph,
  makeId,
} from "@/lib/site-admin/builder-node/create";
import type {
  BuilderNode,
  BuilderNodeStyle,
} from "@/lib/site-admin/builder-node/types";

/** Operator-facing layer name stored on node props (display-only). */
export type SectionTemplateLayerLabel = string;

function withLayerLabel<P extends { layerLabel?: string }>(
  props: P,
  layerLabel?: SectionTemplateLayerLabel,
): P {
  return layerLabel ? { ...props, layerLabel } : props;
}

export function tplSection(label: string, children: BuilderNode[]): BuilderNode {
  return {
    id: makeId("section"),
    kind: "section",
    props: {
      sectionTypeKey: "custom",
      label,
    },
    children,
  };
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
  } = {},
): BuilderNode {
  return {
    id: makeId("container"),
    kind: "container",
    props: withLayerLabel(
      {
        layout: options.layout ?? "stack",
        gap: options.gap ?? "l",
        columns: options.columns,
        align: options.align,
        style: options.style,
      },
      options.layerLabel,
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
  return {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: withLayerLabel(
      {
        text,
        style: {
          size: "sm",
          tone: "muted",
          align: "center",
          ...style,
        },
      },
      "Intro Text",
    ),
  };
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
      level === 1 ? "Title" : "Title",
    ),
  };
}

export function tplDescription(
  text: string,
  layerLabel = "Description",
  style?: BuilderNodeStyle,
): BuilderNode {
  return {
    id: makeId("paragraph"),
    kind: "paragraph",
    props: withLayerLabel(
      {
        text,
        style: { align: "center", tone: "muted", ...style },
      },
      layerLabel,
    ),
  };
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
    icon?: string;
    label?: string;
    size?: "sm" | "md" | "lg";
  } = {},
): BuilderNode {
  return {
    id: makeId("icon"),
    kind: "icon",
    props: withLayerLabel(
      {
        icon: options.icon ?? "quote",
        label: options.label ?? "",
        size: options.size ?? "md",
      },
      options.layerLabel ?? "Quote Icon",
    ),
  };
}

export function tplDirectorySearchForm(
  placeholder: string,
  submitLabel: string,
): BuilderNode {
  return {
    id: makeId("form"),
    kind: "form",
    props: withLayerLabel(
      {
        action: "/directory",
        method: "get",
        fields: [
          {
            id: crypto.randomUUID(),
            name: "q",
            type: "text",
            label: "Search",
            placeholder,
            required: false,
          },
          {
            id: crypto.randomUUID(),
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
      "Search Form",
    ),
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

/** Standard centered content column for marketing sections. */
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

export function tplFaqItem(question: string, answer: string): BuilderNode {
  return {
    id: makeId("accordion_item"),
    kind: "accordion_item",
    props: { title: question },
    children: [
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: withLayerLabel({ text: answer }, "Answer"),
      },
    ],
  };
}

export function tplFaqAccordion(items: ReadonlyArray<{ question: string; answer: string }>): BuilderNode {
  return {
    id: makeId("accordion"),
    kind: "accordion",
    props: withLayerLabel({ allowMultiple: false }, "FAQ Accordion"),
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
      tplIcon({ layerLabel: "Quote Icon", icon: "sparkle", label: "" }),
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: withLayerLabel(
          {
            text: quote,
            style: { size: "lg", tone: "default" },
          },
          "Quote Text",
        ),
      },
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: withLayerLabel(
          {
            text: clientName,
            style: { size: "sm", tone: "strong" },
          },
          "Client Name",
        ),
      },
      {
        id: makeId("paragraph"),
        kind: "paragraph",
        props: withLayerLabel(
          {
            text: clientRole,
            style: { size: "sm", tone: "muted" },
          },
          "Client Role",
        ),
      },
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
