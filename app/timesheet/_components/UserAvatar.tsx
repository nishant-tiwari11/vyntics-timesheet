"use client";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { avatarUrl, initials } from "@/lib/avatar";
import { cn } from "@/lib/utils";

// A person's picture, or their initials when they have none (or it can't load). Used wherever a person appears.
// `version` changes the address after a new upload so the new picture shows straight away.
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
  return (
    <Avatar className={cn("size-8", className)}>
      {userId && <AvatarImage src={avatarUrl(userId, version)} alt="" />}
      <AvatarFallback className="bg-primary font-bold text-primary-foreground" aria-hidden="true">
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  );
}
