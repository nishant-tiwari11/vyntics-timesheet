// A small stale-while-revalidate cache in the browser's local storage, for things the page asks the server for after it is on
// screen (menu counts, notifications). The saved copy is drawn at once, then the server is asked in the background and the copy is
// replaced only if it changed. Keys include the signed-in person, and everything is wiped on sign-out, so a shared computer never
// shows one person's numbers to the next. Browser only (no server imports).

const PREFIX = "ts-cache:";

type Entry<T> = { at: number; value: T };

const key = (userId: string, name: string) => `${PREFIX}${userId}:${name}`;

export function readCache<T>(userId: string, name: string): Entry<T> | null {
  try {
    const raw = window.localStorage.getItem(key(userId, name));
    if (!raw) return null;
    const entry = JSON.parse(raw) as Entry<T>;
    return typeof entry?.at === "number" ? entry : null;
  } catch {
    return null; // storage blocked or a damaged value: behave as if nothing was saved
  }
}

export function writeCache<T>(userId: string, name: string, value: T): void {
  try {
    window.localStorage.setItem(key(userId, name), JSON.stringify({ at: Date.now(), value } satisfies Entry<T>));
  } catch {
    /* storage full or blocked: the next visit just asks the server */
  }
}

/** True when the new answer differs from what was saved, so a screen is only redrawn if something really changed. */
export const changed = (a: unknown, b: unknown): boolean => JSON.stringify(a) !== JSON.stringify(b);

/** Forget everything saved here. Called when someone signs out. */
export function clearLocalCache(): void {
  try {
    const drop: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith(PREFIX)) drop.push(k);
    }
    drop.forEach((k) => window.localStorage.removeItem(k));
  } catch {
    /* nothing to do */
  }
}
