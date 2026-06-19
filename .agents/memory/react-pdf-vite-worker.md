---
name: react-pdf worker setup in Vite/pnpm monorepo
description: How to correctly wire up the PDF.js worker for react-pdf in a pnpm workspace Vite app
---

## Rule
Copy the pdfjs-dist worker file to the artifact's `public/` directory and reference it via `import.meta.env.BASE_URL`.

```bash
cp node_modules/.pnpm/pdfjs-dist@<version>/node_modules/pdfjs-dist/build/pdf.worker.min.mjs \
   artifacts/portal/public/pdf.worker.min.mjs
```

```ts
pdfjs.GlobalWorkerOptions.workerSrc = `${import.meta.env.BASE_URL}pdf.worker.min.mjs`;
```

**Why:** Two approaches that do NOT work in pnpm + Vite 7:
- `new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)` — resolves relative to the source file path, not node_modules, resulting in a 404 for the worker script.
- `import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"` — Vite can't resolve the deep pnpm store path, throws "does the file exist?" error.

The static copy in `public/` is always served at the correct base path and avoids bundler resolution entirely.

**How to apply:** Any time react-pdf (or pdfjs-dist directly) is added to a pnpm monorepo Vite artifact, copy the worker file and use BASE_URL.
