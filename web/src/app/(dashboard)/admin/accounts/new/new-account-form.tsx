"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createClientAccount, updateClientLocation } from "@/app/(dashboard)/admin/actions";
import { ClientLocationPlacesSearch } from "@/components/admin/client-location-places-search";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  CLIENT_LOCATION_CREATE_TYPE_VALUES,
  CLIENT_LOCATION_TYPE_LABELS,
} from "@/lib/admin/validation";
import { ADMIN_FORM_CONTROL } from "@/lib/dashboard-shell-classes";

type NewAccountFormProps = {
  /** `page` (default) redirects after submit. `sheet` returns state for in-context UX. */
  mode?: "page" | "sheet";
  formMode?: "create" | "edit";
  clientAccountId?: string;
  initialValues?: {
    name?: string | null;
    account_type?: string | null;
    account_type_detail?: string | null;
    primary_email?: string | null;
    primary_phone?: string | null;
    website_url?: string | null;
    country?: string | null;
    city?: string | null;
    location_text?: string | null;
    address_notes?: string | null;
    google_place_id?: string | null;
    latitude?: number | string | null;
    longitude?: number | string | null;
  };
  onSheetSuccess?: (savedId: string) => void;
  /** After create, assign this commercial account on the inquiry (and reconcile contact if needed). */
  linkInquiryId?: string | null;
  linkBookingId?: string | null;
};

