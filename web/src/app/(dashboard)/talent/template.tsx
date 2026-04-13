/** Segment transition — layout remounts children on route change; keep this as a server component. */
export default function TalentTemplate({ children }: { children: React.ReactNode }) {
  return <div className="animate-dashboard-segment-in">{children}</div>;
}
