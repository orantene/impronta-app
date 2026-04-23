import { SectionFeaturedCreators } from "./_components/SectionFeaturedCreators";
import { SectionFinalCTA } from "./_components/SectionFinalCTA";
import { SectionHero } from "./_components/SectionHero";
import { SectionMetrics } from "./_components/SectionMetrics";
import { SectionNiches } from "./_components/SectionNiches";
import { SectionSplit } from "./_components/SectionSplit";
import { SectionTestimonials } from "./_components/SectionTestimonials";
import { SectionUseCases } from "./_components/SectionUseCases";
import { SectionWhy } from "./_components/SectionWhy";

/**
 * Creator Circuit homepage.
 *
 * Thin composition — each child is a CMS-candidate section. When promoted
 * to the tenant theme system this file becomes a `sections[]` render loop
 * driven by a tenant's homepage document.
 */
export default function CreatorCircuitHome() {
  return (
    <>
      <SectionHero />
      <SectionNiches />
      <SectionFeaturedCreators />
      <SectionUseCases />
      <SectionWhy />
      <SectionMetrics />
      <SectionSplit />
      <SectionTestimonials />
      <SectionFinalCTA />
    </>
  );
}
