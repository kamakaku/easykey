'use client';

import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { Card } from '../components/UI';
import { useAuth } from '../context/AuthContext';
import {
  isWebAuthnSupported,
  isPlatformAuthenticatorAvailable,
  registerBiometric,
  listBiometricCredentials,
  deleteBiometricCredential,
} from '@/lib/webauthn';
import { decryptFromStorage, encryptForStorage } from '@/lib/crypto';

interface Credential {
  id: string;
  authenticatorName: string;
  createdAt: string;
  lastUsedAt?: string;
}

interface SettingsClientProps {
  userId: string;
}

export default function SettingsClient({ userId }: SettingsClientProps) {
  const { encryptionKey } = useAuth();
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [loading, setLoading] = useState(true);
  const [registering, setRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Session Timeout
  const [sessionTimeout, setSessionTimeout] = useState<string>('30');
  const [savingTimeout, setSavingTimeout] = useState(false);

  // Master Password Change
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changingPassword, setChangingPassword] = useState(false);

  // Export/Backup
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);

  // Check biometric support on mount
  useEffect(() => {
    const checkSupport = async () => {
      const supported = isWebAuthnSupported();
      setBiometricSupported(supported);

      if (supported) {
        const available = await isPlatformAuthenticatorAvailable();
        setBiometricAvailable(available);
      }

      await loadCredentials();
      setLoading(false);
    };

    checkSupport();
  }, []);

  const loadCredentials = async () => {
    const result = await listBiometricCredentials();
    if (result.success && result.credentials) {
      setCredentials(result.credentials);
    } else {
      setError(result.error || 'Failed to load credentials');
    }
  };

  const handleRegister = async () => {
    setError(null);
    setSuccess(null);
    setRegistering(true);

    // For now, use userId as email placeholder
    // In production, you'd fetch the actual email from session
    const email = `user-${userId}@easykey.local`;

    const result = await registerBiometric(userId, email);

    if (result.success) {
      setSuccess('Biometrische Authentifizierung erfolgreich registriert!');
      await loadCredentials();
    } else {
      setError(result.error || 'Registrierung fehlgeschlagen');
    }

    setRegistering(false);
  };

  const handleDelete = async (credentialId: string) => {
    if (!confirm('Möchtest du diese Authentifizierungsmethode wirklich entfernen?')) {
      return;
    }

    setError(null);
    setSuccess(null);

    const result = await deleteBiometricCredential(credentialId);

    if (result.success) {
      setSuccess('Authentifizierungsmethode erfolgreich entfernt');
      await loadCredentials();
    } else {
      setError(result.error || 'Löschen fehlgeschlagen');
    }
  };

  const formatDate = (dateString: string) => {
    try {
      return new Date(dateString).toLocaleString('de-DE', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateString;
    }
  };

  // Load session timeout preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('ek_session_timeout');
      if (saved) setSessionTimeout(saved);
    } catch (e) {
      console.error('Failed to load session timeout preference', e);
    }
  }, []);

  const handleSessionTimeoutChange = async (value: string) => {
    setSavingTimeout(true);
    setError(null);

    try {
      localStorage.setItem('ek_session_timeout', value);
      setSessionTimeout(value);
      setSuccess('Session-Timeout aktualisiert');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError('Fehler beim Speichern des Timeouts');
    } finally {
      setSavingTimeout(false);
    }
  };

  const handlePasswordChange = async () => {
    setError(null);
    setSuccess(null);

    if (!currentPassword || !newPassword || !confirmPassword) {
      setError('Bitte alle Felder ausfüllen');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Neue Passwörter stimmen nicht überein');
      return;
    }

    if (newPassword.length < 8) {
      setError('Neues Passwort muss mindestens 8 Zeichen lang sein');
      return;
    }

    setChangingPassword(true);

    try {
      // Verify current password by trying to derive key
      const { generateKeyFromPassword } = await import('@/lib/crypto');
      const currentKeyResult = await generateKeyFromPassword(currentPassword);
      const currentKey = currentKeyResult.key;

      // Decrypt vault with current key to verify
      const vaultRes = await fetch('/backend/api/v1/vault', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!vaultRes.ok) {
        setError('Vault konnte nicht geladen werden');
        setChangingPassword(false);
        return;
      }

      const vaultData = await vaultRes.json();
      const blobDecoded = atob(vaultData.blob);

      let decrypted: string;
      try {
        decrypted = await decryptFromStorage(blobDecoded, currentKey);
      } catch (e) {
        setError('Aktuelles Passwort ist falsch');
        setChangingPassword(false);
        return;
      }

      // Generate new key from new password
      const newKeyResult = await generateKeyFromPassword(newPassword);
      const newKey = newKeyResult.key;

      // Re-encrypt vault with new key
      const reEncrypted = await encryptForStorage(decrypted, newKey);
      const reEncryptedB64 = btoa(reEncrypted);

      // Save re-encrypted vault
      const saveRes = await fetch('/backend/api/v1/vault', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blob: reEncryptedB64 }),
      });

      if (!saveRes.ok) {
        setError('Fehler beim Speichern des Vaults');
        setChangingPassword(false);
        return;
      }

      setSuccess('Master-Passwort erfolgreich geändert! Bitte mit neuem Passwort anmelden.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowPasswordChange(false);

      // Logout after 3 seconds
      setTimeout(() => {
        window.location.href = '/login';
      }, 3000);
    } catch (e: any) {
      setError(e.message || 'Fehler beim Ändern des Passworts');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleExportVault = async () => {
    if (!encryptionKey) {
      setError('Bitte zuerst anmelden');
      return;
    }

    setError(null);
    setSuccess(null);
    setExporting(true);

    try {
      const res = await fetch('/backend/api/v1/vault', {
        credentials: 'include',
        cache: 'no-store',
      });

      if (!res.ok) {
        setError('Vault konnte nicht geladen werden');
        setExporting(false);
        return;
      }

      const data = await res.json();
      const blobDecoded = atob(data.blob);
      const decrypted = await decryptFromStorage(blobDecoded, encryptionKey);

      // Create encrypted backup file
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0];
      const filename = `easykey-backup-${timestamp}.json`;

      const blob = new Blob([decrypted], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setSuccess('Vault erfolgreich exportiert!');
    } catch (e: any) {
      setError(e.message || 'Fehler beim Exportieren');
    } finally {
      setExporting(false);
    }
  };

  const handleImportVault = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!encryptionKey) {
      setError('Bitte zuerst anmelden');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    // Reset file input
    event.target.value = '';

    setError(null);
    setSuccess(null);
    setImporting(true);

    try {
      // Read file content
      const fileContent = await file.text();

      // Validate JSON format
      let importedData;
      try {
        importedData = JSON.parse(fileContent);
      } catch (e) {
        setError('Ungültiges Dateiformat. Die Datei muss eine gültige JSON-Datei sein.');
        setImporting(false);
        return;
      }

      // Validate vault structure (optional - basic validation)
      if (!importedData.items || !Array.isArray(importedData.items)) {
        setError('Ungültige Vault-Struktur. Bitte stelle sicher, dass die Datei ein gültiges EasyKey-Backup ist.');
        setImporting(false);
        return;
      }

      // Ask for confirmation
      const itemCount = importedData.items.length;
      const confirmed = confirm(
        `Möchtest du ${itemCount} Einträge importieren? Dies wird deinen aktuellen Vault überschreiben.\n\n` +
        'WARNUNG: Diese Aktion kann nicht rückgängig gemacht werden!'
      );

      if (!confirmed) {
        setImporting(false);
        return;
      }

      // Re-encrypt with current encryption key
      const reEncrypted = await encryptForStorage(fileContent, encryptionKey);
      const reEncryptedB64 = btoa(reEncrypted);

      // Save to backend
      const saveRes = await fetch('/backend/api/v1/vault', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blob: reEncryptedB64 }),
      });

      if (!saveRes.ok) {
        setError('Fehler beim Speichern des importierten Vaults');
        setImporting(false);
        return;
      }

      setSuccess(`Vault erfolgreich importiert! ${itemCount} Einträge wurden hinzugefügt. Bitte lade die Seite neu.`);

      // Reload page after 2 seconds to refresh vault data
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (e: any) {
      setError(e.message || 'Fehler beim Importieren');
    } finally {
      setImporting(false);
    }
  };

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-100 mb-2">Einstellungen</h1>
            <p className="text-slate-400">Verwalte deine Sicherheitseinstellungen und Authentifizierungsmethoden</p>
          </div>
          <Card>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
              <span className="ml-3 text-slate-300">Lade Einstellungen...</span>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-slate-100 mb-2">Einstellungen</h1>
          <p className="text-slate-400">Verwalte deine Sicherheitseinstellungen und Authentifizierungsmethoden</p>
        </div>
      {/* Status Messages */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
      )}
      {success && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-4">
          <p className="text-green-300 text-sm">{success}</p>
        </div>
      )}

      {/* Session Timeout Settings */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-green-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">Session-Timeout</h2>
            <p className="text-slate-400 text-sm">
              Automatische Abmeldung nach Inaktivität für erhöhte Sicherheit
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-3">
              Automatisch abmelden nach:
            </label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              {[
                { value: '5', label: '5 Minuten' },
                { value: '15', label: '15 Minuten' },
                { value: '30', label: '30 Minuten' },
                { value: '60', label: '1 Stunde' },
                { value: 'never', label: 'Nie' },
              ].map((option) => (
                <button
                  key={option.value}
                  onClick={() => handleSessionTimeoutChange(option.value)}
                  disabled={savingTimeout}
                  className={`px-4 py-3 rounded-lg text-sm font-medium transition-all ${
                    sessionTimeout === option.value
                      ? 'bg-green-500/20 border-green-500/50 text-green-300 border-2'
                      : 'bg-slate-700/50 border border-slate-600 text-slate-300 hover:bg-slate-700 hover:border-slate-500'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <p className="text-xs text-slate-500">
            Nach {sessionTimeout === 'never' ? 'unendlich' : `${sessionTimeout} Minuten`} Inaktivität wirst du automatisch abgemeldet.
          </p>
        </div>
      </Card>

      {/* Master Password Change */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-amber-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">Master-Passwort ändern</h2>
            <p className="text-slate-400 text-sm">
              Ändere dein Master-Passwort - der Vault wird automatisch neu verschlüsselt
            </p>
          </div>
        </div>

        {!showPasswordChange ? (
          <button
            onClick={() => setShowPasswordChange(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-amber-500/20 border border-amber-500/40 text-amber-300 font-medium rounded-xl hover:bg-amber-500/30 hover:border-amber-500/60 transition-all"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            Master-Passwort ändern
          </button>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Aktuelles Master-Passwort
              </label>
              <input
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                placeholder="Aktuelles Passwort eingeben"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Neues Master-Passwort
              </label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                placeholder="Mindestens 8 Zeichen"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Neues Passwort bestätigen
              </label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-4 py-3 bg-slate-900/50 border border-slate-700 rounded-lg text-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 outline-none transition-all"
                placeholder="Neues Passwort wiederholen"
              />
            </div>
            <div className="flex gap-3">
              <button
                onClick={handlePasswordChange}
                disabled={changingPassword}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-amber-500 to-orange-600 text-white font-medium rounded-xl hover:from-amber-600 hover:to-orange-700 transition-all shadow-lg shadow-amber-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {changingPassword ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    <span>Ändere Passwort...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    <span>Passwort ändern</span>
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowPasswordChange(false);
                  setCurrentPassword('');
                  setNewPassword('');
                  setConfirmPassword('');
                }}
                disabled={changingPassword}
                className="px-6 py-3 bg-slate-700/50 border border-slate-600 text-slate-300 font-medium rounded-xl hover:bg-slate-700 hover:border-slate-500 transition-all"
              >
                Abbrechen
              </button>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-4">
              <p className="text-amber-300 text-sm">
                <strong>Wichtig:</strong> Nach dem Ändern des Master-Passworts musst du dich neu anmelden.
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Export & Backup */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-blue-500/20">
            <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M9 19l3 3m0 0l3-3m-3 3V10" />
            </svg>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">Export & Backup</h2>
            <p className="text-slate-400 text-sm">
              Sichere deine Daten durch regelmäßige Backups
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleExportVault}
              disabled={exporting || !encryptionKey}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500/20 border border-blue-500/40 text-blue-300 font-medium rounded-xl hover:bg-blue-500/30 hover:border-blue-500/60 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {exporting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-300"></div>
                  <span>Exportiere...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  <span>Vault exportieren</span>
                </>
              )}
            </button>

            <label className="inline-flex items-center gap-2 px-6 py-3 bg-purple-500/20 border border-purple-500/40 text-purple-300 font-medium rounded-xl hover:bg-purple-500/30 hover:border-purple-500/60 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
              {importing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-purple-300"></div>
                  <span>Importiere...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <span>Vault importieren</span>
                </>
              )}
              <input
                type="file"
                accept=".json,application/json"
                onChange={handleImportVault}
                disabled={importing || !encryptionKey}
                className="hidden"
              />
            </label>
          </div>

          <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
            <div className="flex gap-3">
              <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-blue-300 text-sm space-y-2">
                <p><strong>Hinweise zu Export & Import:</strong></p>
                <ul className="list-disc list-inside space-y-1 text-blue-300/80">
                  <li>Die exportierte Datei enthält alle deine Passwörter im Klartext</li>
                  <li>Bewahre die Datei an einem sicheren Ort auf</li>
                  <li>Erstelle regelmäßig Backups deines Vaults</li>
                  <li>Beim Import wird dein aktueller Vault vollständig überschrieben</li>
                  <li>Der Import kann nicht rückgängig gemacht werden - erstelle vorher ein Backup!</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Biometric Authentication Section */}
      <div className="bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 rounded-2xl p-8">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0 shadow-lg shadow-indigo-500/20">
            <svg
              className="w-6 h-6 text-white"
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
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-bold text-white mb-2">
              Biometrische Authentifizierung
            </h2>
            <p className="text-slate-400 text-sm">
              Nutze Face ID, Touch ID oder Windows Hello für schnelleres und sicheres Einloggen
            </p>
          </div>
        </div>

        {!biometricSupported && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
            <p className="text-orange-300 text-sm">
              Dein Browser unterstützt keine biometrische Authentifizierung (WebAuthn).
            </p>
          </div>
        )}

        {biometricSupported && !biometricAvailable && (
          <div className="bg-orange-500/10 border border-orange-500/30 rounded-xl p-4 mb-6">
            <p className="text-orange-300 text-sm">
              Keine biometrische Hardware erkannt. Stelle sicher, dass dein Gerät Face ID, Touch
              ID oder Windows Hello unterstützt.
            </p>
          </div>
        )}

        {biometricSupported && biometricAvailable && (
          <div className="mb-6">
            <button
              onClick={handleRegister}
              disabled={registering}
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium rounded-xl hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg shadow-indigo-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {registering ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Registriere...</span>
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
                      d="M12 4v16m8-8H4"
                    />
                  </svg>
                  <span>Neue Authentifizierungsmethode hinzufügen</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Credentials List */}
        <div>
          <h3 className="text-lg font-semibold text-white mb-4">
            Registrierte Geräte ({credentials.length})
          </h3>

          {credentials.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-30"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
              <p>Noch keine biometrischen Authentifizierungsmethoden registriert.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {credentials.map((cred) => (
                <div
                  key={cred.id}
                  className="bg-slate-900/50 border border-slate-700/50 rounded-xl p-4 flex items-center justify-between hover:border-slate-600/50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 bg-indigo-500/20 rounded-lg flex items-center justify-center">
                      <svg
                        className="w-5 h-5 text-indigo-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z"
                        />
                      </svg>
                    </div>
                    <div>
                      <p className="text-white font-medium">{cred.authenticatorName}</p>
                      <p className="text-slate-400 text-xs">
                        Registriert: {formatDate(cred.createdAt)}
                      </p>
                      {cred.lastUsedAt && (
                        <p className="text-slate-500 text-xs">
                          Zuletzt verwendet: {formatDate(cred.lastUsedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDelete(cred.id)}
                    className="px-4 py-2 text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                  >
                    Entfernen
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Additional Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <div className="flex gap-3">
          <svg
            className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="text-blue-300 text-sm">
            <p className="font-medium mb-1">Hinweis zur Sicherheit</p>
            <p className="text-blue-300/80">
              Biometrische Authentifizierung ermöglicht es dir, dich ohne Master-Passwort
              anzumelden. Die biometrischen Daten verlassen niemals dein Gerät und werden sicher
              auf deinem System gespeichert.
            </p>
          </div>
        </div>
      </div>
      </div>
    </AppShell>
  );
}
