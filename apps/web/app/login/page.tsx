import { redirect } from 'next/navigation';
import LoginClient from './LoginClient';
import { getSession } from '../../lib/auth';

export default async function LoginPage() {
  const session = await getSession();
  if (session) {
    redirect('/dashboard');
  }
  return <LoginClient />;
}
