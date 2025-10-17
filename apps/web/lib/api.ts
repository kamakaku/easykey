export async function getHealth() {
  // via rewrite (vermeidet CORS):
  const res = await fetch('/backend/health', { cache: 'no-store' });
  if (!res.ok) throw new Error('Health failed');
  return res.json() as Promise<{ status: string; time: string }>;
}