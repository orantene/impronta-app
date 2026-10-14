/** Words for the admin-only trust health pill, in the dashboard language. */
export function riskScoreCopy(score: number, es: boolean): { word: string; label: string } {
  const word =
    score >= 70 ? (es ? "saludable" : "healthy")
    : score >= 40 ? (es ? "con atención" : "watchful")
    : es ? "revisar" : "review";
  return { word, label: es ? "Confianza" : "Trust health" };
}
