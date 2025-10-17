'use client';

import { useEffect, useState } from 'react';
import { deriveMasterKey, encryptBlob, decryptBlob } from '@easykey/crypto';
import { getStash, clearStash, GenStash } from '../../lib/stash';

function b64uToBytes(b64: string) {
  try { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
  catch { return new Uint8Array(0); }
}
function bytesToB64u(bytes: Uint8Array) {
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function genSaltB64() {
  const a = new Uint8Array(16);
  crypto.getRandomValues(a);
  return bytesToB64u(a);
}

type VaultGetResp = { version: number; blob: string };

export default function VaultPage() {
  const [pwd, setPwd] = useState('');
  const [pending, setPending] = useState<GenStash | null>(null);
  const [saltB64, setSaltB64] = useState<string>(() => {
    const k = 'ek_dev_salt';
    if (typeof window === 'undefined') return '';
    let v = localStorage.getItem(k);
    if (!v) { v = genSaltB64(); localStorage.setItem(k, v); }
    return v;
  });
  const [key, setKey] = useState<Uint8Array | null>(null);

  const [vaultJson, setVaultJson] = useState<string>('{"items": []}');
  const [version, setVersion] = useState<number>(0);
  const [status, setStatus] = useState<string>('');

  async function derive() {
    try {
      setStatus('Key ableiten …');
      const salt = b64uToBytes(saltB64);
      if (!(salt instanceof Uint8Array) || salt.length !== 16) {
        setStatus('Salt muss genau 16 Bytes (Base64) haben.');
        return;
      }
      const k = await deriveMasterKey(pwd, salt);
      setKey(k);
      setStatus('🔑 Key bereit');
      if (pending) tryMergePendingIntoVault();
    } catch (e: any) {
      setStatus(`Ableitung fehlgeschlagen: ${e?.message || e}`);
    }
  }

  async function save() {
    if (!key) return setStatus('Bitte erst Key ableiten.');
    try {
      const plain = new TextEncoder().encode(vaultJson);
      const { nonce, cipher } = await encryptBlob(plain, key);
      const blobB64 = bytesToB64u(new Uint8Array([...nonce, ...cipher]));
      const res = await fetch('/backend/api/v1/vault', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version, blob: blobB64 }),
      });
      if (res.status === 409) {
        const j = await res.json();
        setStatus(`Konflikt: aktuelle Version ist ${j.currentVersion}`);
        setVersion(j.currentVersion);
        return;
      }
      if (!res.ok) throw new Error('save failed');
      const j = await res.json();
      setVersion(j.newVersion);
      setStatus(`Gespeichert (v${j.newVersion})`);
    } catch (e: any) {
      setStatus(`Fehler: ${e?.message || e}`);
    }
  }

  async function loadVault() {
    setStatus('Lade Vault …');
    const res = await fetch('/backend/api/v1/vault', { cache: 'no-store' });
    if (res.status === 404) {
      setStatus('Kein Vault vorhanden (neu anlegen).');
      setVersion(0);
      return;
    }
    if (!res.ok) { setStatus('Load failed'); return; }
    const j = (await res.json()) as VaultGetResp;
    setVersion(j.version);
    if (!key) { setStatus('Vault geladen – bitte Key ableiten zum Entschlüsseln.'); return; }
    try {
      const all = b64uToBytes(j.blob);
      const nonce = all.slice(0, 24);
      const cipher = all.slice(24);
      const plain = await decryptBlob(nonce, cipher, key);
      setVaultJson(new TextDecoder().decode(plain));
      setStatus(`Entschlüsselt (v${j.version})`);
      if (pending) tryMergePendingIntoVault();
    } catch {
      setStatus('Entschlüsselung fehlgeschlagen (falsches PW/Salt?).');
    }
  }

  function tryMergePendingIntoVault() {
    if (!pending || !key) return;
    try {
      const obj = JSON.parse(vaultJson || '{"items":[]}');
      if (!Array.isArray(obj.items)) obj.items = [];
      const item = {
        id: Date.now(),
        title: pending.label || 'Unbenannt',
        username: '',
        password: pending.password,
        createdAt: new Date().toISOString()
      };
      obj.items.push(item);
      setVaultJson(JSON.stringify(obj, null, 2));
      setStatus(`Eintrag übernommen: "${item.title}". Nicht vergessen: Speichern!`);
      clearStash();
      setPending(null);
    } catch {
      setStatus('Konnte nicht in das Vault-JSON einfügen (JSON prüfen).');
    }
  }

  useEffect(() => {
    const s = getStash();
    if (s) {
      setPending(s);
      setStatus('Empfangenes Passwort – bitte Key ableiten oder Vault laden.');
    }
  }, []);

  return (
    <section>
      <h1>🔐 Vault (Zero-Knowledge)</h1>

      <div style={{ display: 'grid', gap: 10, maxWidth: 720 }}>
        <label>Master-Passwort
          <input type="password" value={pwd} onChange={e => setPwd(e.target.value)} />
        </label>

        <label>Salt (Base64)
          <input value={saltB64} onChange={e => setSaltB64(e.target.value)} />
        </label>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => {
            const s = genSaltB64();
            setSaltB64(s);
            localStorage.setItem('ek_dev_salt', s);
            setStatus('Neues Salt erzeugt (16 Bytes).');
          }}>
            Salt neu generieren
          </button>
          <button onClick={derive}>Key ableiten</button>
          <button onClick={loadVault}>Vault laden</button>
          <button onClick={save}>Vault speichern</button>
          <button onClick={tryMergePendingIntoVault} disabled={!pending || !key}>
            Übernommenen Eintrag einfügen
          </button>
        </div>

        <p style={{ opacity: 0.9 }}>
          {key ? '🔑 Key bereit' : '⚠️ Noch kein Key abgeleitet'}
        </p>

        <label>Version
          <input value={version} readOnly />
        </label>

        <label>Vault JSON (wird lokal verschlüsselt)
          <textarea rows={12} value={vaultJson} onChange={e => setVaultJson(e.target.value)} />
        </label>

        <p style={{ opacity: 0.8 }}>{status}</p>
      </div>
    </section>
  );
}