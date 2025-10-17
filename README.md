# EasyKey Monorepo

Monorepo scaffold for **EasyKey** (web, extension, mobile, services, shared packages).  
Tech highlights: Turborepo, pnpm workspaces, TypeScript, Next.js, Go service, Flutter stub, MV3 extension.

> ⚠️ Security note: This scaffold contains *placeholders* for crypto. Do **not** ship without replacing them with libsodium-based implementations and proper tests.

## Quick Start

```bash
# 1) Install pnpm if needed
npm i -g pnpm

# 2) Install root deps (only tooling at root)
pnpm install

# 3) Install app/package deps
pnpm -r install

# 4) Run web (Next.js) in dev
pnpm --filter @easykey/web dev

# 5) Run Go auth-api
cd services/auth-api && go run ./...
```

## Structure

```
apps/
  web/         Next.js app (TS, App Router)
  extension/   Chrome (MV3) extension (TS)
  mobile/      Flutter stub (iOS/Android)

services/
  auth-api/    Go HTTP service (health, QR challenge stub)

packages/
  crypto/      TS API (placeholders) – replace with libsodium wrappers
  ui/          Shared React UI primitives
  proto/       OpenAPI schema (seed)
```

## CI
GitHub Actions: Lint, Typecheck, Build (web, auth-api). Extend with SAST/DAST before prod.

## Next steps
- Replace `packages/crypto` with libsodium-based implementations.
- Wire QR login endpoints and add tests (unit/E2E).
- Add Semgrep/CodeQL, SBOM, signed release flow.
