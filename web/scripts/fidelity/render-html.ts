import { fidelityDesigns } from "./designs";
import { buildFidelityHtml } from "./html";

const designId = process.argv[2];
// Optional: a base URL for the bundled woff2 (trailing slash). The e2e golden
// spec passes its localhost server's `/_fidelity-fonts/` origin so bundled
// faces load over http (the relative default can't resolve under the served
// HTML when the page is navigated rather than written next to the fonts dir).
const fontsBaseUrl = process.argv[3];

if (!designId) {
  console.error("Usage: npx tsx scripts/fidelity/render-html.ts <design-id> [fontsBaseUrl]");
  process.exitCode = 1;
} else {
  const design = fidelityDesigns.find((candidate) => candidate.id === designId);
  if (!design) {
    console.error(`Unknown fidelity design: ${designId}`);
    process.exitCode = 1;
  } else {
    process.stdout.write(
      buildFidelityHtml(design, fontsBaseUrl ? { fontsBaseUrl } : {}),
    );
  }
}
