"use client";

import { createContext, useContext } from "react";

// What a form inside a pop-up window can ask of the window: say it has unsaved input, or ask to close
// (which asks "Discard your changes?" first when there are some).
export type ModalApi = {
  setDirty: (dirty: boolean) => void;
  requestClose: () => void;
};

export const ModalContext = createContext<ModalApi | null>(null);

/** The window this form is inside, or null when it is not in one. */
export const useModal = () => useContext(ModalContext);
