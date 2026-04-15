"use client";

import { useRef, useState, useTransition } from "react";
import { UserAvatar } from "@/components/ui/user-avatar";
import { actionUploadAvatar } from "@/lib/server/avatar-upload-action";
import { Camera, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function AvatarUploadButton({
  currentAvatarUrl,
  displayName,
  size = "lg",
}: {
  currentAvatarUrl: string | null;
  displayName: string;
  size?: "md" | "lg";
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const effectiveUrl = previewUrl ?? currentAvatarUrl;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);

    // Optimistic preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    const fd = new FormData();
    fd.append("avatar", file);

    startTransition(async () => {
      const result = await actionUploadAvatar(fd);
      if (!result.ok) {
        setError(result.error);
        setPreviewUrl(null);
        URL.revokeObjectURL(objectUrl);
      }
      // On success, the revalidated page will update currentAvatarUrl on next navigation;
      // previewUrl keeps showing the optimistic image in the meantime.
    });
  };

  const avatarSize = size === "lg" ? "lg" : "md";
  const buttonSize = size === "lg" ? "size-8" : "size-6";
  const iconSize = size === "lg" ? "size-4" : "size-3";

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative">
        <UserAvatar
          src={effectiveUrl}
          name={displayName}
          size={avatarSize}
          rounded="xl"
          className={isPending ? "opacity-60" : undefined}
        />
        {isPending ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/20">
            <Loader2 className="size-5 animate-spin text-white" />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            aria-label="Change profile photo"
            className={cn(
              "absolute -bottom-1.5 -right-1.5 flex items-center justify-center rounded-full border-2 border-background bg-[var(--impronta-gold)] text-[var(--impronta-gold-foreground)] shadow-sm transition-transform hover:scale-105 active:scale-95",
              buttonSize,
            )}
          >
            <Camera className={iconSize} />
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif"
        className="hidden"
        onChange={handleChange}
        disabled={isPending}
      />
      {error ? (
        <p className="max-w-[200px] text-center text-xs text-destructive">{error}</p>
      ) : (
        <p className="text-xs text-muted-foreground">Click the camera to change</p>
      )}
    </div>
  );
}
