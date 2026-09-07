import { Button as EmailButton } from "@react-email/components";
import * as React from "react";

import {
  TULALA_EMAIL_ACCENT,
  TULALA_EMAIL_ACCENT_ON,
} from "@/lib/brand/email-palette";

import type { EmailBrand } from "./Layout";

interface ButtonProps {
  href: string;
  /**
   * The same brand object the template hands to `Layout`.
   *
   * Required on purpose. The colour cannot ride a React context here: emails
   * render in Next's server layer, where React resolves under the
   * `react-server` condition and `createContext` is literally `undefined`.
   * And an optional prop would let a template silently keep the old
   * hardcoded colour with nothing failing. Making it required puts `tsc` in
   * charge of the one thing that is easy to miss across 52 templates.
   */
  brand: EmailBrand | undefined;
  children: React.ReactNode;
}

/**
 * The primary call to action.
 *
 * The background used to be a literal `#c9a227`. That hex is not a platform
 * colour — `globals.css` names it `--impronta-gold` and it is one tenant's
 * `agency_branding.primary_color` — so every workspace's mail and the
 * platform's own support mail shipped the same gold button, which is why they
 * were indistinguishable in the inbox. The colour now comes from the resolved
 * brand, and the label colour is contrast-picked rather than assumed white,
 * because a pale brand colour under white text is an unreadable CTA.
 */
export function Button({ href, brand, children }: ButtonProps) {
  const backgroundColor = brand?.accent ?? TULALA_EMAIL_ACCENT;
  const color = brand?.accentOn ?? TULALA_EMAIL_ACCENT_ON;
  return (
    <EmailButton href={href} style={{ ...btn, backgroundColor, color }}>
      {children}
    </EmailButton>
  );
}

const btn: React.CSSProperties = {
  display: "inline-block",
  marginTop: "20px",
  padding: "12px 24px",
  textDecoration: "none",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "14px",
};
