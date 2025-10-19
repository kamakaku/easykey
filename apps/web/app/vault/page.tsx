import { requireSession } from '../../lib/auth';
import VaultClient from './VaultClient';

export default async function VaultPage() {
  await requireSession();
  return <VaultClient />;
}
