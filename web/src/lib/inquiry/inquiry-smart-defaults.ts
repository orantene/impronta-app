/**
 * AI-ready hooks (Phase 2: no-op). See plan Section 2.28.
 */

export type InquiryContext = {
  inquiryId: string;
  status: string;
};

export type SuggestionResult = {
  label: string;
  payload: Record<string, unknown>;
};

export async function suggestCoordinator(_inquiry: InquiryContext): Promise<SuggestionResult | null> {
  return null;
}

export async function suggestTalentRoster(_inquiry: InquiryContext): Promise<SuggestionResult | null> {
  return null;
}

export async function suggestInitialOffer(_inquiry: InquiryContext): Promise<SuggestionResult | null> {
  return null;
}
