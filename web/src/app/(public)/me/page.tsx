import type { Metadata } from "next";

import { EmailCodeForm } from "@/components/auth/email-code-form";
import { getRequestLocale } from "@/i18n/request-locale";
import { getPublicHostContext } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { loadTenantWords } from "@/lib/words/server";
import { loadMeData } from "@/lib/me/load-me";
import { formatAmount, type MeItem } from "@/lib/me/shape-me";

/**
 * `/me` — the customer's view of THIS tenant. F5.
 *
 * The lighter door the five non-agency business types need: upcoming visits,
 * things waiting on you, past visits, signed in by email code with no password
 * and no profile to fill. The registered client dashboard is NOT replaced — it
 * stays for agency-style clients who manage quotes and approvals, and links
 * here.
 *
 * IT DOES NOT SAY ANYTHING ABOUT ACCOUNTS, and that is deliberate.
 * `ensureGuestClientByEmail` already provisions an `auth.users` row for guests
 * (nine call sites), so a first-time diner very often HAS an account they never
 * knowingly created. Branching on "account exists" would tell them they already
 * have one, which is true only because we made it for them without asking. The
 * form signs them in either way and stays quiet about it.
 *
 * Tenant-scoped by construction: `loadMeData` takes the resolved tenant and
 * returns nothing without it. The cross-tenant view is the existing client hub
 * on the platform host, not this page.
 */

export const metadata: Metadata = {
  title: "Your visits",
  // A personal page must never be indexed, and it is behind a session anyway.
  robots: { index: false, follow: false },
};

function Row({ item, es }: { item: MeItem; es: boolean }) {
  const money = formatAmount(item.booking?.amountCents ?? null, item.booking?.currencyCode ?? null);
  const when = item.eventDate
    ? new Date(item.eventDate).toLocaleDateString(es ? "es-MX" : "en-US", {
        weekday: "short",
        day: "numeric",
        month: "short",
      })
    : null;

  return (
    <li className="rounded-xl border border-black/10 p-4">
      <div className="flex items-start justify-between gap-3">
        <span className="font-medium">
          {item.title ?? (es ? "Tu reserva" : "Your booking")}
        </span>
        {money ? <span className="text-sm tabular-nums">{money}</span> : null}
      </div>
      {when || item.eventLocation ? (
        <p className="mt-1 text-sm opacity-70">
          {[when, item.eventLocation].filter(Boolean).join(" · ")}
        </p>
      ) : null}
    </li>
  );
}

function Section({
  title,
  items,
  es,
}: {
  title: string;
  items: MeItem[];
  es: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-8">
      <h2 className="text-xs font-semibold uppercase tracking-wide opacity-60">{title}</h2>
      <ul className="mt-3 flex flex-col gap-3">
        {items.map((item) => (
          <Row key={item.id} item={item} es={es} />
        ))}
      </ul>
    </section>
  );
}

export default async function MePage() {
  const locale = await getRequestLocale();
  const es = locale === "es";
  const ctx = await getPublicHostContext();
  const tenantId = ctx?.kind === "agency" ? ctx.tenantId : "";

  const { user } = await getCachedActorSession();

  const [identity, words] = await Promise.all([
    tenantId ? loadPublicIdentity(tenantId) : Promise.resolve(null),
    loadTenantWords(tenantId, es ? "es" : "en"),
  ]);
  const brand = identity?.public_name?.trim() || null;
  // "Your visits" for a restaurant, "Your projects" for an agency: the noun
  // comes from the words engine, never from a hardcode.
  const heading = words.word("customers.home");

  if (!user) {
    return (
      <main className="mx-auto w-full max-w-md px-4 py-16 sm:px-6">
        <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
        <p className="mt-2 text-sm opacity-70">
          {es
            ? "Te enviamos un código para entrar. Sin contraseña."
            : "We will email you a code to sign in. No password."}
        </p>
        <div className="mt-6">
          {/* allowCreate stays true: see the file header. A guest who bought
              with an email must get in without being told anything about
              accounts. */}
          <EmailCodeForm nextPath="/me" locale={locale} allowCreate />
        </div>
      </main>
    );
  }

  const data = await loadMeData(user.id, tenantId);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-12 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
      {brand ? <p className="mt-1 text-sm opacity-70">{brand}</p> : null}

      {data.isEmpty ? (
        <p className="mt-8 text-sm opacity-70">
          {es
            ? "Todavía no hay nada por aquí. Cuando reserves algo, aparecerá en esta página."
            : "Nothing here yet. Once you book something, it shows up on this page."}
        </p>
      ) : (
        <>
          <Section
            title={es ? "Te toca a ti" : "Waiting on you"}
            items={data.waitingOnYou}
            es={es}
          />
          <Section title={es ? "Próximo" : "Upcoming"} items={data.upcoming} es={es} />
          <Section title={es ? "Anterior" : "Past"} items={data.past} es={es} />
        </>
      )}
    </main>
  );
}
