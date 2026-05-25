# Security model

## Threat model

- **Browser is the trust anchor** for signing and recovery. We assume the user
  controls their browser. The backend has no signing capability.
- **The backend is untrusted from the user's perspective** for keys, but
  trusted for accurate proxying. To verify, the user can self-host the backend
  or skip it entirely (the static GH Pages build talks to mempool.space
  directly).

## Key-handling rules

1. Private keys never leave the wallet that holds them.
2. BIP39 mnemonics in the Recovery tab are processed only in the browser
   thread that the user typed them into. They are not posted to the backend.
3. xpubs are public information by design and may be posted to the backend's
   `/api/recovery/scan` endpoint.
4. PSBTs are public objects (no private material). The backend may proxy them
   for convenience.

## Network hardening (backend)

- `@fastify/rate-limit` — 600 req/min default per IP. Lower in production.
- `@fastify/cors` — explicit allowlist via `CORS_ORIGINS`.
- `@fastify/jwt` — protects admin / write endpoints with HS256 tokens.
- `trustProxy: true` — works behind Cloudflare / nginx.
- All upstream calls use `undici` with strict status checks; no
  user-controlled redirects.

## CSP (recommended for self-hosted frontend)

```
default-src 'self';
script-src 'self' 'unsafe-inline';
style-src  'self' 'unsafe-inline';
img-src    'self' data:;
connect-src 'self' https://mempool.space https://blockstream.info wss://mempool.space https://*.your-backend.example;
frame-ancestors 'none';
base-uri 'self';
```

## Audit trail

Every backend route logs:
- request id, method, path
- IP (with proxy header trust)
- response status, duration

with `pino` JSON output. Pipe to your SIEM of choice (Loki, Datadog, etc.).

## What you should still do yourself

- Run your own [Bitcoin Core](https://bitcoincore.org) full node and point
  `BITCOIN_RPC_URL` at it. Public mempool indexers are convenient, but a
  full node is the only way to verify Mainnet state independently.
- Pin your dependency versions and review the `package-lock.json` diff on
  every update.
- For Stratum, use a TLS-terminating proxy in front (`stunnel`, `nginx`).
