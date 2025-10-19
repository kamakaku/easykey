import { requireSession } from '../../lib/auth';
import GeneratorClient from './GeneratorClient';

export default async function GeneratorPage() {
  await requireSession();
  return <GeneratorClient />;
}
