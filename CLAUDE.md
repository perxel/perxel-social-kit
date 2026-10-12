# @perxel/social-kit

One post, every size: social images and reels, and the images and clips a site's blog posts need, from React templates the user's project owns. Public on GitHub (perxel/perxel-social-kit) and npm (`@perxel/social-kit`), MIT. Built 2026-10-12 as plan 017 of `../perxel-web-2026` (`.claude/plans/017-social-kit.md` there has the full decision record); Perxel's website is the main user and the place to try every change for real.

## Commands

- `pnpm install && pnpm build`: `tsc` to `dist/` (gitignored). **Rebuild after every change**: the CLI, the examples and any linked project run `dist/`, not `src/`.
- `pnpm typecheck`
- `pnpm example <command>`: runs the CLI in `examples/` (a neutral sample `social/`: the announcement post and `hello-reel`).
- No tests and no linter. Verify by running it (see "Checking a change").

## What it is

```
src/
  cli/index.ts        the CLI (parseArgs): init, new, render, preview, sheet, templates, eject, doctor, music, voice, visuals
  cli/init.ts         init: dev dependency, social/ scaffold, .gitignore, `npx skills add`, doctor
  project.ts          finds social/, loads social.config.ts, templates and posts through jiti
  types.ts            config, post, template types (+ defineConfig / definePost)
  beats.ts            beatGrid / gridFromAnalysis (browser-safe; templates import it)
  index.ts            what templates and configs import: browser-safe only (reels bundle it)
  render/server.ts    the kit's page server: template → static HTML (react-dom/server), files from the project root, contact sheet page
  render/chrome.ts    Chrome for Testing (puppeteer-core), waitReady (data-pending / data-error)
  render/still.ts     renderPost / renderPostTo (in-memory posts too), previewPost, renderSheet; dispatches reels and bundled stills
  render/reel.ts      everything through Remotion: reels (MP4), bundled stills (PNG), preview stills; the generated entry
  audio/              Python runner (shared uv venv), voice pipeline (Kokoro + ffmpeg)
  capture/browser.ts  live pages: devices, scroll targets through pinned sections, record steps (scroll, wait, pointer, click, tap, type, key)
  encode/web.ts       web presets: WebP (ImageMagick), MP4 (ffmpeg)
  visuals/            recipe types and the runner (build, status, inventory)
templates/            kit starters (announcement only); a project template of the same name replaces one
python/               analyze.py (librosa beat grid), voice.py (Kokoro)
skill/SKILL.md        the agent skill, installed with `npx skills add perxel/perxel-social-kit --skill social-kit`
examples/social/      sample project folder
```

### Four render paths
1. **Plain still** (default): the kit's own HTTP server renders the template with `react-dom/server` (jiti, automatic JSX, React aliased to the project's copy), serves the project's files from its root, and headless Chrome screenshots it per format. No bundler, no client JS. Assets are root URLs (`asset("social/assets/x.svg")` → `/social/assets/x.svg`).
2. **URL mode** (`post.url`): screenshot a page the project serves, `{format}` `{width}` `{height}` filled in.
3. **Bundled still** (`meta.bundle: true`): one-frame Remotion still, for client templates (effects, canvas, Lottie players, Tailwind, path aliases). Config `bundle`: `css` (imported into the entry), `tailwind` (`@remotion/tailwind-v4`), `alias` (relative to `social/`; also applied to jiti so Node can read the template's meta), `root` (the web root linked into the bundle so `/logo.svg` works). The wrapper waits on `data-pending` and fails on `data-error`, like path 1.
4. **Reel** (`meta.kind: "reel"`, `fps`, `duration`): Remotion composition per format, bundled once, `renderMedia` to H.264 (crf 18), plus a 12-frame strip per format for the sheet. Templates get `frame`, `fps`, `voice`, and may import Remotion directly.

Every template gets `mode: "still" | "reel"`. A `kind: "both"` template switches on it; a post with `reel: {formats}` renders its stills (path 1 or 3) and then its reel (path 4) in one `render` (`postPlan` in `project.ts`). Files in `out/` are `<name>-<format>.<ext>` (`postName`: `post.name`, else the folder name without its date); posts held in memory (visual composes) get no prefix.

Paths 3 and 4 share `prepareReel` in `render/reel.ts`: it writes `social/.kit/reel-<ref>.tsx` (self-gitignored) into the project so `remotion` and React resolve to the project's copies, bundles with the project root as Remotion's public dir (`symlinkPublicDir`), and overrides webpack (aliases, Tailwind, loader fixes below).

### Visuals runner
`social-kit visuals build|status|inventory` runs recipe files (`.ts` exporting `{visuals: [...]}` plus any fields the config uses, e.g. `collection`, `slug`). The config's `visuals` section says where recipes are, the output path per visual (a function), the cache, the web root, which files to check for placement. Kinds: capture, record, compose (a template at a format, rendered at 2x then downscaled to the format's width), provide, reuse; `intermediate` keeps a capture as a compose input (`"@<id>"` → a path from the project root, templates pass it through `asset()`). Live pages run headful (hover effects need `(hover: hover) and (pointer: fine)`).

