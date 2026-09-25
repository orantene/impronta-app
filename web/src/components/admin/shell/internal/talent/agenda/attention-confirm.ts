export const AGENDA_ATTENTION_CONFIRM_KEY = "tulala:agenda:attentionConfirm";

/** Call after a Needs-attention CTA succeeds so the page can show who was told. */
export function setAgendaAttentionConfirm(who: string) {
  try {
    sessionStorage.setItem(AGENDA_ATTENTION_CONFIRM_KEY, `Told ${who}.`);
  } catch {
    /* ignore */
  }
}
