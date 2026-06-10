"use client";

const dangerStyle: React.CSSProperties = {
  border: "1px solid rgba(243,103,114,0.50)",
  background: "rgba(243,103,114,0.12)",
  color: "#F36772",
  borderRadius: 8,
  padding: "8px 12px",
  fontSize: 12,
  fontWeight: 700,
  fontFamily: '"Inter", system-ui, sans-serif',
  cursor: "pointer",
};

export function ConfirmSubmitButton({
  children,
  message,
}: {
  children: React.ReactNode;
  message?: string;
}) {
  function handleClick(e: React.MouseEvent<HTMLButtonElement>) {
    const ok = window.confirm(
      message ?? "Permanently remove? This cannot be undone.",
    );
    if (!ok) e.preventDefault();
  }

  return (
    <button type="submit" style={dangerStyle} onClick={handleClick}>
      {children}
    </button>
  );
}
