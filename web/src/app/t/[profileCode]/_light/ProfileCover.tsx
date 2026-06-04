/**
 * ProfileCover — full-bleed hero image (if a `hero` media asset exists).
 * Falls back to the <Monogram> elegant cover-less state when no image.
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
      {/* Subtle bottom gradient to blend into white page */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-white/90 via-white/20 to-transparent" />
      {/* Light grain overlay */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='300' height='300' filter='url(%23n)' opacity='1'/%3E%3C/svg%3E\")",
        }}
      />
      {isFeatured ? (
        <div className="absolute right-5 top-5">
          <span className="rounded-full border border-[#1A1A1A]/12 bg-white/80 px-3 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-[#1A1A1A] backdrop-blur-sm">
            {featuredLabel}
          </span>
        </div>
      ) : null}
    </div>
  );
}
