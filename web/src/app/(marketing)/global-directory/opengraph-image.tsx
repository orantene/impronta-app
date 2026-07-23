import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/seo/og-card";

// This route renders the /directory public path (proxy.ts rewrites
// /directory -> /global-directory), so the OG card here is what shows up
// when someone shares tulala.digital/directory.
export const alt = "Hire vetted talent: models, chefs, photographers and more · Tulala";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderOgCard({
    kicker: "Directory",
    title: "Hire vetted talent, from every roster.",
    subtitle: "Models, chefs, photographers, and more. Search by craft, location, and availability.",
  });
}
