"use client";

import { useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

// Google refuses to sign people in from the small browser built into other apps (WhatsApp, Gmail, Instagram,
// Facebook, LinkedIn ...). It shows the phone's "add an account" screen or an error instead. When we see one,
// say so and offer a way out. (This only guides; the sign-in rules are unchanged.)
const IN_APP = /FBAN|FBAV|FB_IAB|Instagram|WhatsApp|Line\/|MicroMessenger|Snapchat|LinkedInApp|Twitter|Gmail|; wv\)/i;

function detect(): { inApp: boolean; android: boolean } {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua);
  return {
    inApp: IN_APP.test(ua) || (ios && !/Safari|CriOS|FxiOS|EdgiOS/.test(ua)),
    android: /Android/.test(ua),
  };
}

const subscribe = () => () => {};
const serverSnapshot = "";
const snapshot = () => JSON.stringify(detect());

export function InAppBrowserNotice() {
  const raw = useSyncExternalStore(subscribe, snapshot, () => serverSnapshot);
  const [copied, setCopied] = useState(false);
  if (!raw) return null;
  const { inApp, android } = JSON.parse(raw) as ReturnType<typeof detect>;
  if (!inApp) return null;

  const url = `${window.location.origin}/timesheet/login`;
  const chrome = `intent://${window.location.host}/timesheet/login#Intent;scheme=https;package=com.android.chrome;end`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      window.prompt("Copy this link and open it in Chrome or Safari:", url);
    }
  }

  return (
    <Alert role="note">
      <AlertTitle>Open this page in your browser</AlertTitle>
      <AlertDescription className="grid gap-3">
        <p>Google can&apos;t sign you in from inside another app. Open the link in Chrome{android ? "" : " or Safari"} instead.</p>
        <div className="flex flex-wrap gap-2">
          {android && (
            <Button asChild size="sm" className="max-md:min-h-11">
              <a href={chrome}>Open in Chrome</a>
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" className="max-md:min-h-11" onClick={copy}>
            {copied ? "Link copied" : "Copy link"}
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
