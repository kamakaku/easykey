import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

type SessionResponse = { ok?: boolean; sub?: string; userId?: string };

const AUTH_API_BASE =
  process.env.AUTH_API_BASE_URL ||
  process.env.NEXT_PUBLIC_AUTH_API_BASE_URL ||
  'http://127.0.0.1:8080';

function buildCookieHeader(): string | undefined {
  const store = cookies();
  const all = store.getAll();
  if (!all.length) return undefined;
  return all.map(({ name, value }) => `${name}=${value}`).join('; ');
}

function authApiUrl(path: string) {
  const base = AUTH_API_BASE.endsWith('/') ? AUTH_API_BASE.slice(0, -1) : AUTH_API_BASE;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

export async function getSession(): Promise<{ userId: string } | null> {
  let res: Response;
  try {
    res = await fetch(authApiUrl('/api/v1/auth/me'), {
      headers: (() => {
        const cookie = buildCookieHeader();
        return cookie ? { Cookie: cookie } : undefined;
      })(),
      cache: 'no-store',
    });
  } catch (error) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Session check failed', error);
    }
    return null;
  }

  if (res.status === 401 || res.status === 403) {
    return null;
  }
  if (!res.ok) {
    if (process.env.NODE_ENV !== 'production') {
      console.error('Unexpected auth/me response', res.status);
    }
    return null;
  }

  const data = (await res.json()) as SessionResponse;
  const userId = data.userId ?? data.sub;
  if (typeof userId !== 'string' || !userId) {
    return null;
  }
  return { userId };
}

export async function requireSession() {
  const session = await getSession();
  if (!session) {
    redirect('/login');
  }
  return session;
}
