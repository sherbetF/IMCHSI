<!-- LOVABLE:BEGIN -->

> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

<!-- LOVABLE:END -->

# IMCHSI Production Deployment & Routing Architecture Rules

The IMCHSI website is deployed to **GitHub Pages** from the `sherbetF/IMCHSI` repository and served under the custom domain:
**`https://imchsi.com/`**

### 1. Base Path & Vite Configuration
- **Production Base Path**: Must ALWAYS be `/` (root), NOT `/IMCHSI/` and NOT `./`.
- In `.github/workflows/deploy.yml`, `VITE_BASE_PATH` must remain `/`.
- In `vite.config.spa.ts`, the base path resolves with fallback to `./` in dev/local, but production builds use `VITE_BASE_PATH=/`.
- Assets must always resolve cleanly from the root of `https://imchsi.com/`.

### 2. Client-Side SPA & TanStack Router
- The application is a static client-side SPA deployed to GitHub Pages.
- In `src/router.tsx`, `basepath` must remain `"/"`.
- **DO NOT** convert the GitHub Pages SPA into a TanStack Start SSR/server architecture unless explicitly requested.
- **DO NOT** re-introduce TanStack Start server shell behavior into `src/routes/__root.tsx`.

### 3. Deep Routes & 404 SPA Fallback
- Deep routes (`/echo`, `/stress-test`, `/holter`, `/staff`, etc.) must work on direct URL entry and browser refresh without freezing, blank screens, or 404 errors.
- `scripts/prepare-gh-pages.js` generates physical directory route folders (`dist/echo/index.html`, `dist/stress-test/index.html`, `dist/holter/index.html`, etc.) as well as `dist/404.html` and `.nojekyll`.
- Preserve `index.html` redirection handler and `scripts/prepare-gh-pages.js`.

### 4. Firebase Architecture
- Do NOT start unfiltered or premature Firestore listeners before required context (e.g. `selectedFacility`) is loaded.
- Do NOT automatically seed or write data on route mount unless explicitly requested.
- Firestore initialization must never block initial React rendering.

### 5. Architectural Guardrails
- **DO NOT** modify `.github/workflows/deploy.yml`, `vite.config.spa.ts`, `scripts/prepare-gh-pages.js`, `src/router.tsx`, `src/routes/__root.tsx`, or `CNAME` when working on regular UI or feature requests unless explicitly directed.

