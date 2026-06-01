export const BUILDER_ICON_NAMES = [
  "sparkle",
  "star",
  "heart",
  "check",
  "arrow_right",
  "calendar",
  "map_pin",
  "mail",
  "phone",
  "play",
  "users",
  "camera",
] as const;

export type BuilderIconName = (typeof BUILDER_ICON_NAMES)[number];

export interface BuilderIconDefinition {
  name: BuilderIconName;
  label: string;
  paths: ReadonlyArray<string>;
  circles?: ReadonlyArray<{ cx: number; cy: number; r: number }>;
  polygons?: ReadonlyArray<string>;
}

export const BUILDER_ICON_REGISTRY: ReadonlyArray<BuilderIconDefinition> = [
  {
    name: "sparkle",
    label: "Sparkle",
    paths: [
      "M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z",
      "M5 16l.8 2.2L8 19l-2.2.8L5 22l-.8-2.2L2 19l2.2-.8L5 16z",
      "M19 2l.7 1.8L21.5 4.5l-1.8.7L19 7l-.7-1.8-1.8-.7 1.8-.7L19 2z",
    ],
  },
  {
    name: "star",
    label: "Star",
    paths: [
      "M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3z",
    ],
  },
  {
    name: "heart",
    label: "Heart",
    paths: [
      "M20.8 5.6c-1.7-2-4.8-2.1-6.6-.3L12 7.5 9.8 5.3C8 3.5 4.9 3.6 3.2 5.6c-1.8 2.1-1.6 5.2.4 7.1l8.4 7.8 8.4-7.8c2-1.9 2.2-5 .4-7.1z",
    ],
  },
  {
    name: "check",
    label: "Check",
    paths: ["M20 6L9 17l-5-5"],
  },
  {
    name: "arrow_right",
    label: "Arrow right",
    paths: ["M5 12h14", "M13 6l6 6-6 6"],
  },
  {
    name: "calendar",
    label: "Calendar",
    paths: ["M7 3v4", "M17 3v4", "M4 9h16", "M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1z"],
  },
  {
    name: "map_pin",
    label: "Map pin",
    paths: ["M12 21s7-5.2 7-11a7 7 0 1 0-14 0c0 5.8 7 11 7 11z"],
    circles: [{ cx: 12, cy: 10, r: 2.4 }],
  },
  {
    name: "mail",
    label: "Mail",
    paths: ["M4 6h16v12H4z", "M4 7l8 6 8-6"],
  },
  {
    name: "phone",
    label: "Phone",
    paths: [
      "M6.6 4.5l3 3-2 2c1.2 2.5 3.4 4.7 5.9 5.9l2-2 3 3-1.6 3c-.4.7-1.2 1.1-2 1C8.8 20.8 3.2 15.2 2.6 9.1c-.1-.8.3-1.6 1-2l3-1.6z",
    ],
  },
  {
    name: "play",
    label: "Play",
    paths: [],
    polygons: ["9 6 19 12 9 18 9 6"],
  },
  {
    name: "users",
    label: "Users",
    paths: ["M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8z", "M16 11a3.5 3.5 0 1 0 0-7", "M2.5 20c.8-3.2 2.8-5 5.5-5s4.7 1.8 5.5 5", "M13.5 15.4c2.4.4 4.2 2 5 4.6"],
  },
  {
    name: "camera",
    label: "Camera",
    paths: ["M4 8h4l1.5-2h5L16 8h4v11H4z"],
    circles: [{ cx: 12, cy: 13.5, r: 3 }],
  },
];

export function getBuilderIconDefinition(
  name: BuilderIconName | undefined,
): BuilderIconDefinition {
  return (
    BUILDER_ICON_REGISTRY.find((icon) => icon.name === name) ??
    BUILDER_ICON_REGISTRY[0]
  );
}

