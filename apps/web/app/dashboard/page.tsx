import { requireSession } from '../../lib/auth';
import DashboardClient from './DashboardClient';

export default async function DashboardPage() {
  await requireSession();
  return <DashboardClient />;
}
