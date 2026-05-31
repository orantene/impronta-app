import { Row, Column, Section, Text } from "@react-email/components";
import * as React from "react";

interface Field {
  label: string;
  value: string;
}

interface FieldTableProps {
  fields: Field[];
}

export function FieldTable({ fields }: FieldTableProps) {
  if (!fields.length) return null;
  return (
    <Section style={table}>
      {fields.map((f, i) => (
        <Row key={f.label} style={i < fields.length - 1 ? rowWithBorder : row}>
          <Column style={labelCell}>
            <Text style={labelText}>{f.label}</Text>
          </Column>
          <Column style={valueCell}>
            <Text style={valueText}>{f.value}</Text>
          </Column>
        </Row>
      ))}
    </Section>
  );
}

const table: React.CSSProperties = {
  width: "100%",
  border: "1px solid #e5e5e5",
  borderRadius: "8px",
  marginBottom: "16px",
};

const row: React.CSSProperties = {
  padding: "10px 16px",
};

const rowWithBorder: React.CSSProperties = {
  ...row,
  borderBottom: "1px solid #f0f0f0",
};

const labelCell: React.CSSProperties = {
  fontSize: "13px",
  color: "#666666",
};

const valueCell: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "#1a1a1a",
  textAlign: "right",
};

const labelText: React.CSSProperties = { margin: 0 };
const valueText: React.CSSProperties = { margin: 0 };
