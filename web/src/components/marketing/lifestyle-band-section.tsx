import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingSection } from "./container";
import { EditorialFrame } from "./editorial-image";

/**
 * Homepage lifestyle band — a single wide editorial photo that breathes
 * between hero and contrast. Purpose: ground the product story in a human
 * moment (two people reviewing a roster together) before the pain/gain
 * argument lands. The frame's grade overlay pulls the photo into the
 * Rostra palette so it reads as part of the brand, not a decoration.
 */
export function LifestyleBandSection() {
  return (
    <MarketingSection spacing="tight" className="relative">
      <MarketingContainer size="wide">
        <div className="relative">
          <EditorialFrame
            photo={MARKETING_PHOTOS.reviewMoment}
            aspect="wide"
            size="lg"
            tone="ink"
            priority
            eyebrow="The moment the work changes"
            caption="Same roster, same clients — presented like a business instead of a group chat."
          />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
