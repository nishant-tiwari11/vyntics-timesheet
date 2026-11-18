import { LoadingEyesFigure } from "./_components/LoadingEyes";

// The full-screen loader: shown while the portal first loads (before the menus exist), with the eyes exactly in the middle
// of the window. It is 80px high on a phone and 96px high on a bigger screen (the width follows from the 9:4 shape), clear
// without filling the window. The indigo eyes contrast with the page background.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <LoadingEyesFigure />
    </div>
  );
}
