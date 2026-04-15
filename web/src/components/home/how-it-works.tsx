import { Search, Bookmark, Send } from "lucide-react";

export type HowItWorksCopy = {
  sectionKicker: string;
  sectionTitle: string;
  step1Title: string;
  step1Body: string;
  step2Title: string;
  step2Body: string;
  step3Title: string;
  step3Body: string;
};

export function HowItWorks({ copy }: { copy: HowItWorksCopy }) {
  const STEPS = [
    {
      icon: <Search className="size-6" />,
      title: copy.step1Title,
      description: copy.step1Body,
    },
    {
      icon: <Bookmark className="size-6" />,
      title: copy.step2Title,
      description: copy.step2Body,
    },
    {
      icon: <Send className="size-6" />,
      title: copy.step3Title,
      description: copy.step3Body,
    },
  ];

  return (
    <section className="w-full px-4 py-10 sm:px-6 sm:py-16 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <h2 className="text-center font-display text-sm font-medium uppercase tracking-[0.3em] text-[var(--impronta-gold-dim)]">
          {copy.sectionKicker}
        </h2>
        <p className="mt-2 text-center text-2xl font-light tracking-wide text-foreground sm:text-3xl">
          {copy.sectionTitle}
        </p>

        <div className="mt-12 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={i} className="text-center">
              <p className="font-display text-xs tracking-[0.3em] text-[var(--impronta-gold-dim)]">
                {String(i + 1).padStart(2, "0")}
              </p>
              <div className="mx-auto mt-2.5 flex size-14 items-center justify-center rounded-full border border-[var(--impronta-gold-border)] bg-[var(--impronta-gold)]/5 text-[var(--impronta-gold)]">
                {step.icon}
              </div>
              <h3 className="mt-5 text-base font-semibold text-foreground">
                {step.title}
              </h3>
              <p className="mt-2 text-m leading-relaxed text-[var(--impronta-muted)]">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
