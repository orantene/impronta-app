// TUL-1271 / TUL-1578: the counter's "not for you" answer, rendered INLINE.
//
// A seat without the counter's capability (a cashier on an editor rank, say)
// used to hit `notFound()` here. Inside the admin shell a `notFound()` swap
// crashes the client on production builds (React #310, "This page couldn't
// load" with nothing to say why; see `admin-not-found-card.tsx`), so the
// person saw a dead end instead of a sentence. Same copy as the "no mode for
// you" gate, same route, no throw.
import Link from "next/link";

export function PosNoAccessCard({
  tr,
  backHref,
}: {
  tr: (key: string) => string;
  backHref: string;
}) {
  return (
    <main
      role="alert"
      className="mx-auto flex min-h-[60vh] w-full max-w-[560px] flex-col justify-center gap-3 px-7 py-16"
    >
      <h1 className="m-0 text-[22px] font-semibold text-admin-ink">
        {tr("dashboard.pos.counter.gate.title")}
      </h1>
      <p className="m-0 text-[14px] leading-relaxed text-admin-ink-muted">
        {tr("dashboard.pos.counter.gate.body")}
      </p>
      <Link href={backHref} className="mt-2 text-[14px] font-semibold text-admin-ink underline">
        {tr("dashboard.pos.counter.gate.back")}
      </Link>
    </main>
  );
}
