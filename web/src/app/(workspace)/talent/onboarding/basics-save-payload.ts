import { omitUnlessLoaded } from "@/lib/talent/private-fields";

/**
 * Payload for the onboarding "basics" save (`updateSelfIdentity`). TUL-1269: when
 * the private fields could not be loaded (`privateFieldsAvailable` false) the
 * phone and date of birth are left OUT, so a failed load never blanks real data.
 * A loaded-but-empty phone is still sent as "" (the talent cleared it).
 */
export function buildBasicsSavePayload(input: {
  talentProfileId: string;
  name: string;
  phone: string;
  gender: string;
  dob: string;
  privateFieldsAvailable: boolean;
}) {
  const full = {
    talent_profile_id: input.talentProfileId,
    stage_name: input.name.trim(),
    contact_phone: input.phone.trim(),
    gender: input.gender,
    date_of_birth: input.dob || undefined,
  };
  return omitUnlessLoaded(full, input.privateFieldsAvailable, ["contact_phone", "date_of_birth"]) as typeof full;
}
