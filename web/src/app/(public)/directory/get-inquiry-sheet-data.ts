"use server";

import {
  loadDirectoryInquiryPayload,
  type DirectoryInquiryPayload,
} from "@/lib/load-directory-inquiry-payload";

export async function getDirectoryInquirySheetData(): Promise<DirectoryInquiryPayload> {
  return loadDirectoryInquiryPayload();
}
