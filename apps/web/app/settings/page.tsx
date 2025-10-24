import { requireSession } from '@/lib/auth';
import SettingsClient from './SettingsClient';

export default async function SettingsPage() {
  const session = await requireSession();

  return <SettingsClient userId={session.userId} />;
}
