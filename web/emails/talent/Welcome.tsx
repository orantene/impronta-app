import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  talentName: string | null;
  dashboardUrl: string;
  brand?: EmailBrand;
}

export default function Welcome({ talentName, dashboardUrl, brand }: Props) {
  const firstName = talentName?.trim() ? talentName.split(" ")[0] : "there";

  return (
    <Layout preview="Welcome to Tulala" brand={brand}>
      <Heading style={h2}>Welcome to Tulala</Heading>
      <Text style={body}>
        Welcome, {firstName}. Your profile is live. You can now manage bookings, respond to
        inquiries, and keep your portfolio current.
      </Text>
      <Text style={note}>
        Tip: complete your profile photos and bio so you stand out to clients.
      </Text>
      <Button href={dashboardUrl}>Go to my dashboard →</Button>
    </Layout>
  );
}

Welcome.PreviewProps = {
  talentName: "Tina Rossi",
  dashboardUrl: "https://tulala.digital/talent",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
