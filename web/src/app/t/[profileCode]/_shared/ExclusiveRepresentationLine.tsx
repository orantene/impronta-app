import { InfoTip } from "@/components/ui/info-tip";

/**
 * "Exclusively represented by {agency}" + an (i) explainer.
 *
 * One quiet sentence, shared by all four profile templates, that replaces the
 * loud EXCLUSIVE badge as the primary place exclusivity is communicated. The
 * badge is a stamp with no explanation; this says who holds the relationship
 * and — behind the icon — what it means for the person trying to book.
 *
 * Server component. `InfoTip` is the client island (it must open on TAP, not
 * just hover, so a phone visitor can read the explanation at all); everything
 * else renders on the server.
 *
 * Styling is passed in rather than themed here: the four templates have
 * genuinely different type registers (Classic sentence case, Atelier tracked
 * uppercase micro-type, Noir near-black ground) and hard-coding one look would
 * make the line read as foreign in three of them. `tone` only picks the
 * tooltip BUBBLE palette, because an unreadable bubble is a bug, not a taste
 * question.
 */
export function ExclusiveRepresentationLine({
  agency,
  t,
  className,
  style,
  iconClassName,
  tone = "light",
}: {
  /** Agency public display name. */
  agency: string;
  /** Translator from the profile view. Keys are resolved here so the four
   *  templates don't each repeat the same three lookups. */
  t: (key: string) => string;
  /** Template-supplied classes for the sentence itself. */
  className?: string;
  /** Template-supplied inline style (token colors live here, not in classes). */
  style?: React.CSSProperties;
  /** Template-supplied classes for the (i) trigger. */
  iconClassName?: string;
  /** Tooltip bubble palette. Dark grounds (Noir) must pass "dark". */
  tone?: "light" | "dark";
}) {
  // `t` returns raw catalog strings — interpolation is the caller's job.
  const text = t("public.profile.exclusivelyRepresentedBy").replace("{agency}", agency);
  const body = t("public.profile.exclusivityInfoBody").replace("{agency}", agency);

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${className ?? ""}`}
      style={style}
    >
      {text}
      <InfoTip
        label={body}
        triggerLabel={t("public.profile.exclusivityInfoAria")}
        size={12}
        // Opens BELOW the line: the line sits under the hero chips, so a
        // top-anchored bubble covers the name/chips it is explaining.
        placement="bottom-start"
        className={iconClassName ?? "opacity-60 transition-opacity hover:opacity-100"}
        bubbleClassName={
          tone === "dark"
            ? "border-white/15 bg-[#141317] text-[rgba(236,228,211,0.86)]"
            : "border-zinc-200 bg-white text-zinc-700"
        }
      />
    </span>
  );
}
