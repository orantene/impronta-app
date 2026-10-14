/** Leave guard for the service editor (TUL-716): back with unsaved edits asks first. */
export function leaveEditorMessage(isSpanish: boolean): string {
  return isSpanish
    ? "Tienes cambios sin guardar. ¿Salir sin guardar?"
    : "You have unsaved changes. Leave without saving?";
}

export function canLeaveEditor(
  dirty: boolean,
  isSpanish: boolean,
  confirmFn: (message: string) => boolean,
): boolean {
  return !dirty || confirmFn(leaveEditorMessage(isSpanish));
}
