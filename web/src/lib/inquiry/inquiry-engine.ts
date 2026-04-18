/**
 * Public API for the inquiry workflow engine — thin re-exports (Principle 2).
 * All commercial inquiry mutations should go through these functions.
 */

export type { EngineResult, EngineOk, EngineErr } from "./inquiry-engine.types";

export { submitInquiry, moveToCoordination, setPriority } from "./inquiry-engine-submit";
export {
  assignCoordinator,
  acceptCoordinatorAssignment,
  declineCoordinatorAssignment,
  autoAssignCoordinatorFromSettings,
} from "./inquiry-engine-coordinator";
export { sendMessage, markThreadRead, editMessage, deleteMessage } from "./inquiry-engine-messages";
export {
  addTalentToRoster,
  removeTalentFromRoster,
  reorderRoster,
  acceptTalentInvitation,
  declineTalentInvitation,
  rosterMatchesOffer,
} from "./inquiry-engine-roster";
export { createOffer, updateOfferDraft, sendOffer, clientRejectOffer } from "./inquiry-engine-offers";
export type { OfferLineDraft } from "./inquiry-engine-offers";
export { submitApproval, rejectApproval, clientAcceptOffer } from "./inquiry-engine-approvals";
export { convertToBooking } from "./inquiry-engine-booking";
export {
  addRequirementGroup,
  updateRequirementGroup,
  removeRequirementGroup,
  assignParticipantToGroup,
} from "./inquiry-engine-requirement-groups";
export type {
  AddRequirementGroupCtx,
  UpdateRequirementGroupCtx,
  RemoveRequirementGroupCtx,
  AssignParticipantToGroupCtx,
} from "./inquiry-engine-requirement-groups";
export {
  freezeInquiry,
  unfreezeInquiry,
  archiveInquiry,
  processCoordinatorTimeouts,
  processExpirations,
  retryFailedEngineEffects,
} from "./inquiry-engine-lifecycle";
