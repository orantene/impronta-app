import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Layout, type EmailBrand } from "../components/Layout";

/**
 * The reminder somebody gets the day before a class, show or departure.
 *
 * WHY THIS IS NOT `TableReserved`. Its fields would fit — it also takes a
 * heading and lines — but its own docstring exists to warn against squeezing
 * content into a template shaped for something else, and a class reminder
 * rendering a component named `TableReserved` is a name that lies at every call
 * site. The reusable part is the copy builder, not the shell around it.
 *
 * WHY THIS IS NOT `BookingConfirmed` either: that is shaped for a job with a
 * client, a location and a button into an account. A class member has no
 * account and nothing to confirm — they are being reminded, not told.
 *
 * THE COPY IS NOT IN HERE. `buildSessionReminder` in
 * `lib/sessions/reminder-copy.ts` produces the subject, heading and lines, in
 * the VENUE's clock with the zone named, in en or es, and it is tested. This
 * renders what it returns. Any later receipt or /me page must call the same
 * function, or a customer is told two different times by two surfaces that both
 * look official.
 */
interface Props {
  heading: string;
  lines: string[];
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

export default function SessionReminder({
  heading,
  lines,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  return (
    // The inbox preview line is REQUIRED by Layout and is derived here rather
    // than asked of the caller, so no future sender can forget it and ship a
    // reminder whose preview is whatever text the client scrapes first.
    // lines[0] is the "at <time> (<zone>)" line, which complements the subject
    // (that names the class) instead of repeating it. Already localised by
    // buildSessionReminder, so this adds no untranslated string.
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
