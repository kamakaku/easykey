import Link from 'next/link';
import HealthBadge from './HealthBadge';

export default function Page() {
  return (
    <section>
      <h1>🔐 EasyKey</h1>
      <p>Monorepo scaffold ist bereit. Diese Web-App ist dein Next.js-Startpunkt.</p>
      <ul>
        <li>Shared UI: <code>@easykey/ui</code></li>
        <li>Crypto API (Platzhalter): <code>@easykey/crypto</code></li>
        <li>Service: <code>services/auth-api</code></li>
      </ul>

      <div style={{ marginTop: 16 }}>
        <HealthBadge />
      </div>

      <p style={{ marginTop: 16 }}>
        <a href="/qr">➡️ Zum QR-Login (POC)</a>
      </p>

      <p style={{ marginTop: 16 }}>
        <a href="/vault">🔐 Zum Vault</a>
      </p>
      <p style={{ marginTop: 8 }}>
        <a href="/generator">🔧 Passwort-Generator</a>
      </p>

      <p style={{ marginTop: 16 }}>
        <a href="/backend/health" target="_blank">Healthcheck (via Proxy)</a>
      </p>
    </section>
  );
}