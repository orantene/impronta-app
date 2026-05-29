import { MARKETING_PHOTOS } from "@/lib/marketing/photography";
import { MarketingContainer, MarketingSection } from "./container";
import { EditorialFrame } from "./editorial-image";

/**
 * Homepage lifestyle band — a single wide editorial photo that breathes
 * between hero and contrast. Purpose: make the opportunity feel real for
 * service professionals, performers, and operators before the product logic
 * takes over.
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
            eyebrow="Real work, packaged beautifully"
            caption="Cleaner, chef, beauty pro, performer — Tulala turns the service into a sellable page and a real request flow."
          />
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
