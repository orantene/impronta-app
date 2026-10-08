/** Presence banner copy (EN + ES via the editor translator), kept out of edit-shell. */
export function presenceBannerMessage(
  peopleNames: string[],
  myOtherTabs: number,
  locale: string,
  t: (s: string) => string,
): string | null {
  if (peopleNames.length > 0) {
    const es = locale === "es";
    const [first, second] = peopleNames;
    const names =
      peopleNames.length === 1
        ? first
        : peopleNames.length === 2
          ? `${first} ${es ? "y" : "and"} ${second}`
          : es
            ? `${first} y ${peopleNames.length - 1} más`
            : `${first} and ${peopleNames.length - 1} others`;
    const one = peopleNames.length === 1;
    const base = es
      ? `${names} también ${one ? "está" : "están"} editando esta página`
      : `${names} ${one ? "is" : "are"} also editing this page`;
    return myOtherTabs > 0 ? `${base} · ${t("also open in another tab of yours")}` : base;
  }
  if (myOtherTabs === 1) return t("You have this page open in another tab. Edits there can conflict.");
  if (myOtherTabs > 1) {
    return t("You have this page open in {n} other tabs. Edits there can conflict.").replace(
      "{n}",
      String(myOtherTabs),
    );
  }
  return null;
}
