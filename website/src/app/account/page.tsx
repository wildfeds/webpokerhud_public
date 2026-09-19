import type { Metadata } from 'next';
import App from '@/portal/App';

export const metadata: Metadata = { title: 'Account' };

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <h1 className="text-3xl font-bold">Account</h1>
      <div className="mt-8">
        <App />
      </div>
    </div>
  );
}
