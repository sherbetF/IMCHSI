# Hospital Staff Hub

hi , please make a database website for my hospital staff , make the UI , design , font , colour , size , shape , minimalism same as the one in this website https://www.bmkg.go.id/gempabumi/20260816061534 . copy the UI , design , font , colour . 1 to 1

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f1a81ec0-d74a-4409-b29d-a16dc89718d3).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

## Deploying to GitHub Pages

This project is fully configured for automated deployment to **GitHub Pages** via GitHub Actions.

### Quick Setup Steps on GitHub:

1. Push this repository to GitHub on branch `main` or `master`.
2. On GitHub, go to your repository **Settings** → **Pages** (under the "Code and automation" sidebar).
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` will automatically build and publish your site whenever you push changes to `main`!

### Features configured for GitHub Pages:

- **Automatic subpath base resolution**: Supports both `https://<username>.github.io/<repo-name>/` and custom domains.
- **Client-Side SPA Routing fallback**: Included `404.html` redirect and route static HTML pages to prevent 404 errors when reloading subpages like `/staff`, `/stress-test`, or `/holter`.
- **Bypass Jekyll**: `.nojekyll` included in the build output to ensure all static assets load properly.
- **Build output**: Static bundle is generated into `dist/` and `.output/public/`.
