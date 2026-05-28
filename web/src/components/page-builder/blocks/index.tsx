import type { PageBlock } from "./types";
import { HeroBlockRenderer } from "./HeroBlock";
import { TextBlockRenderer } from "./TextBlock";
import { ImageBlockRenderer } from "./ImageBlock";
import { GalleryBlockRenderer } from "./GalleryBlock";
import { RosterBlockRenderer } from "./RosterBlock";
import { CtaBlockRenderer } from "./CtaBlock";

export async function BlocksRenderer({
  blocks,
  tenantId,
}: {
  blocks: PageBlock[];
  tenantId: string;
}) {
  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case "hero":
            return <HeroBlockRenderer key={i} block={block} />;
          case "text":
            return <TextBlockRenderer key={i} block={block} />;
          case "image":
            return <ImageBlockRenderer key={i} block={block} />;
          case "gallery":
            return <GalleryBlockRenderer key={i} block={block} />;
          case "roster":
            return <RosterBlockRenderer key={i} block={block} tenantId={tenantId} />;
          case "cta":
            return <CtaBlockRenderer key={i} block={block} />;
          default:
            return null;
        }
      })}
    </>
  );
}

export type { PageBlock, PageTheme } from "./types";
