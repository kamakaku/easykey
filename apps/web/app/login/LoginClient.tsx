'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, Input, Alert } from '../components/UI';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  authenticateWithBiometric,
} from '@/lib/webauthn';

type Mode = 'login' | 'register';

export default function LoginClient() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricLoading, setBiometricLoading] = useState(false);

  // Check biometric availability on mount
  useEffect(() => {
    const checkBiometric = async () => {
      if (isWebAuthnSupported()) {
        const available = await isPlatformAuthenticatorAvailable();
        setBiometricAvailable(available);
      }
    };
    checkBiometric();
  }, []);

  const toggleMode = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    setError(null);
    setMessage(null);
    setPassword('');
  };

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    const endpoint =
      mode === 'login' ? '/backend/api/v1/auth/login' : '/backend/api/v1/auth/register';
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        let msg = 'Vorgang fehlgeschlagen';
        if (res.status === 401) msg = 'Ungültige Zugangsdaten';
        if (res.status === 409) msg = 'E-Mail ist bereits registriert';
        if (res.status === 400) msg = 'Bitte E-Mail und Passwort prüfen';
        try {
          const data = (await res.json()) as { error?: string; message?: string };
          msg = data.error || data.message || msg;
        } catch {
          // ignore JSON parse errors
        }
        setError(msg);
        return;
      }

      setMessage(mode === 'login' ? 'Erfolgreich eingeloggt' : 'Registrierung erfolgreich');
      router.replace('/dashboard');
      router.refresh();
    } catch (err: any) {
      setError(err?.message || 'Unbekannter Fehler');
    } finally {
      setLoading(false);
    }
  }

  async function handleBiometricLogin() {
    setError(null);
    setMessage(null);
    setBiometricLoading(true);

    try {
      const result = await authenticateWithBiometric();

      if (result.success) {
        setMessage('Biometrische Authentifizierung erfolgreich!');
        router.replace('/dashboard');
        router.refresh();
      } else {
        setError(result.error || 'Biometrische Authentifizierung fehlgeschlagen');
      }
    } catch (err: any) {
      setError(err?.message || 'Unbekannter Fehler');
    } finally {
      setBiometricLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 flex items-center justify-center px-4 py-12">
      <div className="max-w-6xl w-full grid lg:grid-cols-2 gap-10 items-center">
        <div className="space-y-6 text-center lg:text-left">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/30 rounded-full text-indigo-300 text-xs">
            <span className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse" />
            Sicherer Zugang zu EasyKey
          </div>
          <h1 className="text-4xl lg:text-5xl font-bold text-slate-100 leading-tight">
            Willkommen bei <span className="text-indigo-400">EasyKey</span>
          </h1>
          <p className="text-slate-400 text-lg max-w-xl">
            Verwalte Passwörter sicher mit Zero-Knowledge-Verschlüsselung. Melde dich mit deinem
            Konto an oder erstelle jetzt ein neues Profil.
          </p>
          <div className="flex flex-wrap gap-4 text-slate-400/80 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              Ende-zu-Ende Verschlüsselung
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              On-Device Master-Passwort
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-green-400 rounded-full" />
              QR-Login für Geräte
            </div>
          </div>
        </div>

        <Card className="bg-slate-900/60 border border-slate-700/70 shadow-2xl shadow-indigo-500/10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center">
              <svg className="w-5 h-5 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-100">
                {mode === 'login' ? 'Anmeldung' : 'Registrierung'}
              </h2>
              <p className="text-sm text-slate-400">
                {mode === 'login'
                  ? 'Melde dich mit deiner E-Mail an.'
                  : 'Erstelle ein neues EasyKey-Konto.'}
              </p>
            </div>
          </div>

          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => toggleMode('login')}
              className={`flex-1 px-4 py-2 rounded-lg border ${
                mode === 'login'
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              } transition-all`}
            >
              Anmelden
            </button>
            <button
              type="button"
              onClick={() => toggleMode('register')}
              className={`flex-1 px-4 py-2 rounded-lg border ${
                mode === 'register'
                  ? 'border-indigo-500 bg-indigo-500/20 text-indigo-200'
                  : 'border-slate-700 text-slate-400 hover:border-slate-600 hover:text-slate-200'
              } transition-all`}
            >
              Registrieren
            </button>
          </div>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <Input
              type="email"
              label="E-Mail-Adresse"
              placeholder="du@example.com"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <Input
              type="password"
              label="Passwort"
              placeholder="Mindestens 8 Zeichen"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={8}
              required
            />
            <Button
              type="submit"
              variant="primary"
              size="lg"
              className="w-full"
              disabled={loading}
            >
              {loading ? 'Bitte warten …' : mode === 'login' ? 'Anmelden' : 'Registrieren'}
            </Button>
          </form>

          {/* Biometric Login Option */}
          {mode === 'login' && biometricAvailable && (
            <>
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-700"></div>
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-slate-900/60 px-2 text-slate-400">oder</span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleBiometricLogin}
                disabled={biometricLoading}
                className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-purple-500/30 hover:border-purple-500/50 rounded-lg text-slate-200 font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {biometricLoading ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-purple-400"></div>
                    <span>Authentifiziere...</span>
                  </>
                ) : (
                  <>
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.04l.054-.09A13.916 13.916 0 008 11a4 4 0 118 0c0 1.017-.07 2.019-.203 3m-2.118 6.844A21.88 21.88 0 0015.171 17m3.839 1.132c.645-2.266.99-4.659.99-7.132A8 8 0 008 4.07M3 15.364c.64-1.319 1-2.8 1-4.364 0-1.457.39-2.823 1.07-4"
                      />
                    </svg>
                    <span>Mit Biometrie anmelden</span>
                  </>
                )}
              </button>
            </>
          )}

          {error && (
            <Alert variant="error" className="mt-4">
              <div>
                <p className="font-medium">Fehler</p>
                <p className="text-sm">{error}</p>
              </div>
            </Alert>
          )}

          {message && (
            <Alert variant="success" className="mt-4">
              <div>
                <p className="font-medium">{message}</p>
                <p className="text-sm">Du wirst gleich zum Dashboard weitergeleitet.</p>
              </div>
            </Alert>
          )}

          <div className="mt-6 text-sm text-slate-400 text-center">
            QR-Login ausprobieren? Besuche den <a href="/qr" className="text-indigo-300 hover:text-indigo-200 underline">QR-Flow</a>.
          </div>
        </Card>
      </div>
    </div>
  );
}
