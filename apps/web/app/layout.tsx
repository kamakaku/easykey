export const metadata = { title: 'EasyKey', description: 'Secure password manager (MVP scaffold)' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <main style={{ padding: 24, fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif' }}>
          {children}
        </main>
      </body>
    </html>
  );
}
