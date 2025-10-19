'use client';

import { useEffect } from 'react';

type LogoutHandler = () => Promise<void> | void;

const handlers = new Set<LogoutHandler>();

export function registerBeforeLogout(handler: LogoutHandler) {
  handlers.add(handler);
  return () => handlers.delete(handler);
}

export async function runBeforeLogout() {
  for (const handler of Array.from(handlers)) {
    await handler();
  }
}

export function useBeforeLogout(handler: LogoutHandler) {
  useEffect(() => {
    const cleanup = registerBeforeLogout(handler);
    return () => {
      cleanup();
    };
  }, [handler]);
}
