/** TUL-824: placeholder rows while the services list loads. */
export function ServicesListSkeleton() {
  return (
    <div data-testid="services-list-skeleton" aria-hidden="true" className="space-y-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-[68px] animate-pulse rounded-[12px] border border-admin-border-soft bg-black/[0.04]" />
      ))}
    </div>
  );
}
