# Deployment — free static hosting

The app is a static bundle (`npm run build` → `dist/`). Host it anywhere free. HTTPS is required for the PWA/service worker — all options below provide it.

## Option A — Netlify (drag & drop, simplest)
1. `npm run build`
2. Go to <https://app.netlify.com/drop> and drag the `dist/` folder in.
3. You get a `https://<name>.netlify.app` URL. Done.
- For auto-deploy: connect the repo, build command `npm run build`, publish dir `dist`.

## Option B — Cloudflare Pages
1. Push repo to GitHub.
2. Cloudflare dashboard → Pages → Connect repo. Build command `npm run build`, output dir `dist`.
3. Deploys on every push; gives `https://<name>.pages.dev`.

## Option C — GitHub Pages
GitHub Pages serves under `https://<user>.github.io/<repo>/`, so set the base path:
```bash
VITE_BASE="/<repo>/" npm run build
```
Then either push `dist/` to a `gh-pages` branch, or use the included workflow:

`.github/workflows/deploy.yml` (create it):
```yaml
name: Deploy
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: VITE_BASE="/${{ github.event.repository.name }}/" npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/deploy-pages@v4
```
Enable Pages → Source: **GitHub Actions** in repo settings.

## After deploying
- Send each employee: `https://your-site/?t=THEIR_TOKEN`
- On the phone: open the link → browser menu → **Add to Home Screen**. It launches full-screen like a native app.
- Update the Sheet/Form? No redeploy needed — config refreshes live. Redeploy only when you change app code.

## Custom domain (optional, still free)
All three hosts let you attach a custom domain with free HTTPS. Point a CNAME at the host and set it in their dashboard.
