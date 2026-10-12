import type {ReactElement} from "react"
import type {VisualsConfig} from "./visuals/types.js"

/** A named output size. The three built in are `square` (1:1), `landscape` (16:9) and `portrait` (9:16). */
export type Format = "square" | "landscape" | "portrait" | (string & {})

export interface Size {
    width: number
    height: number
}

export interface FontFace {
    family: string
    /** Path to the font file, relative to `social/`. */
    src: string
    weight?: string
    style?: string
}

export interface Brand {
    name?: string
    /** Shown in footers by the starter templates, e.g. `perxel.com`. */
    url?: string
    /** Logo for dark backgrounds and for light ones, paths relative to `social/`. */
    logo?: {light?: string; dark?: string}
    /** Free-form. Starters read `primary`, `deep` and `ink`. */
    colors?: Record<string, string>
    /** Loaded on every page the kit serves. */
    fonts?: FontFace[]
    /** Font families for headings and body text. */
    display?: string
    body?: string
}

export interface SocialConfig {
    brand?: Brand
    /** Extra or changed sizes, merged over the built-in ones. */
    formats?: Record<string, Size>
    /** Formats a post renders when it names none. */
    defaults?: {still?: Format[]; reel?: Format[]}
    /** Stylesheets (relative to `social/`) added to every page the kit serves. */
    css?: string[]
    /** Visual recipes for a site's pages and posts (`social-kit visuals`). */
    visuals?: VisualsConfig
    /**
     * Bundled pages (reels, and stills of templates with `meta.bundle`): built with Remotion's
     * webpack, so templates can be client components (effects, canvas, the project's CSS framework).
     */
    bundle?: {
        /** Stylesheets imported into the bundle (relative to `social/`), e.g. the project's global CSS. */
        css?: string[]
        /** Tailwind CSS v4 in `css` (needs `@remotion/tailwind-v4`). */
        tailwind?: boolean
        /** Import aliases, paths relative to `social/`: `{"@": ".."}`. A key ending in `$` matches exactly. */
        alias?: Record<string, string>
        /** The folder served at `/` (relative to `social/`), for root URLs like `/logo.svg`: a web app's `public/`. */
        root?: string
    }
}

/** The brand as templates receive it: every path turned into a URL the page can load. */
export interface ResolvedBrand extends Omit<Brand, "fonts"> {
    fonts: FontFace[]
}

export interface TemplateProps<P = Record<string, unknown>> {
    width: number
    height: number
    format: Format
    /**
     * What is being rendered: a still image or a reel. A template of kind `both` draws a different
     * picture for each (and only touches Remotion in a reel: stills render without it).
     */
    mode: "still" | "reel"
    /** 0 for a still. */
    frame: number
    fps: number
    props: P
    brand: ResolvedBrand
    /**
     * A URL for a file in the project, from a path relative to the project root
     * (`asset("social/assets/footage/home.mp4")`). Works in stills and reels alike.
     */
    asset: (path: string) => string
    /** Reels: the post's voice-over lines made by `social-kit voice make`, each a path for `asset()` and its length. */
    voice?: Record<string, {src: string; seconds: number}>
}

export interface TemplateMeta<P = Record<string, unknown>> {
    name: string
    description?: string
    formats?: Format[]
    kind?: "still" | "reel" | "both"
    /** Props written into a new post by `social-kit new`. */
    example?: P
    /**
     * Stills: render through the bundle (Remotion, `config.bundle`) instead of as static HTML, for
     * templates that need client-side code. Waits for `data-pending` and fails on `data-error` alike.
     */
    bundle?: boolean
    /** Reels: frames per second, 30 by default. */
    fps?: number
    /** Reels: length in seconds, or worked out from the post's props. A post's `duration` wins. */
    duration?: number | ((props: P) => number)
}

export interface TemplateModule<P = Record<string, unknown>> {
    meta: TemplateMeta<P>
    default: (props: TemplateProps<P>) => ReactElement
}

export interface Post<P = Record<string, unknown>> {
    /** A template in `social/templates/` or a kit starter. Ignored when `url` is set. */
    template?: string
    props?: P
    /**
     * Formats to render; the config's `defaults.still` when left out (`defaults.reel` for a reel
     * template, or a `both` template with `reel: true`).
     */
    formats?: Format[]
    /**
     * Names the files in `out/`: `<name>-<format>.png`, `<name>-<format>.mp4`, `<name>-sheet.png`.
     * The folder name without its date when left out (`2026-10-12-launch` → `launch`).
     */
    name?: string
    /**
     * URL mode: screenshot a page the project serves itself. `{format}`, `{width}` and `{height}`
     * are filled in per format.
     */
    url?: string
    /** Device pixel ratio, 1 by default. */
    scale?: number
    /**
     * For a template of kind `both`. `true`: render it as a reel instead of stills (in `formats`).
     * An object: render the stills (in `formats`) and the reel too, in its own formats
     * (`defaults.reel` when left out).
     */
    reel?: boolean | {formats?: Format[]}
    /** Reels: length in seconds, overriding the template's. */
    duration?: number
    /** Reels: H.264 quality, lower is better (18 by default). */
    crf?: number
    /** Reels: voice-over lines for `social-kit voice make` (Kokoro, optional). */
    voice?: {
        /** Kokoro voice, `am_michael` by default (`af_heart` is a female one). */
        voice?: string
        /** Kokoro language code, `a` (American English) by default. */
        lang?: string
        speed?: number
        /** Key → what to say. The key names the file and the template's `voice[key]`. */
        lines: Record<string, string>
    }
}

export const defineConfig = (config: SocialConfig) => config
export const definePost = <P = Record<string, unknown>>(post: Post<P>) => post
