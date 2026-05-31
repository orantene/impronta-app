import { Link, Text } from "@react-email/components";
import * as React from "react";

interface UnsubscribeFooterProps {
  /**
   * One-click unsubscribe URL for this category. The email channel injects it
   * at send time (token-based, per-recipient). If omitted — e.g. a `required`
   * category like account_security or billing — nothing renders.
   */
  unsubscribeUrl?: string;
  /** Human label for the category, e.g. "offer updates". */
  categoryLabel?: string;
}

/**
 * Per-category one-click unsubscribe line (spec §8). Rendered in the Layout
 * footer for non-required categories. Required categories pass no URL, so this
 * renders null and no link appears.
 */
export function UnsubscribeFooter({ unsubscribeUrl, categoryLabel }: UnsubscribeFooterProps) {
  if (!unsubscribeUrl) return null;
  const what = categoryLabel ? `${categoryLabel} emails` : "these emails";
  return (
    <Text style={text}>
      Don&apos;t want {what}?{" "}
      <Link href={unsubscribeUrl} style={link}>
        Unsubscribe
      </Link>
    </Text>
  );
}

const text: React.CSSProperties = {
  fontSize: "12px",
  color: "#aaaaaa",
  margin: "8px 0 0",
};

const link: React.CSSProperties = {
  color: "#aaaaaa",
  textDecoration: "underline",
};
