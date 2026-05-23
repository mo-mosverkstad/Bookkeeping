/**
 * Session persistence — Phase 7.
 *
 * Saves the list of last-loaded CSV file names to localStorage so the user
 * can be prompted to reload them on next open.
 *
 * Only file names are stored (not file contents — the browser cannot access
 * the filesystem directly). On restore, the UI shows a banner listing the
 * previously loaded files and invites the user to reload them.
 */

const SESSION_KEY = "bookkeeping_session_v1";

export interface SessionData {
    fileNames: string[];
    savedAt: number; // ms since epoch
}

export function saveSession(fileNames: string[]): void {
    const data: SessionData = { fileNames, savedAt: Date.now() };
    try {
        localStorage.setItem(SESSION_KEY, JSON.stringify(data));
    } catch {
        // localStorage unavailable (private browsing, storage full) — ignore
    }
}

export function loadSession(): SessionData | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        if (!raw) return null;
        return JSON.parse(raw) as SessionData;
    } catch {
        return null;
    }
}

export function clearSession(): void {
    try { localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ }
}
