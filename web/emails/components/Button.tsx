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

const btn: React.CSSProperties = {
  display: "inline-block",
  marginTop: "20px",
  padding: "12px 24px",
  backgroundColor: "#c9a227",
  color: "#ffffff",
  textDecoration: "none",
  borderRadius: "8px",
  fontWeight: 600,
  fontSize: "14px",
};
