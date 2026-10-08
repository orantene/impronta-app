// Static first-paint skeleton for the talent dashboard shell. Server component,
// no data, no client JS. Mirrors the real shell geometry (TalentSurface in
// components/admin/shell/internal/talent.tsx): a sticky 56px header strip, a
// 240px nav column, and a content area capped at 1240px. Below 721px the nav
// column drops out, as the real shell hides it under 720px.

function Block({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-[10px] bg-[var(--tc-border)] ${className}`} />;
}

export function TalentShellSkeleton() {
  return (
    <div aria-busy="true" className="min-h-screen bg-[var(--tc-canvas)]">
      <div
        data-talent-shell-skeleton="header"
        className="sticky top-0 z-10 flex h-[56px] items-center gap-[12px] border-b border-[var(--tc-border)] bg-[var(--tc-canvas)] px-[16px]"
      >
        <Block className="h-[24px] w-[96px]" />
        <div className="flex-1" />
        <Block className="h-[28px] w-[28px] rounded-full" />
      </div>
      <div className="grid min-h-[calc(100vh-56px)] grid-cols-1 min-[721px]:grid-cols-[240px_1fr]">
        <div className="hidden border-r border-[var(--tc-border)] min-[721px]:block">
          <div className="flex flex-col gap-[10px] p-[16px]">
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
            <Block className="h-[32px] w-full" />
          </div>
        </div>
        <main className="mx-auto w-full max-w-[1240px] px-[16px] pb-[96px] pt-[28px] min-[721px]:px-[28px]">
          <Block className="mb-[20px] h-[32px] w-[240px]" />
          <div className="grid grid-cols-1 gap-[16px] min-[721px]:grid-cols-2">
            <Block className="h-[160px]" />
            <Block className="h-[160px]" />
          </div>
          <Block className="mt-[16px] h-[220px] w-full" />
        </main>
      </div>
    </div>
  );
}
