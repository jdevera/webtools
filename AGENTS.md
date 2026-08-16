# Agent notes

Read README.md first — it covers the repo layout, how tools are added
(`tools/<slug>.html`, self-contained, `<title>` + `<p class="description">`
required), local development, tests and deploy.

## Tool icons

Every tool should have an icon at `_index/icons/<slug>.svg`. The build inlines
it into the index card; a tool without one renders without an icon chip, so
missing icons never break the build — they just look bare.

Follow the house style when drawing one:

- 24×24 viewBox, `fill="none"`, `stroke="currentColor"`, stroke width 1.7,
  round caps and joins. Small solid details use `fill="currentColor"` with
  `stroke="none"`.
- Single color only — the index CSS tints the whole icon with the accent, so
  never hardcode colors.
- Depict the tool's subject, not its category: the giraffe puzzle gets a grid
  and a neck, not a generic controller.

When adding a tool, add its icon in the same commit.
