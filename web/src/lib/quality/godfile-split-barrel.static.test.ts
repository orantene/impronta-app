/**
 * godfile-split-barrel.static.test.ts — the three grandfathered god-files that
 * had a cohesive module extracted must keep their public export surface
 * byte-stable: every name they exported before the split is still exported
 * from the original path (declared in place, or re-exported from the new
 * sibling module).
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";

const ROOT = process.cwd();

const SURFACES: Record<string, string[]> = {
  "src/app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts": [
    "PipelineActionResult", "convertInquiryToBookingAction", "submitTalentRate", "counterOfferAction",
    "InquiryPaymentState", "loadInquiryPaymentState", "markInquiryPaymentReceived", "markInquiryPaymentPending",
    "markInquiryPaymentDisputed", "markInquiryPaymentFailed", "cancelInquiryTransaction",
    "createInquiryTransactionDraft", "requestInquiryPayment", "initiateInquiryPayout", "markInquiryPayoutSent",
    "sendOfferAction", "approveOfferAction", "acceptOfferForTalentAction", "rejectOfferAction",
    "patchAgencySettingsNamespace", "loadAgencySettingsNamespace", "rescheduleInquiry", "loadEditableJobFields",
    "updateInquiryJobFields", "updateBookingJobFields", "setInquiryPinned", "setInquiryArchived",
    "setInquiryManuallyUnread", "duplicateInquiryBooking", "InquiryParticipant", "loadInquiryLineup",
    "removeInquiryLineupParticipant", "addInquiryLineupTalent", "InquiryAttachment", "loadInquiryAttachments",
    "uploadInquiryAttachment", "deleteInquiryAttachment", "OfferDraftSnapshot", "loadOfferDraft", "saveOfferDraft",
    "PayoutReceiverOption", "loadInquiryPayoutReceiverCandidates", "setInquiryPayoutReceiver",
    "reorderInquiryLineup", "bulkNudgeInquiries", "bulkReassignInquiriesToMe", "bulkSetInquiryArchived",
    "createOfferAction", "WorkspaceCoordinatorCandidate", "loadWorkspaceCoordinatorCandidates",
    "CoordinatorAssignCandidate", "loadCoordinatorAssignCandidates", "SecondaryCoordinatorRow",
    "loadSecondaryCoordinators", "reassignCoordinatorAction", "addSecondaryCoordinatorAction",
    "removeSecondaryCoordinatorAction", "promoteToPrimaryCoordinatorAction", "loadBookingCommissionSnapshotAction",
    "markBookingPaymentMethodAction", "markInquiryPaidInCash", "requestPlatformRateOverrideAction",
    "placeTalentHoldAction", "releaseTalentHoldAction", "loadHoldsForInquiryAction", "cancelBookingAction",
    "rescheduleBookingAction", "reopenOfferAction", "closeBookingAction",
  ],
  "src/app/(workspace)/[tenantSlug]/admin/media/actions.ts": [
    "RegisterMediaResult", "UploadVariant", "actionUploadAndAssignMedia", "actionAssignMediaToTalent",
    "actionDeleteMediaAssets", "actionSetApprovalState", "actionReassignMediaToTalent",
    "actionSetMediaWatermarkOverride", "actionSetAsCardPhoto", "actionSetAsHeroPhoto", "actionRevertCropToSource",
    "actionReorderMediaAssets", "StagedMediaMeta", "StagingUploadResult", "actionUploadToStagingStorage",
    "actionCleanupStagedObjects", "BulkAssignAssignment", "actionBulkAssignStagedMedia", "RosterTalentOption",
    "actionLoadRosterTalents", "DocumentUploadResult", "actionUploadTalentDocument",
    "actionCreateDocumentSignedUploadUrl", "actionFinalizeDocumentUpload", "actionGetTalentDocumentSignedUrl",
    "actionDeleteTalentDocument", "TalentMediaItem", "TalentMediaBundle", "TalentGalleryItem",
    "actionLoadTalentGallery", "actionLoadTalentMediaBundle", "actionLoadTalentMediaBundleAll",
    "actionGetMediaCount", "DriveImportResult", "actionListDriveFolder", "actionImportSingleDriveFile",
    "actionImportFromGoogleDrive", "actionCreateSignedUploadUrl", "actionCreateStagingSignedUploadUrl",
    "RegisterUploadedAssetInput", "actionRegisterUploadedAsset", "actionRegisterStagedAsset",
  ],
  "src/lib/site-admin/edit-mode/composition-actions.ts": [
    "CompositionSectionRef", "CompositionSlotDef", "CompositionLibraryEntry", "CompositionData",
    "CompositionLoadResult", "CompositionSaveResult", "CreateAndInsertResult", "loadHomepageCompositionAction",
    "CompositionSaveInput", "saveHomepageCompositionAction", "createAndInsertSectionAction",
    "duplicateSectionAction", "SaveDraftResult", "saveDraftHomepageAction", "applyHomepageDraftBeaconAction",
    "PublishResult", "publishHomepageFromEditModeAction", "CopyPublishedResult", "copyPublishedHomepageAction",
  ],
};

function exportedNames(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of src.matchAll(/^export (?:async function|function|const|type|interface) ([A-Za-z0-9_]+)/gm)) {
    out.add(m[1]!);
  }
  for (const m of src.matchAll(/^export type \{([^}]*)\}/gm)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) out.add(name);
    }
  }
  // Value re-exports (`export { foo, bar } from "./sibling"`) keep the
  // original import path byte-stable after a god-file split (TUL-454).
  for (const m of src.matchAll(/^export \{([^}]*)\}(?:\s*from\s*["'][^"']+["'])?/gm)) {
    for (const part of m[1]!.split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop();
      if (name) out.add(name);
    }
  }
  return out;
}

describe("god-file split barrels stay byte-stable", () => {
  for (const [path, names] of Object.entries(SURFACES)) {
    it(`${path} still exports every pre-split name`, () => {
      const exported = exportedNames(readFileSync(join(ROOT, path), "utf8"));
      const missing = names.filter((n) => !exported.has(n));
      assert.deepEqual(missing, [], `missing exports in ${path}: ${missing.join(", ")}`);
    });
  }
});
