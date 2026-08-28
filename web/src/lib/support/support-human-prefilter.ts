/**
 * Cheap regex prefilter: requester asked for a human before we spend a model call.
 * Pure; safe to unit-test without server imports.
 */

const HUMAN_REQUEST =
  /\b(talk to (a )?(human|person|agent)|real person|actual person|call me|phone me|speak to (someone|a human|oran)|message oran|human please|get (me )?oran)\b/i;

const HUMAN_REQUEST_ES =
  /\b(hablar con (un |una )?(humano|humana|persona|agente)|persona real|ll[aá]mame|ll[aá]mame por tel[eé]fono|hablar con alguien|quiero (hablar con )?oran)\b/i;

export function wantsHumanSupport(message: string | null | undefined): boolean {
  const text = (message ?? "").trim();
  if (!text) return false;
  return HUMAN_REQUEST.test(text) || HUMAN_REQUEST_ES.test(text);
}
