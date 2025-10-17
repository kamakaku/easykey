'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';

type Challenge = { loginId: string; nonce: string; expires: number };

export default function QRPage() {
  const [ch, setCh] = useState<Challenge | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  async function createChallenge() {
    setError(null);
    setConfirmed(false);
    setCh(null);
    const res = await fetch('/backend/api/v1/qr/challenge', { method: 'POST' });
    if (!res.ok) {
      setError('Challenge fehlgeschlagen');
      return;
    }
    const data = (await res.json()) as Challenge;
    setCh(data);
  }

  // initial laden
  useEffect(() => {
    createChallenge();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket verbinden & auf bestätigung + token warten
  useEffect(() => {
    if (!ch) return;

    // Direkt zum Go-Server verbinden (kein Next-Proxy für WS)
    const url = `ws://127.0.0.1:8080/api/v1/qr/wait?loginId=${encodeURIComponent(ch.loginId)}`;
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onmessage = async (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        if (msg.event === 'confirmed' && msg.token) {
          // Token gegen HttpOnly-Cookie tauschen
          const ex = await fetch('/backend/api/v1/qr/exchange', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: msg.token }),
          });
          if (ex.ok) {
            setConfirmed(true);
            // Demo: auf Dashboard umleiten
            window.location.href = '/dashboard';
          } else {
            setError('Token-Exchange fehlgeschlagen');
          }
        } else if (msg.event === 'expired') {
          setError('Challenge abgelaufen – bitte neu laden.');
        }
      } catch {
        // ignore
      }
    };

    ws.onerror = () => setError('WebSocket-Fehler');
    ws.onclose = () => {
      /* optional logging */
    };

    return () => {
      ws.close();
    };
  }, [ch]);

  const payload = useMemo(
    () =>
      ch
        ? JSON.stringify({
            t: 'easykey-login',
            loginId: ch.loginId,
            nonce: ch.nonce,
            exp: ch.expires,
            origin: typeof window !== 'undefined' ? window.location.origin : '',
          })
        : '',
    [ch],
  );

  return (
    <section>
      <h1>🔐 QR-Login (WebSocket + Session)</h1>

      {error && (
        <p style={{ color: '#ff8a8a', marginBottom: 8 }}>
          {error}
        </p>
      )}

      {!ch && !error && <p>Erzeuge Challenge…</p>}

      {ch && !confirmed && (
        <>
          <QRCodeCanvas value={payload} size={220} includeMargin />
          <p style={{ marginTop: 8 }}>
            Ablauf: {new Date(ch.expires * 1000).toLocaleTimeString()}
          </p>

          <div style={{ display: 'flex', gap: 12, marginTop: 12 }}>
            <button onClick={createChallenge}>Neu laden</button>
            {/* DEV: simulierte Bestätigung (später Mobile-App mit Biometrie/Signatur) */}
            <button
              onClick={async () => {
                await fetch('/backend/api/v1/qr/confirm', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ loginId: ch.loginId, nonce: ch.nonce }),
                });
              }}
            >
              Simulate Confirm
            </button>
          </div>

          <pre style={{ marginTop: 12, opacity: 0.7, whiteSpace: 'pre-wrap' }}>
            {payload}
          </pre>
        </>
      )}

      {confirmed && (
        <div
          style={{
            marginTop: 16,
            padding: 12,
            borderRadius: 12,
            background: '#1f4d2b',
            color: '#c7f7d1',
            border: '1px solid rgba(255,255,255,.15)',
          }}
        >
          ✅ Eingeloggt – weiterleiten …
        </div>
      )}
    </section>
  );
}