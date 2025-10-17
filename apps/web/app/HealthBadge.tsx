'use client';
import { useEffect, useState } from 'react';
import { getHealth } from '../lib/api';

export default function HealthBadge() {
  const [ok, setOk] = useState<boolean | null>(null);
  const [time, setTime] = useState<string>('');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const h = await getHealth(); // <-- Helper benutzen
        const status = (h as any).status ?? (h as any).Status;
        const t = (h as any).time ?? (h as any).Time;
        if (!mounted) return;
        setOk(status === 'ok');
        setTime(typeof t === 'string' ? t : '');
      } catch {
        if (!mounted) return;
        setOk(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 10,
    padding: '6px 10px',
    borderRadius: 12,
    fontSize: 14,
    border: '1px solid rgba(255,255,255,0.15)',
    background: ok === null ? '#2b2b2b' : ok ? '#1f4d2b' : '#4d1f1f',
    color: ok === null ? '#bbb' : ok ? '#c7f7d1' : '#ffc7c7',
  };

  return (
    <span style={style} title={time ? `API time: ${time}` : ''}>
      <span style={{
        width: 8, height: 8, borderRadius: 8,
        background: ok === null ? '#bbb' : ok ? '#4cff80' : '#ff4c4c'
      }} />
      {ok === null ? 'Checking API…' : ok ? 'API healthy' : 'API down'}
    </span>
  );
}