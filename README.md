# @perxel/social-kit

One post, every size. Render social images from React templates your project owns: 1:1, 16:9 and 9:16 from one `post.ts`.

Status: early, unpublished (plan 017 in perxel-web-2026). Images work; reels, `init`, the agent skill and capture/record come next.

## Use

```sh
social-kit new launch-day --template announcement   # social/posts/<date>-launch-day/post.ts
social-kit render <post>                            # out/square.png, landscape.png, ... + out/sheet.png
social-kit render <post> --only square
social-kit templates | eject <name> | sheet <post> | doctor
```

## Project layout

```
social/
  social.config.ts     brand (colours, fonts, logo), default formats, extra sizes
  templates/           your templates (.tsx); one named like a starter replaces it
  assets/              logos, music, ...
  posts/<date>-<topic>/
    post.ts            template + props (or a url), formats
    out/               rendered files (gitignore it or not, your call)
```

## Templates

A template is a React component rendered on the server (no bundler, no client JS) and screenshotted by headless Chrome at each size:

```tsx
import type {TemplateMeta, TemplateProps} from "@perxel/social-kit"
export const meta: TemplateMeta = {name: "quote", formats: ["square", "landscape", "portrait"], kind: "still"}
export default function Quote({width, height, format, props, brand}: TemplateProps<{text: string}>) { ... }
```

- Lay out per `format`. `frame` is 0 for a still.
- Asset URLs are paths from the project root (`/social/assets/logos/x.svg`); the kit serves the project's files.
- Mark anything still loading with `data-pending`, bad props with `data-error="message"`.

**URL mode**: a post with `url` (`{format}`, `{width}`, `{height}` filled in) screenshots a page your own dev server serves, for templates that need your app's CSS, aliases or client code.

## Needs

Node 22+, React 19 in the project, Chrome for Testing (`npx @puppeteer/browsers install chrome@stable`, or `CHROME_PATH`). `social-kit doctor` checks.

## Licence

MIT.
