/**
 * Chat interactions barrel — reactions · reply · overflow menu.
 *
 * Drop-in primitives for the conversation streams across admin /
 * talent / client / talent-coord shells. Each component renders
 * with a toast placeholder until the caller wires onReact / onReply /
 * onMenuItem to real engine paths.
 */

export {
  OverflowMenu,
  DEFAULT_OVERFLOW_ITEMS,
  type OverflowMenuItem,
  type OverflowMenuProps,
} from "./OverflowMenu";

export {
  MessageReactionMenu,
  ReactionPicker,
  ReactionChips,
  ReactTriggerButton,
  DEFAULT_REACTION_SET,
  type DefaultReaction,
  type ReactionCount,
} from "./MessageReactions";

export {
  ReplyTriggerButton,
  ReplyContextBar,
  QuotedMessage,
  MessageHoverActions,
  replyTargetFromMessage,
  type ReplyTarget,
} from "./ReplyToMessage";

export { StarButton } from "./StarButton";

export { PinButton } from "./PinButton";

export { PinnedStrip } from "./PinnedStrip";

export { VoiceRecorderButton } from "./VoiceRecorderButton";

export { VoiceNotePlayer } from "./VoiceNotePlayer";
