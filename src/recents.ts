// Lightweight cross-tool helpers for the "confort & productivité" features:
//  • a recent-outputs history (persisted in localStorage)
//  • a desktop notification when a long task finishes
// Kept dependency-free and defensive so a quota/permission error never breaks a tool.

export type RecentItem = { path: string; name: string; tool: string; at: number };

const KEY = "orbit-recent-outputs";
const MAX = 40;

export function getRecents(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as RecentItem[]) : [];
  } catch {
    return [];
  }
}

export function addRecent(path: string, tool: string) {
  if (!path) return;
  try {
    const name = path.split(/[\\/]/).pop() || path;
    const list = getRecents().filter(r => r.path !== path);
    list.unshift({ path, name, tool, at: Date.now() });
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
    window.dispatchEvent(new Event("orbit-recents-updated"));
  } catch {
    /* ignore quota errors */
  }
}

export function clearRecents() {
  try {
    localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("orbit-recents-updated"));
  } catch {
    /* ignore */
  }
}

// Fire a desktop notification (respects the user's "notifications" setting).
export function notifyDone(title: string, body: string) {
  try {
    const raw = localStorage.getItem("orbit-settings");
    const enabled = raw ? JSON.parse(raw)?.notifications : false;
    if (!enabled) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "granted") {
      new Notification(title, { body, silent: false });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then(p => {
        if (p === "granted") new Notification(title, { body });
      });
    }
  } catch {
    /* ignore */
  }
}