export function NewAccountForm({
  mode = "page",
  formMode = "create",
  clientAccountId,
  initialValues,
  onSheetSuccess,
  linkInquiryId,
  linkBookingId,
}: NewAccountFormProps) {
  const action = formMode === "edit" ? updateClientLocation : createClientAccount;
  const [state, formAction] = useActionState(action, undefined);
  const lastHandledId = useRef<string | null>(null);

  const [name, setName] = useState(initialValues?.name ?? "");
  const [accountType, setAccountType] = useState<string>(initialValues?.account_type ?? "villa");
  const [accountTypeDetail, setAccountTypeDetail] = useState(initialValues?.account_type_detail ?? "");
  const [primaryEmail, setPrimaryEmail] = useState(initialValues?.primary_email ?? "");
  const [primaryPhone, setPrimaryPhone] = useState(initialValues?.primary_phone ?? "");
  const [websiteUrl, setWebsiteUrl] = useState(initialValues?.website_url ?? "");
  const [country, setCountry] = useState(initialValues?.country ?? "");
  const [city, setCity] = useState(initialValues?.city ?? "");
  const [locationText, setLocationText] = useState(initialValues?.location_text ?? "");
  const [addressNotes, setAddressNotes] = useState(initialValues?.address_notes ?? "");
  const [googlePlaceId, setGooglePlaceId] = useState(initialValues?.google_place_id ?? "");
  const [latitude, setLatitude] = useState(
    initialValues?.latitude == null || initialValues.latitude === "" ? "" : String(initialValues.latitude),
  );
  const [longitude, setLongitude] = useState(
    initialValues?.longitude == null || initialValues.longitude === "" ? "" : String(initialValues.longitude),
  );

  useEffect(() => {
    const id = state?.createdClientAccountId ?? state?.updatedClientAccountId;
    if (mode === "sheet" && id && onSheetSuccess && lastHandledId.current !== id) {
      lastHandledId.current = id;
      onSheetSuccess(id);
    }
  }, [mode, onSheetSuccess, state?.createdClientAccountId, state?.updatedClientAccountId]);

  const showTypeDetail = accountType === "other";
  const submitLabel = formMode === "edit" ? "Save location changes" : "Create work location";

  return (
    <form action={formAction} className="max-w-lg space-y-5">
      {mode === "sheet" ? <input type="hidden" name="_submit_mode" value="sheet" /> : null}
      {formMode === "edit" ? <input type="hidden" name="client_account_id" value={clientAccountId ?? ""} /> : null}
      {linkInquiryId ? <input type="hidden" name="link_inquiry_id" value={linkInquiryId} /> : null}
      {linkBookingId ? <input type="hidden" name="link_booking_id" value={linkBookingId} /> : null}

      <input type="hidden" name="google_place_id" value={googlePlaceId} />
      <input type="hidden" name="latitude" value={latitude} />
      <input type="hidden" name="longitude" value={longitude} />

      {state?.error ? <p className="text-sm text-destructive">{state.error}</p> : null}

      <ClientLocationPlacesSearch
        appliedPlaceId={googlePlaceId}
        onClearApplied={() => {
          setGooglePlaceId("");
          setLatitude("");
          setLongitude("");
        }}
        onApply={(d) => {
          setGooglePlaceId(d.placeId);
          setName(d.displayName);
          setLocationText(d.formattedAddress);
          if (d.city) setCity(d.city);
          if (d.country) setCountry(d.country);
          if (d.phone) setPrimaryPhone(d.phone);
          if (d.website) setWebsiteUrl(d.website);
          setLatitude(d.lat != null ? String(d.lat) : "");
          setLongitude(d.lng != null ? String(d.lng) : "");
        }}
      />

      <p className="rounded-lg border border-border/50 bg-muted/20 px-3 py-2 text-xs leading-relaxed text-muted-foreground">
        <span className="font-medium text-foreground">Enter manually</span> if the place does not appear in search. All
        fields stay editable after a Google pick.
      </p>

      <div className="space-y-2">
        <Label htmlFor="name">Location name</Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Alejandro’s Villa, Resort Beach Club"
          autoComplete="off"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="account_type">Type</Label>
        <select
          id="account_type"
          name="account_type"
          className={ADMIN_FORM_CONTROL}
          value={accountType}
          onChange={(e) => setAccountType(e.target.value)}
        >
          {CLIENT_LOCATION_CREATE_TYPE_VALUES.map((t) => (
            <option key={t} value={t}>
              {CLIENT_LOCATION_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>

      {showTypeDetail ? (
        <div className="space-y-2">
          <Label htmlFor="account_type_detail">Specify type</Label>
          <Input
            id="account_type_detail"
            name="account_type_detail"
            required={showTypeDetail}
            value={accountTypeDetail}
            onChange={(e) => setAccountTypeDetail(e.target.value)}
            placeholder="Describe this location type"
            autoComplete="off"
          />
        </div>
      ) : (
        <input type="hidden" name="account_type_detail" value="" />
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="primary_email">Primary email</Label>
          <Input
            id="primary_email"
            name="primary_email"
            type="email"
            value={primaryEmail}
            onChange={(e) => setPrimaryEmail(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="primary_phone">Primary phone</Label>
          <Input
            id="primary_phone"
            name="primary_phone"
            value={primaryPhone}
            onChange={(e) => setPrimaryPhone(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="website_url">Website (optional)</Label>
          <Input
            id="website_url"
            name="website_url"
            type="text"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="https://…"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="country">Country</Label>
          <Input
            id="country"
            name="country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            placeholder="e.g. Spain"
            autoComplete="off"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            name="city"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="e.g. Ibiza"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="location_text">Full address</Label>
        <Textarea
          id="location_text"
          name="location_text"
          value={locationText}
          onChange={(e) => setLocationText(e.target.value)}
          rows={3}
          placeholder="Street, building, area — as precise as you need for staff and logistics."
          className={ADMIN_FORM_CONTROL}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="address_notes">Address notes / reference (optional)</Label>
        <Textarea
          id="address_notes"
          name="address_notes"
          value={addressNotes}
          onChange={(e) => setAddressNotes(e.target.value)}
          rows={2}
          placeholder="Gate codes, delivery entrance, local contact on site…"
          className={ADMIN_FORM_CONTROL}
        />
      </div>

      <Button type="submit" className="rounded-full">
        {submitLabel}
      </Button>
    </form>
  );
}
