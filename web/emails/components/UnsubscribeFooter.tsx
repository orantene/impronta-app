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
  /**
   * Reader's language. This line was hardcoded English inside emails that are
   * otherwise fully translated, so the one link a Spanish reader needs in order
   * to stop hearing from us was the one line they could not read.
   */
  locale?: string;
}

/**
 * Per-category one-click unsubscribe line (spec §8). Rendered in the Layout
 * footer for non-required categories. Required categories pass no URL, so this
 * renders null and no link appears.
 */
export function UnsubscribeFooter({
  unsubscribeUrl,
  categoryLabel,
  locale,
}: UnsubscribeFooterProps) {
  if (!unsubscribeUrl) return null;
  // Spanish deliberately says "estos correos" rather than interpolating the
  // category label: those labels ("platform alerts", "offer updates") are
  // English nouns, and dropping one into a Spanish sentence reads worse than
  // the slightly less specific phrasing.
  const es = locale === "es";
  const what = es ? "estos correos" : categoryLabel ? `${categoryLabel} emails` : "these emails";
  return (
    <Text style={text}>
      {es ? `¿No quieres ${what}? ` : `Don't want ${what}? `}
      <Link href={unsubscribeUrl} style={link}>
        {es ? "Cancelar la suscripción" : "Unsubscribe"}
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
