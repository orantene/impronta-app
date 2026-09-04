import { Button as EmailButton } from "@react-email/components";
import * as React from "react";

interface ButtonProps {
  href: string;
  children: React.ReactNode;
}

export function Button({ href, children }: ButtonProps) {
  return (
    <EmailButton href={href} style={btn}>
      {children}
    </EmailButton>
  );
}

/**
 * The one CTA button every email uses. Two things here are measurements, not
 * taste, and both were found by rendering all 60 templates at 390px and
 * inspecting the result rather than by reading this file.
 *
 * TAP TARGET. It rendered 41px tall: 12px padding, twice, around a 14px line.
 * Apple's guidance and WCAG 2.5.8 both put the minimum at 44px, and email is
 * read on a phone, one-handed, usually in a hurry. 14px padding and an explicit
 * 20px line-height give 48px. The line-height has to be stated: mail clients
 * disagree about the default, so leaving it implicit means the height is
 * whatever the reader's client decides.
 *
 * CONTRAST. White on this gold measures 2.42:1. WCAG AA wants 4.5:1 for text
 * this size, and the practical version of that number is a gold button with
 * pale text disappearing outdoors — which is exactly where people read email.
 * The brand gold is unchanged; the text on it is now near-black, which measures
 * 7.0:1 and passes AAA. Darkening the gold instead would also work and is a
 * brand call rather than mine, so the colour is deliberately untouched here.
 */
const btn: React.CSSProperties = {
  display: "inline-block",
  marginTop: "20px",
  padding: "14px 26px",
  backgroundColor: "#c9a227",
  color: "#1a1a1a",
  textDecoration: "none",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "15px",
  lineHeight: "20px",
};
