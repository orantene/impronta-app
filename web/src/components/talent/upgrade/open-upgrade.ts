/**
 * TUL-829 · `openUpgrade({ feature, from })`, the one call every talent
 * paywall makes.
 *
 * Shows the in-app upgrade modal when a host is mounted. When none is (a
 * route that renders neither the shell nor the builder), it goes straight to
 * the checkout entry point, so a locked feature is never a dead end.
 */

import { startUpgradeCheckout } from "./start-upgrade-checkout";
import { planForFeature, type UpgradeRequest } from "./upgrade-modal-model";
import { showUpgradeModal } from "./upgrade-store";

export type { UpgradeFeature, UpgradeRequest } from "./upgrade-modal-model";

export function openUpgrade(request: UpgradeRequest): void {
  if (showUpgradeModal(request)) return;
  startUpgradeCheckout({ planKey: planForFeature(request.feature), interval: "m", from: request.from });
}
