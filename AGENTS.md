# Repository Guidelines

## Project Structure & Module Organization
- `app/`: Next.js App Router entry. Key files: `layout.tsx`, `page.tsx`, global styles in `app/globals.css`.
- `public/`: Static assets served at `/` (e.g., `vercel.svg`).
- Config: `eslint.config.mjs`, `tsconfig.json`, `postcss.config.mjs`.
- Language/stack: TypeScript, React 19, Next.js 15 (Turbopack), TailwindCSS v4.

## Build, Test, and Development Commands
- `npm run dev`: Start local dev server with Turbopack at `http://localhost:3000`.
- `npm run build`: Production build (`.next/`).
- `npm start`: Run the production server from the build output.
- `npm run lint`: Lint the project using ESLint’s Next.js config.

Examples:
```
# develop
npm run dev
# verify before pushing
npm run lint && npm run build
```

## Coding Style & Naming Conventions
- **TypeScript** strict mode; prefer explicit types for public exports.
- **Indentation**: 2 spaces; single quotes or double quotes consistently (project currently uses double quotes).
- **Components**: PascalCase (e.g., `QrPreview.tsx`); hooks: camelCase (`useQrDecode`).
- **Files**: Next app files follow framework names (`page.tsx`, `layout.tsx`).
- **Imports**: Use alias `@/*` when helpful (see `tsconfig.json`).
- **Linting**: Fix issues with `npm run lint -- --fix` when possible.

## Testing Guidelines
- Tests are not configured yet. Preferred approach for contributions:
  - Unit: **Vitest** + **@testing-library/react**.
  - E2E: **Playwright**.
- Naming: co-locate as `*.test.ts(x)` next to source or under `app/__tests__/`.
- Aim for ≥80% coverage on new code; include tests for decoding logic and error states.

## Commit & Pull Request Guidelines
- Commits follow Conventional Commits (repo history examples: `feat: qr reader`).
  - Examples: `feat(app): add jsqr fallback`, `fix(ui): handle missing BarcodeDetector`, `chore: bump next`.
- PRs: include summary, linked issues, screenshots/GIFs for UI changes, and a brief testing plan.
- Before opening: `npm run lint && npm run build`; keep diffs focused and small.

## Security & Configuration Tips
- Image decoding runs client‑side; do not upload files to servers.
- Avoid adding secrets; `.env` is not required for current features.
- Be mindful of bundle size; prefer dynamic imports for optional paths (e.g., `jsqr`).

