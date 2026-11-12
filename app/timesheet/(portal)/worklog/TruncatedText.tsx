"use client";

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// A description cut to a line or two; the full text shows in a tooltip (and is focusable, so keyboard users get it too).
export function TruncatedText({ text, className }: { text: string; className?: string }) {
  if (text.length <= 90) return <p className={className}>{text}</p>;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <p tabIndex={0} className={`${className ?? ""} cursor-help rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2`}>
            {text}
          </p>
        </TooltipTrigger>
        <TooltipContent className="max-w-sm whitespace-pre-wrap">{text}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
