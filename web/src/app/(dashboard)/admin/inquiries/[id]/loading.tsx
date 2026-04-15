export default function AdminInquiryDetailLoading() {
  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-2 py-6 md:px-4">
      <div className="h-4 w-40 animate-pulse rounded-md bg-muted/50" aria-hidden />
      <div className="h-36 animate-pulse rounded-2xl border border-border/40 bg-muted/30" aria-hidden />
      <div className="flex gap-2 border-b border-border/40 pb-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-24 animate-pulse rounded-lg bg-muted/40" aria-hidden />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="h-72 animate-pulse rounded-2xl border border-border/40 bg-muted/25" aria-hidden />
        <div className="h-64 animate-pulse rounded-2xl border border-border/40 bg-muted/25" aria-hidden />
      </div>
    </div>
  );
}
