"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { useShellData } from "./NavCounts";

// A person's picture, or their initials when they have none (or it can't load). Used wherever a person appears.
// The frame knows who has a picture (one list, loaded once), so a picture is only requested for people who have one: no more
// failed image requests for everybody without a photo. `version` forces the picture (right after an upload) and changes its
// address so the new one shows straight away.
export function UserAvatar({
  userId,
  name,
  version,
  className,
}: {
  userId: string | null | undefined;
  name: string | null | undefined;
  version?: string | number;
  /** Size and text size, e.g. "size-10 text-sm". Defaults to 32px. */
  className?: string;
}) {
  const { data } = useShellData();
  const stored = userId && data ? data.avatars[userId.toLowerCase()] : undefined;
  // Until the list has arrived nothing is requested (initials show), so the first screen never fires a burst of image requests.
  const src = userId && (version !== undefined || stored !== undefined) ? avatarUrl(userId, version ?? stored) : null;
  return (
    <Avatar className={cn("size-8", className)}>
      {src && <AvatarImage src={src} alt="" />}
      <AvatarFallback className="bg-primary font-bold text-primary-foreground" aria-hidden="true">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
