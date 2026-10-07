# Contributing to AI Video Studio

Thanks for considering a contribution. This project is built in the open and PRs are welcome — bug fixes, new provider adapters, UI improvements, docs, and tests.

## Setup

```bash
git clone https://github.com/your-org/ai-video-studio.git
cd ai-video-studio
cp .env.example .env
# Generate an encryption key (required even for tests):
# openssl rand -hex 32   -> paste into ENCRYPTION_KEY in .env
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Demo mode is on by default, so you can explore without any API keys.

## Branch and PR process

1. Fork the repo and create a branch from `main`: `git checkout -b feat/my-change` (or `fix/...`, `docs/...`).
2. Keep the change focused — one concern per PR.
3. Run the checks before pushing:
   ```bash
   pnpm lint
   pnpm exec tsc --noEmit
   pnpm test
   pnpm build
   ```
4. Open a PR against `main` using the pull request template. Describe what changed and why; link any related issue.
5. A maintainer will review. Expect feedback on provider-interface conformance and security handling of keys.

## Code style

- **TypeScript strict** — no `any` without justification, no unused variables, `tsconfig` strictness stays on.
- **No keys in code.** Never hardcode API keys, tokens, or secrets — not in source, tests, fixtures, or docs. Tests use the `DemoProvider` mocks; CI runs with `ENCRYPTION_KEY=dummy-for-ci`.
- Provider code depends on the interfaces in `src/lib/providers/types.ts`, never on concrete providers. New providers go in as adapters plus a settings-form entry.
- Follow the existing file layout and naming; prefer small, readable functions over clever ones.
- Run ESLint and fix all warnings before opening a PR.

## Testing

```bash
pnpm test        # Vitest, runs the full suite
pnpm test -- path/to/file.test.ts   # single file
```

- New provider adapters ship with unit tests against recorded fixtures (no live API calls in tests — ever).
- Pipeline logic (Phase 2+) must have Zod-schema round-trip tests.
- If you fix a bug, add a regression test that fails without the fix.

## Commit messages

Use clear, imperative messages: `feat: add Kling video adapter`, `fix: retry Zod parse on malformed script JSON`, `docs: clarify BYOK setup`. Reference issue numbers where relevant (`fixes #123`).

## DCO / CLA

No CLA to sign. By opening a pull request you certify the [Developer Certificate of Origin](https://developercertificate.org/) — i.e. you wrote the contribution or have the right to submit it, and you agree it is released under the project's MIT license. (If the project ever needs a formal CLA, it will be announced here; until then, PRs welcome as-is.)

## Security-sensitive changes

Changes touching key storage, encryption, or the provider call path get extra review. If you spot a vulnerability, **do not open a public issue** — follow [SECURITY.md](SECURITY.md) instead.

## Code of Conduct

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md). Be kind, be direct, assume good intent.
