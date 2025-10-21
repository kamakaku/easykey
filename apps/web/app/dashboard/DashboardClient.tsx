'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { Card, Badge, Alert } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import { decryptFromStorage } from '../../lib/crypto';

function decodeFromBase64(b64: string) {
  try {
    if (typeof window === 'undefined') {
      return '';
    }
    const binary = atob(b64);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
}

type VaultItemSummary = {
  id: number;
  title: string;
  expiresAt?: string;
};

export default function DashboardClient() {
  const { userId, encryptionKey } = useAuth();
  const [vaultCount, setVaultCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [expiredVaultItems, setExpiredVaultItems] = useState<VaultItemSummary[]>([]);

  useEffect(() => {
    async function loadVaultStats() {
      if (!encryptionKey) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/backend/api/v1/vault', {
          cache: 'no-store',
          credentials: 'include',
        });

        if (res.status === 404) {
          setVaultCount(0);
          setExpiredVaultItems([]);
          return;
        }

        if (!res.ok) {
          setVaultCount(0);
          return;
        }

        const data = await res.json();
        const blobDecoded = atob(data.blob);

        let json = '';
        // Prüfe ob neues verschlüsseltes Format (iv:ciphertext)
        if (blobDecoded.includes(':')) {
          // Neues verschlüsseltes Format
          json = await decryptFromStorage(blobDecoded, encryptionKey);
        } else {
          // Altes Base64-Format
          json = decodeFromBase64(data.blob);
        }

        const parsed = JSON.parse(json || '{}');
        const items = Array.isArray(parsed.items) ? parsed.items : [];
        setVaultCount(items.length);

        const now = Date.now();
        const expired = items
          .filter((item: any) => item?.expiresAt)
          .filter((item: any) => {
            const time = new Date(item.expiresAt).getTime();
            return Number.isFinite(time) && time <= now;
          })
          .map((item: any) => ({
            id: item.id,
            title: item.title,
            expiresAt: item.expiresAt,
          }));

        setExpiredVaultItems(expired);
      } catch (error) {
        console.error('Failed to load vault stats:', error);
        setVaultCount(0);
        setExpiredVaultItems([]);
      } finally {
        setLoading(false);
      }
    }

    loadVaultStats();
  }, [encryptionKey]);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Welcome Section */}
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Willkommen zurück!</h1>
          <p className="text-slate-400">Verwalte deine Passwörter sicher und einfach.</p>
        </div>

        {/* Info Alert */}
        <Alert variant="success">
          <div>
            <p className="font-medium mb-1">Erfolgreich eingeloggt</p>
            <p className="text-sm opacity-90">Deine Session ist aktiv und alle Daten sind sicher verschlüsselt.</p>
          </div>
        </Alert>

        {/* Expired Passwords */}
        {!loading && expiredVaultItems.length > 0 && (
          <Card className="border border-red-500/40 bg-red-500/5">
            <h3 className="text-lg font-semibold text-red-300 mb-3">Abgelaufene Passwörter</h3>
            <p className="text-sm text-red-200 mb-3">
              Diese Einträge sind abgelaufen und sollten aktualisiert werden:
            </p>
            <div className="space-y-2">
              {expiredVaultItems.slice(0, 5).map(item => (
                <a
                  key={item.id}
                  href="/vault"
                  className="flex items-center justify-between gap-4 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 rounded-lg transition-colors"
                >
                  <div>
                    <p className="font-medium text-red-100">{item.title}</p>
                    <p className="text-xs text-red-200">
                      Abgelaufen am{' '}
                      {item.expiresAt
                        ? new Date(item.expiresAt).toLocaleDateString('de-DE', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : 'Unbekannt'}
                    </p>
                  </div>
                  <Badge variant="error">Jetzt anpassen</Badge>
                </a>
              ))}
              {expiredVaultItems.length > 5 && (
                <p className="text-xs text-red-200">+{expiredVaultItems.length - 5} weitere</p>
              )}
            </div>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <a href="/vault" className="block">
            <Card className="group hover:scale-105 cursor-pointer transition-transform">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Gespeicherte Passwörter</p>
                  <p className="text-3xl font-bold text-slate-100">
                    {loading ? '...' : vaultCount}
                  </p>
                </div>
                <div className="w-12 h-12 bg-indigo-500/10 rounded-xl flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                  <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                {vaultCount === 0 ? (
                  <Badge variant="info">Vault leer</Badge>
                ) : (
                  <Badge variant="success">{vaultCount} {vaultCount === 1 ? 'Eintrag' : 'Einträge'}</Badge>
                )}
              </div>
            </Card>
          </a>

          <a href="/generator" className="block">
            <Card className="group hover:scale-105 cursor-pointer transition-transform">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Passwort-Generator</p>
                  <p className="text-lg font-semibold text-slate-100 mt-2">Sichere Passwörter</p>
                </div>
                <div className="w-12 h-12 bg-green-500/10 rounded-xl flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                  <svg className="w-6 h-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <Badge variant="success">Bereit</Badge>
              </div>
            </Card>
          </a>

          <a href="/qr" className="block">
            <Card className="group hover:scale-105 cursor-pointer transition-transform">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">QR-Code Login</p>
                  <p className="text-lg font-semibold text-slate-100 mt-2">Schneller Zugang</p>
                </div>
                <div className="w-12 h-12 bg-purple-500/10 rounded-xl flex items-center justify-center group-hover:bg-purple-500/20 transition-colors">
                  <svg className="w-6 h-6 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                  </svg>
                </div>
              </div>
              <div className="mt-4">
                <Badge variant="default">Verfügbar</Badge>
              </div>
            </Card>
          </a>
        </div>

        {/* Quick Actions */}
        <Card>
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Schnellaktionen</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <a
              href="/vault"
              className="flex items-center gap-4 p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all group border border-slate-600/50 hover:border-slate-500"
            >
              <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center group-hover:bg-indigo-500/20 transition-colors">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-100 group-hover:text-white transition-colors">Vault öffnen</p>
                <p className="text-sm text-slate-400">Passwörter verwalten</p>
              </div>
              <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>

            <a
              href="/generator"
              className="flex items-center gap-4 p-4 bg-slate-700/30 hover:bg-slate-700/50 rounded-xl transition-all group border border-slate-600/50 hover:border-slate-500"
            >
              <div className="w-10 h-10 bg-green-500/10 rounded-lg flex items-center justify-center group-hover:bg-green-500/20 transition-colors">
                <svg className="w-5 h-5 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="font-medium text-slate-100 group-hover:text-white transition-colors">Passwort generieren</p>
                <p className="text-sm text-slate-400">Sichere Passwörter erstellen</p>
              </div>
              <svg className="w-5 h-5 text-slate-400 group-hover:text-slate-100 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </a>
          </div>
        </Card>

        {/* Security Features */}
        <Card>
          <h3 className="text-lg font-semibold text-slate-100 mb-4">Sicherheitsfeatures</h3>
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">Zero-Knowledge Verschlüsselung</p>
                <p className="text-xs text-slate-400">Deine Daten sind Ende-zu-Ende verschlüsselt</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">Client-seitige Verschlüsselung</p>
                <p className="text-xs text-slate-400">Passwörter werden nur lokal entschlüsselt</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-500/10 rounded-lg flex items-center justify-center">
                <svg className="w-4 h-4 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-200">QR-basierte Authentifizierung</p>
                <p className="text-xs text-slate-400">Sicherer Login ohne Passwort-Eingabe</p>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
