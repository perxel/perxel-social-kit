// Visual recipes: the images and short videos a page or post needs, written down so one command
// re-makes them when the site changes. Browser-safe types only (recipes import them).
import type {Format} from "../types.js"
import type {RecordStep, ScrollTarget} from "../capture/browser.js"

export type {RecordStep, ScrollTarget}

interface Base {
    /** Kebab-case; names the output file. */
    id: string
    /** What it shows and where it goes (for the plan and for review). */
    note: string
    /** Only an input for a composed visual: kept in the cache, never published. */
    intermediate?: boolean
}

interface LivePage {
    /** Path on the site (resolved against the origin) or a full URL. */
    url: string
    /** A device from the config's `visuals.devices` (desktop, tablet, phone by default). */
    device?: string
    /** Emulate `prefers-reduced-motion: reduce`. */
    reducedMotion?: boolean
    /** Scroll here before anything else, then wait `settle` seconds. */
    scroll?: ScrollTarget
    settle?: number
}

/** A screenshot of a live page. */
export interface CaptureVisual extends Base, LivePage {
    kind: "capture"
    /** Screenshot one element instead of the viewport. */
    selector?: string
    /** Pointer position (share of the viewport) during the shot. */
    pointer?: [number, number]
    /** Steps run before the shot (open a menu, type a query). */
    steps?: RecordStep[]
}

/** Shared by recorded and provided videos. */
interface VideoOutput {
    /** Second of the clip used as the poster. Default 0. */
    poster?: number
    /** Keep only `[from, to]` seconds of the source. */
    trim?: [number, number]
}

/** A short silent loop of a live page, for an inline autoplay video. */
export interface RecordVisual extends Base, LivePage, VideoOutput {
    kind: "record"
    steps: RecordStep[]
    /** `wander`: a slow loop over the lower half (keeps cursor effects alive). Default `still`. */
    pointer?: "wander" | "still"
    /** Record the load itself, from the first HTML on screen; `scroll` and `settle` are ignored. */
    fromLoad?: boolean
    /** CPU slowdown (Chrome's throttling rate, e.g. 4), so a fast sequence is visible. */
    cpu?: number
    fps?: number
}

/** A designed image from a template (`social/templates/` or a kit starter). */
export interface ComposeVisual extends Base {
    kind: "compose"
    template: string
    /** A format from the config (its size is the output size). */
    size: Format
    /** Template props. A string `@<id>` is the cached output of another visual in this recipe. */
    props: Record<string, unknown>
    /** Rendered at this pixel ratio, then downscaled to the format's width. Default 2. */
    scale?: number
}

/** Something only a person can capture (logins, dashboards, results that change per run). */
export interface ProvideVisual extends Base, VideoOutput {
    kind: "provide"
    /** Exactly what to capture, written for that person. */
    ask: string
    /** `video`: a screen recording, published like a recorded one. Default `image`. */
    media?: "image" | "video"
}

/** Already published, used as is (`src`: a path under the web root). */
export interface ReuseVisual extends Base {
    kind: "reuse"
    src: string
}

export type Visual = CaptureVisual | RecordVisual | ComposeVisual | ProvideVisual | ReuseVisual

/** Any fields the project's config uses to place outputs (a collection, a slug), plus the visuals. */
export interface VisualRecipe {
    visuals: Visual[]
    [key: string]: unknown
}

export interface VisualsConfig {
    /** Folder holding the recipe files (relative to `social/`), searched one level deep. */
    recipes: string
    /** Site that `capture` and `record` load by default (`--origin` overrides it). */
    origin?: string
    /** Output path of a published visual, without extension, relative to `social/`. */
    output: (recipe: VisualRecipe, visual: Visual) => string
    /** Raw captures and renders for a recipe (relative to `social/`; gitignore it). */
    cache: (recipe: VisualRecipe) => string
    /** The web root the outputs are served from (relative to `social/`), to turn an output into a URL. */
    publicRoot: string
    /** Files that should mention the visuals' URLs (`visuals status` reports where each is placed). */
    placedIn?: (recipe: VisualRecipe) => string[]
    /** Devices for capture and record, merged over desktop, tablet and phone. */
    devices?: Record<string, {width: number; height: number; scale: number; mobile: boolean}>
    /** `visuals inventory`: media folders under the web root and the source folders that use them (relative to `social/`). */
    inventory?: {folders: string[]; sources: string[]}
}

export const defineRecipe = (recipe: VisualRecipe) => recipe
