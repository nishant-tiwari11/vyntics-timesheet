"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

// The floating top menu (with its water animation) is only needed once an admin has folded the sidebar away. Its code isn't
// downloaded, and nothing is drawn, until then.
const AdminTopNav = dynamic(() => import("./AdminTopNav").then((m) => m.AdminTopNav), { ssr: false });

export function LazyAdminTopNav() {
  const [needed, setNeeded] = useState(false);

  useEffect(() => {
    const shell = document.querySelector(".ts-shell");
    if (!shell) return;
    const check = () => shell.getAttribute("data-topnav") === "true" && setNeeded(true);
    const first = window.setTimeout(check, 0);
    const observer = new MutationObserver(check);
    observer.observe(shell, { attributes: true, attributeFilter: ["data-topnav"] });
    return () => {
      window.clearTimeout(first);
      observer.disconnect();
    };
  }, []);

  return needed ? <AdminTopNav /> : null;
}
