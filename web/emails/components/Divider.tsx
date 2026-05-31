import { Hr } from "@react-email/components";
import * as React from "react";

interface DividerProps {
  /** Vertical margin in px. Default 20. */
  spacing?: number;
}

export function Divider({ spacing = 20 }: DividerProps) {
  return <Hr style={{ ...hr, margin: `${spacing}px 0` }} />;
}

const hr: React.CSSProperties = {
  border: "none",
  borderTop: "1px solid #ececec",
};
