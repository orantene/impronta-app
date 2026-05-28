import { Heading, Text } from "@react-email/components";
import * as React from "react";
import { Button } from "../components/Button";
import { Layout, type EmailBrand } from "../components/Layout";

interface Props {
  talentName: string | null;
  profileUrl: string;
  brand?: EmailBrand;
}

export default function ProfileApproved({ talentName, profileUrl, brand }: Props) {
  const name = talentName ?? "there";

  return (
    <Layout preview="Your profile is approved" brand={brand}>
      <Heading style={h2}>Your profile is approved</Heading>
      <Text style={body}>
        Hi {name}, your profile has been reviewed and approved. It&apos;s now visible and
        discoverable to clients.
      </Text>
      <Text style={note}>
        Keep your availability and portfolio up to date so clients always see your best work.
      </Text>
      <Button href={profileUrl}>View my profile →</Button>
    </Layout>
  );
}

ProfileApproved.PreviewProps = {
  talentName: "Tina Rossi",
  profileUrl: "https://tulala.digital/t/tina-rossi",
} satisfies Props;

const h2: React.CSSProperties = { margin: "0 0 8px", fontSize: "20px", fontWeight: 700, color: "#1a1a1a" };
const body: React.CSSProperties = { margin: "0 0 16px", fontSize: "15px", color: "#444444", lineHeight: 1.6 };
const note: React.CSSProperties = { margin: "0", fontSize: "13px", color: "#777777" };
