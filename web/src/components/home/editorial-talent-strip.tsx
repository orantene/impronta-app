import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";

const samples = [
  {
    name: "Sofia M.",
    line: "Editorial · Barcelona",
    tone: "from-stone-900/80 to-stone-950",
  },
  {
    name: "James R.",
    line: "Commercial · London",
    tone: "from-zinc-800/90 to-zinc-950",
  },
  {
    name: "Amélie V.",
    line: "Runway · Paris",
    tone: "from-neutral-900/85 to-neutral-950",
  },
];

export function EditorialTalentStrip() {
  return (
    <section className="w-full border-t border-border/50 px-4 py-20 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-6xl">
        <p className="font-display text-sm font-medium uppercase tracking-[0.28em] text-primary">
          Featured presence
        </p>
        <h2 className="mt-4 max-w-lg font-display text-2xl font-normal tracking-wide text-foreground sm:text-3xl">
          Editorial cards — image first, detail light.
        </h2>
        <p className="mt-4 max-w-xl text-muted-foreground">
          Directory tiles will follow this rhythm: one focal image, a name, and
          a single line of context.
        </p>

        <ul className="mt-14 grid list-none gap-8 sm:grid-cols-2 lg:grid-cols-3 lg:gap-10">
          {samples.map((item) => (
            <li key={item.name}>
              <Link href="/directory" className="group block focus-visible:outline-none">
                <Card className="overflow-hidden border-border/30 bg-card/40 transition-colors duration-300 hover:border-border/60">
                  <div
                    className={`relative aspect-[3/4] bg-gradient-to-b ${item.tone}`}
                  >
                    <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_20%,rgba(201,162,39,0.08),transparent_55%)]" />
                  </div>
                  <CardContent className="pt-6">
                    <p className="font-display text-lg tracking-wide text-foreground">
                      {item.name}
                    </p>
                    <p className="mt-1 text-m text-muted-foreground">{item.line}</p>
                    <p className="mt-4 text-sm uppercase tracking-[0.2em] text-primary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
                      View in directory
                    </p>
                  </CardContent>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
