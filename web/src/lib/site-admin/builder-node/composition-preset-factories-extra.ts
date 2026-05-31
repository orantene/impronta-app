// Additional composition-preset factories (premium block packs, batch 2).
// Separate file to keep composition-preset-factories.ts under max-lines.
import type { BuilderNode } from "./types";
import {
  makeId,
  createHeading,
  createParagraph,
  createButton,
  createImage,
} from "./create";

// Team / people grid — heading + a 3-up grid of person cards.
export function createTeamGridPreset(): Exclude<BuilderNode, { kind: "section" }> {
  const person = (index: number, name: string, role: string): BuilderNode => ({
    id: makeId("card"),
    kind: "card",
    props: { variant: "ghost", style: { align: "center", paddingY: "m" } },
    children: [
      createImage(index, {
        align: "center",
        aspectRatio: "1:1",
        maxWidth: "narrow",
        radius: "pill",
        marginBottom: "s",
      }),
      createHeading(name, 3, { align: "center", size: "md", tone: "strong", marginBottom: "none" }),
      createParagraph(role, { align: "center", size: "sm", tone: "muted", marginBottom: "none" }),
    ],
  });
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      style: { maxWidth: "wide", marginTop: "l", marginBottom: "l" },
    },
    children: [
      createHeading("Meet the team", 2, { align: "center", size: "lg", tone: "strong" }),
      createParagraph("The people behind the work.", {
        align: "center",
        size: "md",
        tone: "muted",
        maxWidth: "reading",
        marginBottom: "m",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          gap: "m",
          responsive: { mobile: { layout: "grid", columns: 2 } },
          style: { maxWidth: "wide" },
        },
        children: [
          person(0, "Alex Rivera", "Creative Director"),
          person(1, "Sam Okoye", "Head of Talent"),
          person(2, "Mira Cohen", "Producer"),
        ],
      },
    ],
  };
}

// Process / timeline — heading + a row of numbered steps.
export function createProcessStepsPreset(): Exclude<BuilderNode, { kind: "section" }> {
  const step = (num: string, title: string, body: string): BuilderNode => ({
    id: makeId("container"),
    kind: "container",
    props: { layout: "stack", gap: "s", style: { paddingX: "s" } },
    children: [
      createHeading(num, 2, { size: "xl", tone: "strong", marginBottom: "none" }),
      createHeading(title, 3, { size: "md", tone: "strong", marginBottom: "none" }),
      createParagraph(body, { size: "sm", tone: "muted", marginBottom: "none" }),
    ],
  });
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      style: { maxWidth: "wide", marginTop: "l", marginBottom: "l" },
    },
    children: [
      createHeading("How it works", 2, { size: "lg", tone: "strong", marginBottom: "s" }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "row",
          gap: "l",
          responsive: { mobile: { layout: "stack" } },
          style: { maxWidth: "wide", marginTop: "m" },
        },
        children: [
          step("01", "Share your brief", "Tell us the role, dates, location, and budget."),
          step("02", "Review curated options", "We reply with a shortlist that fits the brief."),
          step("03", "Confirm & book", "Approve your pick and we handle the rest."),
        ],
      },
    ],
  };
}

// Feature comparison — heading + a 3-up grid of plan cards with a CTA each.
export function createFeatureComparisonPreset(): Exclude<BuilderNode, { kind: "section" }> {
  const plan = (
    name: string,
    price: string,
    features: string,
    highlighted: boolean,
  ): BuilderNode => ({
    id: makeId("card"),
    kind: "card",
    props: {
      variant: highlighted ? "elevated" : "outline",
      style: { align: "center", paddingX: "m", paddingY: "m", radius: "md" },
    },
    children: [
      createHeading(name, 3, { align: "center", size: "md", tone: "strong", marginBottom: "none" }),
      createHeading(price, 2, { align: "center", size: "lg", tone: "strong", marginBottom: "s" }),
      createParagraph(features, {
        align: "center",
        size: "sm",
        tone: "muted",
        marginBottom: "m",
      }),
      createButton(highlighted ? "Get started" : "Choose plan", "/pricing", highlighted ? "primary" : "secondary", {
        align: "center",
        radius: "pill",
        paddingX: "m",
        paddingY: "s",
      }),
    ],
  });
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "stack",
      gap: "m",
      style: { maxWidth: "wide", marginTop: "l", marginBottom: "l" },
    },
    children: [
      createHeading("Compare plans", 2, { align: "center", size: "lg", tone: "strong" }),
      createParagraph("Pick the plan that fits how you work.", {
        align: "center",
        size: "md",
        tone: "muted",
        maxWidth: "reading",
        marginBottom: "m",
      }),
      {
        id: makeId("container"),
        kind: "container",
        props: {
          layout: "grid",
          columns: 3,
          gap: "m",
          responsive: { mobile: { layout: "stack" } },
          style: { maxWidth: "wide" },
        },
        children: [
          plan("Starter", "Free", "Up to 5 listings · email support", false),
          plan("Studio", "$29/mo", "Unlimited listings · custom domain · analytics", true),
          plan("Agency", "$99/mo", "Everything in Studio · team seats · priority", false),
        ],
      },
    ],
  };
}

// Announcement bar — a slim full-width row with a message + an inline action.
export function createAnnouncementBarPreset(): Exclude<BuilderNode, { kind: "section" }> {
  return {
    id: makeId("container"),
    kind: "container",
    props: {
      layout: "row",
      gap: "m",
      align: "center",
      style: {
        align: "center",
        justifyContent: "center",
        maxWidth: "full",
        background: "contrast",
        paddingX: "m",
        paddingY: "s",
        responsive: { mobile: { paddingX: "s" } },
      },
    },
    children: [
      createParagraph("New: launch your talent page in minutes.", {
        size: "sm",
        tone: "strong",
        marginBottom: "none",
      }),
      createButton("Learn more", "/whats-new", "secondary", {
        radius: "pill",
        paddingX: "m",
        paddingY: "s",
      }),
    ],
  };
}
