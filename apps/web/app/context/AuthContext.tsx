'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { exportKey, importKey } from '../../lib/crypto';

interface AuthContextType {
  isAuthenticated: boolean;
  isLoading: boolean;
  userId: string | null;
  encryptionKey: CryptoKey | null;
  checkAuth: () => Promise<void>;
  logout: () => Promise<void>;
  setEncryptionKey: (key: CryptoKey) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [encryptionKey, setEncryptionKeyState] = useState<CryptoKey | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  // Session timeout state
  const [lastActivity, setLastActivity] = useState<number>(Date.now());

  // Lade Encryption Key aus sessionStorage beim Start
  useEffect(() => {
    async function loadEncryptionKey() {
      try {
        const keyBase64 = sessionStorage.getItem('ek_encryption_key');
        if (keyBase64) {
          const key = await importKey(keyBase64);
          setEncryptionKeyState(key);
        }
      } catch (error) {
        console.error('Fehler beim Laden des Encryption Keys:', error);
        sessionStorage.removeItem('ek_encryption_key');
      }
    }
    loadEncryptionKey();
  }, []);

  // Funktion zum Setzen des Encryption Keys
  async function setEncryptionKey(key: CryptoKey) {
    try {
      // Speichere in sessionStorage (bleibt bei Refresh, aber nicht beim Browser-Schließen)
      const keyBase64 = await exportKey(key);
      sessionStorage.setItem('ek_encryption_key', keyBase64);
      setEncryptionKeyState(key);
    } catch (error) {
      console.error('Fehler beim Speichern des Encryption Keys:', error);
      throw error;
    }
  }

  async function checkAuth() {
    try {
      const response = await fetch('http://localhost:8080/api/v1/auth/me', {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setIsAuthenticated(true);
        setUserId(data.sub || null);
      } else {
        setIsAuthenticated(false);
        setUserId(null);
      }
    } catch (error) {
      setIsAuthenticated(false);
      setUserId(null);
    } finally {
      setIsLoading(false);
    }
  }

  async function logout() {
    try {
      await fetch('http://localhost:8080/api/v1/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
    }

    // Lösche Encryption Key aus Memory und sessionStorage
    setEncryptionKeyState(null);
    sessionStorage.removeItem('ek_encryption_key');

    setIsAuthenticated(false);
    setUserId(null);
    router.push('/auth');
  }

  useEffect(() => {
    checkAuth();
  }, []);

  // Session timeout logic
  useEffect(() => {
    if (!isAuthenticated) return;

    // Get timeout preference from localStorage
    const getTimeoutMinutes = (): number | null => {
      try {
        const timeout = localStorage.getItem('ek_session_timeout');
        if (!timeout || timeout === 'never') return null;
        return parseInt(timeout, 10);
      } catch {
        return 30; // Default 30 minutes
      }
    };

    const timeoutMinutes = getTimeoutMinutes();
    if (timeoutMinutes === null) return; // No timeout if set to 'never'

    // Update last activity on user interaction
    const updateActivity = () => {
      setLastActivity(Date.now());
    };

    // Listen to user activity events
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach(event => {
      window.addEventListener(event, updateActivity);
    });

    // Check for inactivity every 30 seconds
    const checkInterval = setInterval(() => {
      const now = Date.now();
      const inactiveTime = now - lastActivity;
      const timeoutMs = timeoutMinutes * 60 * 1000;

      if (inactiveTime >= timeoutMs) {
        console.log('Session timeout due to inactivity');
        logout();
      }
    }, 30000); // Check every 30 seconds

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, updateActivity);
      });
      clearInterval(checkInterval);
    };
  }, [isAuthenticated, lastActivity]);

  // Redirect logic
  useEffect(() => {
    if (isLoading) return;

    const publicPaths = ['/auth', '/qr'];
    const isPublicPath = publicPaths.includes(pathname);

    if (!isAuthenticated && !isPublicPath) {
      router.push('/auth');
    } else if (isAuthenticated && pathname === '/') {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, pathname, router]);

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        isLoading,
        userId,
        encryptionKey,
        checkAuth,
        logout,
        setEncryptionKey,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
