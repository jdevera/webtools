# htmltools

Tiny single-file browser tools, deployed by `git push` on Cloudflare Pages.

## Add a tool

Create `tools/<slug>/index.html`. The file is self-contained — inline CSS and JS. It must include:

- `<title>` — display name on the index.
- `<meta name="description" content="...">` — short blurb on the index.

Commit and push. Cloudflare Pages builds and deploys automatically.

## Local development

```sh
npm run build
npx serve dist
```

## Tests

```sh
npm test
```

## Deploy (Cloudflare Pages, one-time setup)

- Framework preset: **None**
- Build command: `node build.mjs`
- Build output directory: `dist`
- Production branch: `main`
