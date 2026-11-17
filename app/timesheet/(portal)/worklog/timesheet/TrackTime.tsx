"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LazyWorkLogForm } from "../../dashboard/LazyForms";
import { Modal } from "../../dashboard/LogDialog";
import type { LogPrefill } from "../../dashboard/WorkLogForm";

// One "Track time" window for the whole page. The green button, the quick-add bar and anything else call
// `open()`; it shows the existing add-entry form (so saving, checks and messages are exactly the ones already
// in use), optionally filled in.

type Opts = { /** The day the form starts on. */ date?: string; /** Fill the form with these values. */ prefill?: LogPrefill };

const TrackTimeContext = createContext<(opts?: Opts) => void>(() => {});

export const useTrackTime = () => useContext(TrackTimeContext);

export function TrackTimeProvider({ today, children }: { today: string; children: React.ReactNode }) {
  const [request, setRequest] = useState<{ id: number; opts: Opts } | null>(null);
  const open = useCallback((opts: Opts = {}) => setRequest((r) => ({ id: (r?.id ?? 0) + 1, opts })), []);
  const close = useCallback(() => setRequest(null), []);
  const api = useMemo(() => open, [open]);

  return (
    <TrackTimeContext.Provider value={api}>
      {children}
      {request && (
        <Modal key={request.id} title="Track time" description="Record what you worked on and for how long." onClose={close}>
          <LazyWorkLogForm today={today} defaultDate={request.opts.date} prefill={request.opts.prefill} onSaved={close} />
        </Modal>
      )}
    </TrackTimeContext.Provider>
  );
}

/** The green "+ Track time" button. `date` is the day a new entry starts on. */
export function TrackTimeButton({ date }: { date?: string }) {
  const open = useTrackTime();
  return (
    <Button
      type="button"
      className="bg-green-700 text-white hover:bg-green-800 focus-visible:ring-green-700/30 max-md:min-h-11"
      onClick={() => open({ date })}
    >
      <Plus aria-hidden="true" /> Track time
    </Button>
  );
}
