import "./globals.css";
import type { Metadata } from "next";
import { AuthProvider } from "./context/AuthContext";

export const metadata: Metadata = {
  title: "EasyKey",
  description: "Zero-knowledge password manager",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de">
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}