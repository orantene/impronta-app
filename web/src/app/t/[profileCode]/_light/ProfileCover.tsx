/**
 * ProfileCover — full-bleed hero image (if a `hero` media asset exists).
 * Falls back to the <Monogram> elegant cover-less state when no image.
 * --plt tokens only.
 */

import Image from "next/image";
import { Monogram } from "./Monogram";

type ProfileCoverProps = {
  bannerUrl: string | null;
  name: string;
  isFeatured: boolean;
  featuredLabel: string;
};

export function ProfileCover({
  bannerUrl,
  name,
  isFeatured,
  featuredLabel,
}: ProfileCoverProps) {
  if (!bannerUrl) {
    return <Monogram name={name} />;
  }

  return (
    <div className="relative h-[38vh] min-h-[240px] w-full overflow-hidden sm:h-[46vh]">
      <Image
        src={bannerUrl}
        alt={`${name} cover`}
        fill
        /* favor the upper-centre so faces aren't cropped at the top edge */
        className="object-cover [object-position:50%_28%]"
        sizes="100vw"
        priority
      />
      {/* Bottom gradient to blend the image into the page surface */}
      <div
        className="pointer-events-none absolute inset-x-0 bottom-0 h-48"
        style={{
          background:
            "linear-gradient(to top, var(--plt-bg) 0%, color-mix(in srgb, var(--plt-bg) 20%, transparent) 55%, transparent 100%)",
        }}
      />
      {isFeatured ? (
        <div className="absolute right-5 top-5">
          <span
            className="plt-mono inline-flex items-center rounded-full border px-3 py-1 text-[0.625rem] font-medium uppercase tracking-[0.2em] backdrop-blur-sm"
            style={{
              borderColor: "var(--plt-hairline-strong)",
              background: "color-mix(in srgb, var(--plt-bg) 80%, transparent)",
              color: "var(--plt-ink)",
            }}
          >
            {featuredLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
