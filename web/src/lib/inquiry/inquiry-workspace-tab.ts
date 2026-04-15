import { VALID_INQUIRY_TABS, type InquiryTab } from "./inquiry-workspace-types";

export function canonicalizeTab(raw: string | null | undefined): InquiryTab {
  if (raw && VALID_INQUIRY_TABS.includes(raw as InquiryTab)) {
    return raw as InquiryTab;
  }
  return "messages";
}

export function isValidTab(raw: string | null | undefined): raw is InquiryTab {
  return Boolean(raw && VALID_INQUIRY_TABS.includes(raw as InquiryTab));
}
