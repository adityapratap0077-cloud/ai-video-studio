# Security Policy

## How API keys are handled

AI Video Studio is a bring-your-own-key (BYOK) application: users supply their own provider API keys, and the app is responsible for keeping them safe.

- **Encryption at rest:** keys are encrypted server-side with **AES-256-GCM** before being stored in the database. The data key comes from the `ENCRYPTION_KEY` environment variable (32-byte hex). Each stored key uses a unique random nonce (IV); the GCM auth tag is stored alongside the ciphertext.
- **Keys never leave the backend:** provider calls run in server actions / route handlers. The browser never receives a key, and API responses never include one.
- **Keys are never logged:** logging of request/response bodies on the provider call path is prohibited; error messages must not echo key material.
- **No keys in code:** source, tests, fixtures, docs, and CI configs must never contain real keys. Tests use mock providers; CI uses `ENCRYPTION_KEY=dummy-for-ci`.
- **In-memory only:** a key is decrypted transiently for a single outbound provider call and is not cached beyond that call's scope.

## If a key leaks

If you believe a provider API key was exposed (committed to a repo, pasted in an issue, leaked in logs):

1. **Revoke the key immediately at the provider** (e.g. OpenRouter dashboard → API keys → revoke). This is the step that actually stops misuse — do it first.
2. Generate a replacement key at the provider.
3. In AI Video Studio, go to **Settings → Providers**, delete the old entry, and add the new key.
4. If the leak was in a git commit, rotate the key (step 1) and consider the commit compromised — rewriting history does not un-expose a key that was pushed.

## Reporting a vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

- Preferred: use **GitHub Security Advisories** on this repository (Security tab → Report a vulnerability) for a private report.
- Alternative: email **security@ai-video-studio.example** with a description, steps to reproduce, and the affected version/commit.

We will acknowledge receipt within 72 hours, keep you updated on the fix timeline, and credit you in the advisory if you wish.

## Supported versions

| Version | Supported |
|---|---|
| `main` (latest) | ✅ |
| Tagged releases `>= 0.1.0` | ✅ security fixes |
| Anything older / unreleased experiments | ❌ |

Security fixes are released as patch versions and noted in the release notes.

## Scope notes

- This policy covers the AI Video Studio application code. It does **not** cover the security of third-party providers (OpenRouter, Veo, Runway, Kling, etc.) — report provider-side issues to the provider.
- Demo mode makes no network calls and stores no keys; it is out of scope for key-handling concerns.
