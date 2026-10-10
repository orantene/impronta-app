// Static first-paint skeleton for the talent dashboard shell. Server component,
// no data, no client JS. Mirrors the real shell geometry (TalentSurface in
// components/admin/shell/internal/talent.tsx): a sticky 56px header strip, a
// 240px nav column, and a content area capped at 1240px. Below 721px the nav
// column drops out, as the real shell hides it under 720px.
//
// TUL-536: pulse fills use black/alpha, not --tc-border / --tc-canvas. Those
// tokens are unset while the shell CSS is still loading, so a var()-only
// skeleton painted as blank on phone Hoy after sign-in.

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-black/[0.06] ${className}`} />;
}

export function TalentShellSkeleton() {
  return (
    <div
      aria-busy="true"
      data-testid="talent-shell-skeleton"
      className="min-h-screen bg-[#f7f6f4]"
    >
      <div
        data-talent-shell-skeleton="header"
        className="sticky top-0 z-10 flex h-[56px] items-center gap-[12px] border-b border-black/[0.08] bg-[#f7f6f4] px-[16px]"
      >
        <Block className="h-[24px] w-[96px]" />
        <div className="flex-1" />
        <Block className="h-[28px] w-[28px] rounded-full" />
      </div>
      <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 min-[721px]:grid-cols-[240px_1fr]">
        <div className="hidden border-r border-black/[0.08] min-[721px]:block">
          <div className="flex flex-col gap-[10px] p-[16px]">
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
          </div>
        </div>
        <main
          data-talent-shell-skeleton="hoy"
          className="mx-auto w-full max-w-[1240px] space-y-4 px-[16px] pb-[96px] pt-[28px] min-[721px]:px-[28px]"
        >
          <Block className="h-8 w-56 rounded-lg" />
          <Block className="h-4 w-40 rounded" />
          <Block className="h-28 rounded-2xl" />
          <Block className="h-44 rounded-2xl" />
          <Block className="h-[160px] rounded-2xl" />
        </main>
      </div>
    </div>
  );
}
