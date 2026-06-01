import { fidelityDesigns } from "./designs";
import { buildFidelityHtml } from "./html";

const designId = process.argv[2];

if (!designId) {
  console.error("Usage: npx tsx scripts/fidelity/render-html.ts <design-id>");
  process.exitCode = 1;
} else {
  const design = fidelityDesigns.find((candidate) => candidate.id === designId);
  if (!design) {
    console.error(`Unknown fidelity design: ${designId}`);
    process.exitCode = 1;
  } else {
    process.stdout.write(buildFidelityHtml(design));
  }
}
