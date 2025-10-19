'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import AppShell from '../components/AppShell';
import { Card, Button, Alert, Badge } from '../components/UI';

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
            setTimeout(() => {
              window.location.href = '/dashboard';
            }, 1500);
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
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">QR Login</h1>
          <p className="text-slate-400">Sichere Anmeldung mit QR-Code und WebSocket-Kommunikation.</p>
        </div>

        {error && (
          <Alert variant="error">
            <div>
              <p className="font-medium mb-1">Fehler</p>
              <p className="text-sm">{error}</p>
            </div>
          </Alert>
        )}

        <div className="grid md:grid-cols-2 gap-6">
          {/* QR Code Card */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">QR-Code</h2>
                <p className="text-sm text-slate-400">Scanne mit deinem Gerät</p>
              </div>
            </div>

            {!ch && !error && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                  <p className="text-sm text-slate-400">Erzeuge Challenge…</p>
                </div>
              </div>
            )}

            {ch && !confirmed && (
              <div className="space-y-4">
                <div className="flex justify-center">
                  <div className="p-4 bg-white rounded-2xl shadow-2xl">
                    <QRCodeCanvas value={payload} size={240} includeMargin />
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-sm text-slate-400">
                    Ablauf: {new Date(ch.expires * 1000).toLocaleTimeString()}
                  </span>
                </div>

                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                  <Badge variant="success">Aktiv</Badge>
                </div>
              </div>
            )}

            {confirmed && (
              <div className="flex items-center justify-center h-64">
                <div className="text-center">
                  <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <p className="text-lg font-semibold text-slate-100 mb-2">Erfolgreich!</p>
                  <p className="text-sm text-slate-400">Weiterleitung zum Dashboard…</p>
                </div>
              </div>
            )}
          </Card>

          {/* Info & Actions Card */}
          <Card>
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 bg-purple-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-5 h-5 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-slate-100">Informationen</h2>
                <p className="text-sm text-slate-400">Wie funktioniert's?</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    1
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">QR-Code scannen</p>
                    <p className="text-xs text-slate-400">Nutze die Mobile App zum Scannen</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    2
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">Biometrische Authentifizierung</p>
                    <p className="text-xs text-slate-400">Bestätige die Anmeldung auf deinem Gerät</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-indigo-500 text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                    3
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-200">Automatische Anmeldung</p>
                    <p className="text-xs text-slate-400">Keine Passwort-Eingabe erforderlich</p>
                  </div>
                </div>
              </div>

              <Alert variant="info">
                <p className="text-xs">
                  WebSocket-basierte Echtzeitkommunikation für sofortige Login-Bestätigung.
                </p>
              </Alert>

              <div className="space-y-2 pt-4">
                <Button
                  onClick={createChallenge}
                  variant="primary"
                  className="w-full"
                  disabled={!ch || confirmed}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  Neuen Code generieren
                </Button>

                {/* DEV: simulierte Bestätigung */}
                {ch && !confirmed && (
                  <Button
                    onClick={async () => {
                      await fetch('/backend/api/v1/qr/confirm', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ loginId: ch.loginId, nonce: ch.nonce }),
                      });
                    }}
                    variant="ghost"
                    className="w-full"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Simulate Confirm (DEV)
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>

        {/* Payload Details */}
        {ch && (
          <Card>
            <h3 className="text-lg font-semibold text-slate-100 mb-3">Payload Details (Developer)</h3>
            <div className="bg-slate-900/50 rounded-lg p-4 font-mono text-xs text-slate-300 overflow-auto">
              <pre>{JSON.stringify(JSON.parse(payload), null, 2)}</pre>
            </div>
          </Card>
        )}

        {/* Security Features */}
        <Card>
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Sicherheitsfeatures</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.818-4.954A9.955 9.955 0 0121 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2c2.12 0 4.083.668 5.688 1.804M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">Zeitlich begrenzt</p>
                <p className="text-xs text-slate-400">Challenge läuft nach kurzer Zeit ab</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">Einmalig verwendbar</p>
                <p className="text-xs text-slate-400">Jeder QR-Code kann nur einmal genutzt werden</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">WebSocket Echtzeit</p>
                <p className="text-xs text-slate-400">Sofortige Bestätigung ohne Polling</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.818-4.954A9.955 9.955 0 0121 12c0 5.523-4.477 10-10 10S1 17.523 1 12 5.477 2 11 2c2.12 0 4.083.668 5.688 1.804M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">Nonce-basiert</p>
                <p className="text-xs text-slate-400">Replay-Attacken werden verhindert</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
