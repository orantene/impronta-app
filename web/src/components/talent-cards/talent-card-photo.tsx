"use client";

import Image from "next/image";
import { useState } from "react";

import { TalentCardEmptyPlate } from "./talent-card-empty-plate";

/**
 * TUL-1785: a card photo that fails to load (a dead URL, a seed image that was never uploaded) used to leave a blank
 * box: 6 of the first 24 hub directory cards on staging. On error the card falls back to the SAME designed plate as a
 * card with no photo at all (J9), so a broken image and a missing image look identical and neither looks broken.
 * Client-only because the load error only exists in the browser; the server renders the image as before.
 */
export function TalentCardPhoto({
  src,
  alt,
  discipline,
  priority,
  sizes,
}: {
  src: string;
  alt: string;
  discipline: string | null;
  priority?: boolean;
  sizes: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) return <TalentCardEmptyPlate discipline={discipline} />;
  return (
    <Image
      src={src}
      alt={alt}
      fill
      className="object-cover transition-transform duration-500 group-hover/card:scale-[1.03]"
      sizes={sizes}
      priority={priority}
      onError={() => setFailed(true)}
    />
  );
}
