import "server-only";

import { render } from "@react-email/render";
import type { ReactElement } from "react";

/**
 * Render a React Email element to an HTML string for delivery.
 *
 * Thin wrapper over `@react-email/render` so the rest of the notification
 * engine never imports the renderer directly — keeps the channel handler
 * decoupled from the rendering library and gives us one place to add
 * plain-text generation or inlining tweaks later.
 */
export async function renderEmailHtml(element: ReactElement): Promise<string> {
  return render(element);
}
