---
name: social-kit
description: Make social media images and short videos (reels) in every size from React templates, with @perxel/social-kit. Use when the user asks for a social post image, a LinkedIn/Instagram/X/Facebook/TikTok graphic, a reel, a story, an announcement card, "the same post in other sizes", or mentions social-kit, `social/`, `social-kit render`, a post's contact sheet, or a beat-synced video.
---

# social-kit

One post, every size, from one source. A post is a folder with a `post.ts` that names a template and its props; `social-kit render` turns it into every format at once (images: square 1080×1080 and landscape 1920×1080; reels also portrait 1080×1920), plus a contact sheet to review them together.

Run it as `npx social-kit …` (or the project's script for it, e.g. `pnpm social …`). Everything lives in the project's `social/` folder:

```
social/
  social.config.ts        brand (colours, fonts, logo), extra formats, default formats
  templates/              the project's templates (.tsx); a file starting with _ is a helper, not a template
  assets/                 logos, music, footage (footage is usually gitignored)
  posts/<date>-<topic>/
    post.ts               template, props, formats
    out/                  square.png, landscape.png, portrait.mp4, sheet.png ...
```

## Before anything

1. `social-kit doctor`. It checks Chrome, ffmpeg, React, Remotion (reels only) and Python (optional). Fix what it marks MISS before going on, using the hint it prints.
2. Read `social/social.config.ts` and list the templates (`social-kit templates`), so you use the project's brand and templates rather than inventing new ones.
3. If the project has writing rules (a copywriting guide, a brand voice doc, a CLAUDE.md section), follow them for every word on the image. Do not add text the user did not ask for or approve: a tagline, a call to action, a hashtag. Suggest it instead.

## Make an image post

1. `social-kit new <topic> --template <name>` creates `social/posts/<today>-<topic>/post.ts` with the template's example props.
2. Fill in the props with the user's copy. Leave `formats` out to get the config's defaults, or list them (`["square", "landscape", "portrait"]`).
3. `social-kit render <post>`. It writes `out/<format>.png` for each format and `out/sheet.png`.
4. **Look at `out/sheet.png` yourself before showing it** (read the image). Check every format, not only the first: text that wraps badly or overflows, logos too small or touching the edge, anything in the portrait format's top 240 px or bottom 300 px (Stories, Reels and TikTok cover those with their own buttons), contrast. Fix and render again (`--only portrait` renders one format).
5. Report the files and which one goes where (LinkedIn and most feeds: square; X, YouTube, website: landscape; Stories, Reels, TikTok, Shorts: portrait).

## Templates

A template is a React component in `social/templates/<name>.tsx`:

```tsx
import type {TemplateMeta, TemplateProps} from "@perxel/social-kit"

interface Props {headline: string}

export const meta: TemplateMeta<Props> = {
    name: "quote",
    formats: ["square", "landscape", "portrait"],
    kind: "still",                          // "still" | "reel" | "both"
    example: {headline: "Hello"},           // written into new posts
}

export default function Quote({width, height, format, props, brand, asset}: TemplateProps<Props>) {
    return <div style={{width, height, background: brand.colors?.primary}}>{props.headline}</div>
}
```

- **Lay out per `format`**, not by scaling one layout: a table of sizes per format (padding, type size, logo size) is the usual pattern. The portrait format keeps important things clear of the top 240 and bottom 300 px.
- **Files:** `asset("social/assets/logos/x.svg")` (a path from the project root) gives a URL that works in images and reels. `brand.logo.light` / `brand.logo.dark` and `brand.fonts` come already resolved.
- **Images render on the server** (React to static HTML, then a Chrome screenshot): no hooks with effects, no client-side code runs. Inline styles or the stylesheets listed in the config's `css`.
- **Waiting and errors:** mark anything still loading with `data-pending` (the renderer waits until none is left); put `data-error="message"` on an element to fail the render with that message (for bad props).
- To change a kit starter, `social-kit eject <name>` copies it into `social/templates/`, where it replaces the starter.
- **URL mode:** a post with `url: "http://localhost:3000/og?format={format}"` (instead of `template`) screenshots a page the project serves itself, at each format's size (`{format}`, `{width}`, `{height}` are filled in). Use it when the design needs the project's own build (its CSS framework, path aliases, components).

## Reels

A reel template has `kind: "reel"`, `fps` (30 by default) and `duration` (seconds, or a function of the props). It renders through Remotion, so the project needs `remotion`, `@remotion/bundler` and `@remotion/renderer` (`doctor` says so). **Remotion's licence:** free for individuals and companies of up to 3 people; larger companies need a Remotion company licence (remotion.dev/license). Tell the user once if they may be over that.

- A reel template gets `frame` and `fps` and may also import Remotion directly (`OffthreadVideo` for footage, `Sequence`, `Audio`, `interpolate`, `spring`, `@remotion/lottie`). Every frame must render the same each time: no `Math.random()`, no clock; simulate physics up front; use a fixed-seed shuffle.
- **Music on the beat:** `social-kit music analyze social/assets/music/track.mp3` writes `track.beats.json` (tempo, beats, loudness per bar: the bars show where the build and the drop are). In the template:
  ```ts
  import {beatGrid} from "@perxel/social-kit"
  const grid = beatGrid({bpm: 92.29, firstBeat: 0.07, startBar: 1})
  grid.at(5, 2)      // seconds at bar 5, beat 3 (beats count from 0)
  grid.kick(t)       // 1 on each beat, decaying: a pulse
  <Audio src={asset("social/assets/music/track.mp3")} trimBefore={Math.round(grid.trackOffset * fps)}/>
  ```
  The analysis is a guess: if cuts feel early or late, check the beat spacing in the JSON and set `bpm`/`firstBeat` by hand.
- **Voice-over (optional):** add `voice: {voice: "am_michael", lines: {intro: "This is..."}}` to the post, run `social-kit voice setup` once (Python 3.12 + Kokoro via uv), then `social-kit voice make <post>`. Files land in `posts/<post>/voice/<key>.wav`, trimmed and at -14 LUFS; the template gets `voice[key].src` (for `asset()`) and `voice[key].seconds` (to duck the music under it, e.g. music at 0.7, 0.2 within 0.25 s of each line). Keep voice lines few and short.
- **Check before rendering:** `social-kit preview <post> --at 1.2,3.5,8` renders stills at those seconds for every format (`out/<format>.preview.jpg`) in about a minute; without `--at` it takes 12 spread over the reel. Look at them (pick one time per scene). A full render takes minutes.
- `social-kit render <post>` writes `out/<format>.mp4` and a 12-frame strip per format on the sheet. Check the length and that nothing clips (`ffmpeg -i out/landscape.mp4 -af volumedetect -f null -`: max under 0 dB).

### What makes a reel work

- Everything moves on the beat: cuts on bar lines or half bars, pops on beats, a small push-in when a cut lands, a slight pulse on each beat.
- Nothing holds the screen much longer than a bar (about 2 s at 120 BPM). A scene that means nothing gets less, not more.
- Designed scenes (cards, devices, grids, type) carry more than raw screen recordings; keep recordings for the moments that move.
- Plan beat by beat first (bar, picture, event on the beat, voice) and get it approved before building.
- Review your own cut against these rules before showing it; fix what fails.

## Don'ts

- Don't edit files in `out/`; change the post or template and render again.
- Don't put a project's brand files into the kit, or copy the kit's code into the project: templates and assets belong in `social/`.
- Don't render only the format the user named when the post declares more: render all, then point to the one they wanted.
