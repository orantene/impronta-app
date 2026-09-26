/**
 * /dev/maison-visual — flag-on visual harness for Maison setup chrome (PDF sign-off).
 *
 * Production-gated like other /dev/* routes. Mounts the real PR4–PR8 setup
 * screens with stub talent id + no-op callbacks so agents can screenshot at
 * 1280 / 390 without flipping the prod Maison flag or seeding fixtures.
 *
 * Query: ?screen=gallery|detail|detail-choices|detail-mine|detail-phone-colors|
 *               review-chrome|live-card|custom-colors|options-chrome|finish-card
 */
import { notFound } from "next/navigation";
import { MaisonVisualHarness } from "./MaisonVisualHarness";

export const dynamic = "force-dynamic";

const SCREENS = new Set([
  "gallery",
  "detail",
  "detail-choices",
  "detail-mine",
  "detail-phone-colors",
  "review-chrome",
  "live-card",
  "custom-colors",
  "options-chrome",
  "finish-card",
  "unlocked-card",
]);

export default async function MaisonVisualPage({
  searchParams,
}: {
  searchParams: Promise<{ screen?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const sp = await searchParams;
  const screen = sp.screen && SCREENS.has(sp.screen) ? sp.screen : "gallery";
  return <MaisonVisualHarness screen={screen} />;
}
