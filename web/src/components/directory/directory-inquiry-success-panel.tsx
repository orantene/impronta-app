"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { InquirySuccessParams } from "@/components/directory/directory-inquiry-modal-context";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";
import { formatInquirySuccessFollowUp } from "@/lib/directory/directory-ui-copy";

export function DirectoryInquirySuccessPanel({
  success,
  signedIn,
  copy,
}: {
  success: InquirySuccessParams;
  signedIn: boolean;
  copy: DirectoryUiCopy["inquirySuccess"];
}) {
  const email = success.email ? decodeURIComponent(success.email) : null;
  const activation = success.activation;

  const activationHeadline =
    activation === "matched"
      ? copy.activationMatched
      : activation === "created"
        ? copy.activationPrepared
        : copy.activationAnyTime;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader>
        <CardTitle className="text-base">{copy.inquirySentTitle}</CardTitle>
        <CardDescription>{copy.inquirySentDescription}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          {formatInquirySuccessFollowUp(copy, email)}
        </p>

        {!signedIn ? (
          <div className="rounded-xl border border-border/50 bg-background/70 p-4">
            <p className="text-sm font-medium text-foreground">{activationHeadline}</p>
            <p className="mt-1 text-sm text-muted-foreground">{copy.activationBenefits}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button asChild>
                <Link
                  href={`/forgot-password?email=${encodeURIComponent(email ?? "")}`}
                >
                  {copy.activateAccountButton}
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link
                  href={`/login?next=${encodeURIComponent("/client/inquiries")}${email ? `&email=${encodeURIComponent(email)}` : ""}`}
                >
                  {copy.logInTrackRequestButton}
                </Link>
              </Button>
            </div>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
