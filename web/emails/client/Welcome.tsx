import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  clientName: string | null;
  dashboardUrl: string;
  brand?: EmailBrand;
}

export default function Welcome({ clientName, dashboardUrl, brand }: Props) {
  const name = clientName ?? "there";

  return (
    <Layout preview="Welcome to Tulala" brand={brand}>
      <Heading style={h2}>Welcome to Tulala</Heading>
      <Text style={body}>
        Welcome, {name}. You can now browse talent, send inquiries, and track your bookings all in
        one place.
      </Text>
      <Text style={note}>
        Tip: every message and offer stays in one organized place &mdash; no more scattered WhatsApp
        threads.
      </Text>
      <Button href={dashboardUrl}>Browse talent →</Button>
    </Layout>
  );
}

Welcome.PreviewProps = {
  clientName: "Marco Bianchi",
  dashboardUrl: "https://tulala.digital/client",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
