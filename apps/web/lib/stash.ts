// apps/web/lib/stash.ts
export type GenStash = { password: string; label?: string; ts: number };

const KEY = 'ek_gen_stash';

export function saveStash(s: Omit<GenStash, 'ts'>) {
  const payload: GenStash = { ...s, ts: Date.now() };
  try {
    localStorage.setItem(KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function getStash(): GenStash | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw) as GenStash;
    if (!obj || !obj.password) return null;
    return obj;
  } catch {
    return null;
  }
}

export function clearStash() {
  try { localStorage.removeItem(KEY); } catch {}
}