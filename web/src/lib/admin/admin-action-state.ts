export type AdminActionState =
  | {
      error?: string;
      /** Set when createClientAccount runs in sheet mode (no redirect). */
      createdClientAccountId?: string;
      /** Set when updateClientLocation runs in sheet mode (no redirect). */
      updatedClientAccountId?: string;
      /** Set when createClientAccountContact succeeds (for sheet UX). */
      contactCreated?: boolean;
      /** Manual phone / walk-in intake (sheet mode). */
      createdInquiryId?: string;
      createdInquiryClientAccountId?: string | null;
      createdInquiryClientAccountName?: string | null;
    }
  | undefined;
