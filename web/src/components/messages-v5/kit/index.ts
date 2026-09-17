/**
 * Messages v5 shared kit. Import from here; the stylesheet is loaded once and
 * scoped under `.msgv5`, so wrap any screen built from the kit in
 * `<div className="msgv5">`.
 *
 * No file in this folder imports from `components/admin/shell/**`
 * (`kit-tokens.static.test.ts` checks).
 */

import "./tokens.css";

export { buildKitCopy, fill, fmt, type KitCopy, type Translator } from "./copy";
export { useKitCopy } from "./use-kit-copy";
export { Avatar, Btn, ChannelTag, Chip, Icon, Pill, CHANNEL_ICON, RECORD_ICON, formatWhen, initials, type BtnProps, type BtnSize, type BtnVariant, type IconName, type IconSize, type PillTone } from "./primitives";
export { IdentityPill, RecordPill, StateTags, opportunityTone, recordStateLabel, type StateTagsProps } from "./StateTags";
export { InboxRowV5, type InboxRowV5Props } from "./InboxRowV5";
export { FilterChips, FilterSheet, InboxSegments, INBOX_FILTER_KEYS, type FilterChipsProps, type FilterSheetProps, type InboxFilterKey, type InboxSegment, type InboxSegmentsProps } from "./InboxSegments";
export { ThreadHeader, type ThreadHeaderProps } from "./ThreadHeader";
export { EssentialsStrip, type EssentialsStripProps } from "./EssentialsStrip";
export { DaySeparator, MessageBubble, SystemLine, UnreadDivider, type BubblePosition, type DeliveryState, type MessageBubbleProps } from "./MessageBubble";
export { Card, CardLine, CardTotal, cardCategoryForKind, cardCategoryLabel, type CardCategory, type CardProps } from "./Card";
export { OfferCard, type OfferCardAction, type OfferCardProps, type OfferCardState, type OfferLine } from "./OfferCard";
export { PaymentCard, type PaymentCardAction, type PaymentCardProps, type PaymentCardState } from "./PaymentCard";
export { OrderCard, type OrderCardAction, type OrderCardLine, type OrderCardProps, type OrderLadderStep } from "./OrderCard";
export { AppointmentCard, type AppointmentCardAction, type AppointmentCardProps, type AppointmentCardState } from "./AppointmentCard";
export { TimesCard, type TimesCardAction, type TimesCardProps, type TimesCardState, type TimesSlot } from "./TimesCard";
export { ChangeRequestCard, type ChangeRequestAction, type ChangeRequestCardProps, type ChangeRequestMode } from "./ChangeRequestCard";
export { IdentityCaptureCard, type IdentityCaptureCardProps, type IdentityCaptureState } from "./IdentityCaptureCard";
export { NextStepBar, NextStepBlock, type NextStepAction, type NextStepProps } from "./NextStep";
export { Composer, type ComposerMode, type ComposerProps, type ComposerState } from "./Composer";
export { AlertLine, OkLine, RefusalLine, type LineAction } from "./RefusalLine";
export { PanelSection, SummaryBlock, type PanelSectionProps, type SummaryBlockProps } from "./Panel";
export { OptionRow, type OptionRowProps } from "./OptionRow";
export { Sheet, type SheetProps, type SheetVariant } from "./Sheet";
export { Tray, defaultTrayGroups, type TrayGroup, type TrayItem, type TrayItemKey, type TrayProps } from "./Tray";
export { LineEditorRow, type LineEditorFlags, type LineEditorRowProps } from "./LineEditor";
export { PaymentLadder, paymentLadderSteps, type LadderStep } from "./PaymentLadder";
export { EmptyState, Skeleton, type EmptyStateProps } from "./Skeleton";