## Decisions (owner, 2026-10-12) and why

- **One folder per campaign, files named after it** (0.2.0): the owner wants one post to hold a launch's images and reel, and files that say what they are once downloaded (`launch-square.mp4`, not `square.mp4`). Rejected: a `pieces` map of several templates per post (more config than a `both` template with a `mode`).
- **Every post renders every size** (images 1:1 + 16:9, reels also 9:16). The cost is layout, not rendering; review is one contact sheet.
- **An npm package, not a repo to clone**; the skill installs through `npx skills` (vercel-labs/skills). No postinstall (pnpm 10 blocks it; writing into `.claude/` unasked is rude).
- **Users own their templates**; the kit ships the engine and a starter or two. A project template named like a starter replaces it; `eject` copies one.
- **Plain stills never touch Remotion**, so images are licence-free for everyone. **Reel templates may import Remotion directly** (rejected: kit wrappers around Remotion's components). Remotion is an optional peer: free for individuals and companies of up to 3 people, otherwise a company licence. Re-read its licence when Remotion 5 ships (it says the terms change slightly).
- **Client templates are bundled stills through Remotion** (rejected: requiring the project's dev server, and rewriting templates as static HTML).
- **Python steps are optional** (`music analyze`, `voice`), in one shared uv venv at `~/.cache/perxel-social-kit/venv` (or `SOCIAL_KIT_PYTHON`). Kokoro needs Python 3.12 and `transformers>=4.45`.
- **Web presets are Perxel's numbers** (`encode/web.ts`): WebP at most 1600 px wide, quality 82; MP4 at most 1120 px, crf 34, silent, faststart. They mirror `perxel-web-2026/scripts/lib/media.mjs` (`optimize:videos`): change both together.

## Gotchas (each cost a retry)

- **TypeScript 7 in a project** breaks Remotion's esbuild loader reading `tsconfig.json`, so JSX fell back to `React.createElement` ("React is not defined"). The kit forces `jsx: "automatic"` on the loader (`leaveRootUrls` in `render/reel.ts`).
- **css-loader bundles `url(/x.svg)`** from the project's CSS and fails; the kit filters root URLs out (they're served from `bundle.root`).
- **Remotion's server follows folder symlinks but not a symlinked file**: `serveRoot` links the web root's folders into the bundle and copies its top-level files.
- **`staticFile()` throws on paths starting `public/`**: the generated entry builds asset URLs from `window.remotion_staticBase` itself.
- **Remotion mounts frames hidden first**: a canvas sized in `useEffect` can read 0 height. Draw once the element has a size (ResizeObserver).
- **Fonts**: the wrapper loads the brand fonts with `FontFace` and holds the frame (`delayRender`); a framework's own setup (next/font variables, `antialiased` on `<html>`) has to be repeated in the bundle CSS. Missing `antialiased` makes white-on-blue text visibly heavier.
- **A colon in the skill's `description`** broke its YAML frontmatter and `skills add` found nothing: keep the description quoted.
- **Remotion downloads its own Chrome Headless Shell** into each project's `node_modules/.remotion` (about 170 MB, 570 MB with caches in perxel-web-2026). Left as is: pointing it at puppeteer's cache would pin Remotion to a Chrome it was not tested with.
- **Screencast frames are 1x CSS pixels** whatever the device scale factor; zooming footage later pixelates it.
- ffmpeg here has no `drawtext`: the contact sheet is an HTML page through the still renderer.

## Releasing

- Never bump the version by hand. `gh release create v0.1.2 --generate-notes` runs `.github/workflows/publish.yml` (`phucbm/publish-npm-action@v1`, as in phucbm/claskit): version from the tag, `pnpm build`, npm trusted publishing (OIDC, with provenance), and commits `package.json` back to main (`output-dir: package.json`, so `dist/` stays out of git). Pull afterwards.
- npm settings: trusted publisher GitHub Actions `perxel` / `perxel-social-kit` / `publish.yml` with **`npm publish` allowed** (npm's default is staged publishing only: the workflow then *stages* the version, fails with 403 "OIDC permission denied for this action", and a rerun hits 409 until the staged version is approved or rejected: `npx npm@latest stage list | approve <id> | reject <id>`). Publishing access: 2FA required, bypass tokens disallowed. `publishConfig.access: public` is needed (a scoped package is private by default: 402).
- History: 0.1.0 published by hand with an OTP (trusted publishing can only be set up on an existing package), 0.1.1 through the workflow. `0.0.0-stage` in the version list is npm's staging placeholder.
- After a release: `pnpm update @perxel/social-kit` and `npx skills update` in perxel-web-2026.

## Checking a change

There are no tests, so run it:
- **Images:** `pnpm example render 2026-01-01-hello` and read `examples/social/posts/*/out/*-sheet.png`.
- **Reels:** `pnpm example render 2026-01-02-hello-reel` (kit devDependencies include Remotion).
- **On a real project:** perxel-web-2026 (`../perxel-web-2026`, `pnpm social …`, `pnpm visuals …`). Its `social/templates/` has bundled templates (devices, pairing with a Lottie still, whale, bars, flow, code, gallery) and a Remotion reel (`lottie-reel`, footage in `social/assets/footage/lottie/`; media under its `social/` is in Git LFS). To test an unreleased build there, point its script at this checkout temporarily (`node ../perxel-social-kit/dist/cli/index.js`), never commit that.
- **A fresh install:** `pnpm pack`, then in an empty folder with a `package.json`: `SOCIAL_KIT_INSTALL=<tgz> SOCIAL_KIT_SKILL_SOURCE=<this checkout> npx --package=<tgz> social-kit init --agent claude-code`.
- **The skill:** `npx skills add <this checkout> --skill social-kit -a claude-code -y --copy` in a scratch repo.

## Not built yet / ideas

- Tests (the template contract, beat grid, recipe runner paths) and a CI check on push.
- `social-kit capture|record <url>` ad hoc, without a recipe.
- More starters (pairing, quote, stat, cover) with a neutral sample brand; a starter reel that needs no Remotion import beyond `frame`.
- Batching composes (each bundled compose bundles separately, about 10 s each).
- The kit could add music and voice ducking itself, so simple reels need no Remotion import.
- A Remotion-free reel renderer (Chrome under a virtual clock, frames to ffmpeg); a JS beat analysis instead of librosa.
- `skills experimental_sync` (from node_modules) once it is stable, so the skill updates with the package.

## Style

TypeScript, ESM with `.js` import suffixes, 4-space indent, no semicolons, double quotes, `{a, b}` imports without inner spaces. Comments say why, in plain sentences. Keep `src/index.ts` and everything it imports free of Node modules (templates and reels bundle it). Copy in the README and the skill: plain English, no hype words, no em dashes.
