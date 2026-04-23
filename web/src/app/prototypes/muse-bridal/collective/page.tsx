import { SectionHero } from "../_components/SectionHero";
import { IMAGERY } from "../_data/imagery";
import { DirectoryClient } from "./DirectoryClient";

/**
 * Collective (directory) page.
 *
 * Template → `directory-editorial` variant. Server component renders the
 * hero (static), hydrates filter state client-side.
 */

export default async function CollectivePage({
  searchParams,
}: {
  searchParams?: Promise<{ service?: string; destination?: string }>;
}) {
  const sp = (await searchParams) ?? {};

  return (
    <>
      <SectionHero
        eyebrow="The collective"
        headline={
          <>
            Meet the people who build{" "}
            <em
              style={{
                fontFamily: "var(--muse-font-display)",
                fontStyle: "italic",
                fontWeight: 300,
                color: "var(--muse-blush)",
              }}
            >
              your day.
            </em>
          </>
        }
        subhead="Curated, multilingual, destination-fluent. Browse the full collective or filter by service, destination, and style."
        image={IMAGERY.heroDirectory}
        compact
        overlay={0.55}
      />
      <DirectoryClient
        initialService={sp.service}
        initialDestination={sp.destination}
      />
    </>
  );
}
