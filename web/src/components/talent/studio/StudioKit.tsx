"use client";

import { useState } from "react";
import {
  Btn,
  Card,
  DialogDesktop,
  SheetMobile,
  StatLine,
  StatusChip,
  SunkCard,
  TimelineRow,
} from "./primitives";

export function StudioKit() {
  const [sheet, setSheet] = useState(false);
  const [dialog, setDialog] = useState(false);
  return (
    <main className="mx-auto max-w-[880px] space-y-6 p-8 font-admin-body text-admin-ink">
      <h1 className="text-[28px] font-semibold">Studio kit</h1>
      <Card className="flex flex-wrap gap-2 p-4">
        <StatusChip tone="ok">Live</StatusChip>
        <StatusChip tone="info">Hold</StatusChip>
        <StatusChip tone="warn">Draft</StatusChip>
        <StatusChip tone="risk">Declined</StatusChip>
        <StatusChip tone="idle">Hidden</StatusChip>
        <StatusChip tone="brand">Web Office</StatusChip>
      </Card>
      <Card className="flex flex-wrap gap-2 p-4">
        <Btn>Primary</Btn>
        <Btn kind="sec">Secondary</Btn>
        <Btn kind="qt">Quiet</Btn>
        <Btn kind="dgr">Danger</Btn>
        <Btn size="sm">Small</Btn>
      </Card>
      <SunkCard className="p-4">
        <StatLine label="Views" value={null} />
        <StatLine label="Bookings" value={4} />
        <TimelineRow when="23 Sep">Address reserved</TimelineRow>
      </SunkCard>
      <div className="flex gap-2">
        <Btn kind="sec" onClick={() => setSheet(true)}>Open sheet</Btn>
        <Btn kind="sec" onClick={() => setDialog(true)}>Open dialog</Btn>
      </div>
      {sheet && (
        <SheetMobile title="Sheet" onClose={() => setSheet(false)} footer={<Btn onClick={() => setSheet(false)}>Done</Btn>}>
          Attached footer. The sheet does not cover the whole screen.
        </SheetMobile>
      )}
      {dialog && (
        <DialogDesktop title="Dialog" onClose={() => setDialog(false)} footer={<Btn onClick={() => setDialog(false)}>Done</Btn>}>
          Scrolling body, attached footer, never clipped.
        </DialogDesktop>
      )}
    </main>
  );
}
