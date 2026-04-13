export const AUTH_POPUP_MESSAGE_TYPE = "impronta:auth-popup-result";

export type AuthPopupMessage = {
  type: typeof AUTH_POPUP_MESSAGE_TYPE;
  success: boolean;
  destination?: string;
  error?: string;
};
