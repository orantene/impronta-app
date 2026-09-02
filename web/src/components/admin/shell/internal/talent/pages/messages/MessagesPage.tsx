"use client";

import { TalentMessagesShellLazy, useKeyboardInset } from "../../shared/client-threads-1";

export function TalentMessagesPage() {
  useKeyboardInset();
  return <TalentMessagesShellLazy pov="talent" />;
}
