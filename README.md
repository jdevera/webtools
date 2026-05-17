# webtools

Tiny single-file browser tools, deployed by `git push` on Cloudflare Pages.

## Add a tool

Create `tools/<slug>.html`. The file is self-contained — inline CSS and JS. It must include:

- `<title>` — display name on the index.
- `<p class="description">…</p>` — a paragraph describing the tool. Shown on the tool page; also extracted (with inline tags stripped, whitespace collapsed) for the index card.

Cloudflare Pages serves it at `/<slug>` (the `.html` is stripped). Reserved slugs: `index` and anything starting with `_`.

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
