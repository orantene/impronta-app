import { FLOATING_CHROME_STACK_CSS } from "@/lib/talent-site/floating-chrome-stack";

/** Root-layout mount: floating chrome rules on every public page, including /politicas. */
export function FloatingChromeStackStyles() {
  return <style>{FLOATING_CHROME_STACK_CSS}</style>;
}
