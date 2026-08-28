import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

const h2: React.CSSProperties = {
  margin: "0 0 8px",
  fontSize: "20px",
  fontWeight: 700,
  color: "#1a1a1a",
};
const body: React.CSSProperties = {
  margin: "0 0 16px",
  fontSize: "15px",
  color: "#444444",
  lineHeight: 1.6,
};
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };

type Props = {
  heading: string;
  intro: string;
  ctaUrl: string;
  ctaLabel?: string;
  preview: string;
  footnote?: string;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
};

export function SupportMail({
  heading,
  intro,
  ctaUrl,
  ctaLabel = "Reply in app",
  preview,
  footnote,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <Layout
      preview={preview}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={h2}>{heading}</Heading>
      <Text style={body}>{intro}</Text>
      <Button href={ctaUrl}>{ctaLabel}</Button>
      {footnote ? <Text style={note}>{footnote}</Text> : null}
    </Layout>
  );
}
