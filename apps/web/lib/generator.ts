import { ready } from '@easykey/crypto';

export async function generatePassword(opts: {
  length: number;
  upper?: boolean;
  lower?: boolean;
  digits?: boolean;
  symbols?: boolean;
  exclude?: string;
}) {
  const s = await ready();
  const sets = {
    upper: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
    lower: 'abcdefghijklmnopqrstuvwxyz',
    digits: '0123456789',
    symbols: '!@#$%^&*()-_=+[]{};:,.?/\\|~'
  };
  let alphabet = '';
  if (opts.upper !== false) alphabet += sets.upper;
  if (opts.lower !== false) alphabet += sets.lower;
  if (opts.digits !== false) alphabet += sets.digits;
  if (opts.symbols) alphabet += sets.symbols;

  if (!alphabet) throw new Error('Alphabet leer – wähle mindestens einen Zeichentyp.');
  if (opts.exclude) {
    const ex = new Set(opts.exclude.split(''));
    alphabet = [...alphabet].filter(ch => !ex.has(ch)).join('');
  }
  if (alphabet.length < 8) throw new Error('Alphabet zu klein.');

  const buf = s.randombytes_buf(opts.length);
  return Array.from(buf, b => alphabet.charAt(b % alphabet.length)).join('');
}