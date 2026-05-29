export type BlockType = "hero" | "text" | "image" | "gallery" | "roster" | "cta";

export type HeroBlock = {
  type: "hero";
  heading: string;
  subheading?: string;
  imageUrl?: string;
  ctaLabel?: string;
  ctaHref?: string;
};

export type TextBlock = {
  type: "text";
  content: string; // plain text / basic markdown
};

export type ImageBlock = {
  type: "image";
  url: string;
  alt?: string;
  caption?: string;
};

export type GalleryBlock = {
  type: "gallery";
  images: Array<{ url: string; alt?: string }>;
};

export type RosterBlock = {
  type: "roster";
  heading?: string;
  maxItems?: number;
};

export type CtaBlock = {
  type: "cta";
  heading: string;
  body?: string;
  buttonLabel: string;
  buttonHref: string;
};

export type PageBlock =
  | HeroBlock
  | TextBlock
  | ImageBlock
  | GalleryBlock
  | RosterBlock
  | CtaBlock;

export type PageTheme = {
  backgroundColor?: string;
  fontColor?: string;
  fontFamily?: string;
};
