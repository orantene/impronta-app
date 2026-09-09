import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Layout, type EmailBrand } from "../components/Layout";

/**
 * Guest notice that a pickup / takeaway ticket is ready for handoff.
 * Copy is built in `lib/preparation/notify-ready.ts` and passed in.
 */
interface Props {
  heading: string;
  lines: string[];
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function OrderReady({
  heading,
  lines,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    <Layout
      preview={lines[0] ?? heading}
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    >
      <Heading style={{ fontSize: 20, margin: "0 0 12px" }}>{heading}</Heading>
      {lines.map((line, i) => (
        <Text key={i} style={{ fontSize: 15, lineHeight: "22px", margin: "0 0 8px" }}>
          {line}
        </Text>
      ))}
    </Layout>
  );
}
