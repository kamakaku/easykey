'use client';
import { useState } from 'react';
import { generatePassword } from '../../lib/generator';
import { saveStash } from '../../lib/stash';

export default function GeneratorPage() {
  const [length, setLength] = useState(16);
  const [symbols, setSymbols] = useState(false);
  const [exclude, setExclude] = useState('');
  const [pw, setPw] = useState('');
  const [label, setLabel] = useState('');

  async function doGen() {
    const p = await generatePassword({ length, symbols, exclude });
    setPw(p);
  }

  // "Ins Vault übernehmen": legt (oder aktualisiert) ein Item in deinem Vault-JSON im LocalStorage-Puffer ab.
  // Der Vault-Editor liest es nicht automatisch – aber du kannst es in /vault per "Vault laden" ziehen
  // oder du kopierst den JSON-Block manuell rüber (einfachster Weg).
  function copyToClipboard() {
    if (!pw) return;
    navigator.clipboard.writeText(pw);
  }

  return (
    <section>
      <h1>🔧 Passwort-Generator</h1>

      <div style={{display:'grid', gap:10, maxWidth:520}}>
        <label>Länge
          <input type="number" min={8} max={128} value={length} onChange={e=>setLength(+e.target.value)} />
        </label>
        <label><input type="checkbox" checked={symbols} onChange={e=>setSymbols(e.target.checked)} /> Sonderzeichen</label>
        <label>Ausschließen (z. B. O0lI)
          <input value={exclude} onChange={e=>setExclude(e.target.value)} />
        </label>
        <label>Label (optional)
          <input value={label} onChange={e=>setLabel(e.target.value)} placeholder="z. B. Mail-Account" />
        </label>

        <div style={{display:'flex', gap:8, flexWrap:'wrap'}}>
          <button onClick={doGen}>Generieren</button>
          <button onClick={copyToClipboard} disabled={!pw}>Kopieren</button>
          <button onClick={()=>{
            if (!pw) return;
              const ok = saveStash({ password: pw, label: label || undefined });
              if (ok) window.location.href = '/vault';
            }} disabled={!pw}>
            Ins Vault übernehmen
          </button>
        </div>

        <label>Ergebnis
          <input readOnly value={pw} />
        </label>

        <p style={{opacity:.8}}>
          Tipp: Öffne <a href="/vault">/vault</a>, füge das Passwort in dein JSON ein und speichere (verschlüsselt).
        </p>
      </div>
    </section>
  );
}