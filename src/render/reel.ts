// Bundled pages: the template wrapped in a Remotion composition per format, bundled once with
// webpack. Reels render to MP4; stills of templates with `meta.bundle` (client components) render
// frame 0 to PNG. Remotion is an optional peer: the project installs it (`remotion`,
// `@remotion/bundler`, `@remotion/renderer`) and its licence applies (free for individuals and
// companies of up to 3 people, see remotion.dev/license). Plain stills never load it.
import {execFileSync} from "node:child_process"
import {copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, symlinkSync, writeFileSync} from "node:fs"
import {dirname, join, relative, resolve} from "node:path"
import {pathToFileURL} from "node:url"
import {KIT_ROOT, loadTemplate, sizeOf, urlFor, type Project} from "../project.js"
import type {Format, Post} from "../types.js"
import {voiceFor} from "../audio/voice.js"

const REMOTION_HINT = "Reels and bundled templates need Remotion in the project: pnpm add -D remotion @remotion/bundler @remotion/renderer " +
    "(free for individuals and companies of up to 3 people; larger ones need a Remotion company licence, remotion.dev/license)"

async function importFrom<T>(project: Project, id: string, hint = REMOTION_HINT): Promise<T> {
    let path: string
    try { path = project.require.resolve(id) } catch { throw new Error(hint) }
    const mod = await import(pathToFileURL(path).href)
    return (mod.default && !("bundle" in mod) && !("renderMedia" in mod) && !("enableTailwind" in mod) ? mod.default : mod) as T
}

/** The folder of an installed package, so the bundle uses the project's single copy. */
function packageDir(project: Project, id: string) {
    try { return dirname(project.require.resolve(`${id}/package.json`)) } catch { return undefined }
}

/** Composition ids allow letters, digits and dashes only. */
const compId = (format: Format) => format.replace(/[^a-zA-Z0-9-]/g, "-")

export interface ReelOptions {
    formats: Format[]
    ref: string
    log: (line: string) => void
    /** One frame, no length needed: a bundled still. */
    still?: boolean
}

/** Bundles the post once: one composition per format. */
async function prepareReel(project: Project, dir: string, post: Post, {formats, ref, log, still}: ReelOptions) {
    const template = await loadTemplate(project, post.template!)
    const props = post.props ?? {}
    const fps = still ? 30 : template.meta.fps ?? 30
    const seconds = still ? 1 / fps : post.duration ?? (typeof template.meta.duration === "function" ? template.meta.duration(props) : template.meta.duration)
    if (!seconds) throw new Error(`${ref}: the reel has no length (set \`duration\` on the post or the template's meta)`)

    const {bundle} = await importFrom<typeof import("@remotion/bundler")>(project, "@remotion/bundler")
    const renderer = await importFrom<typeof import("@remotion/renderer")>(project, "@remotion/renderer")

    // The entry lives in the project so `remotion` and React resolve to the project's copies.
    const work = join(project.social, ".kit")
    mkdirSync(work, {recursive: true})
    writeFileSync(join(work, ".gitignore"), "*\n")
    const entry = join(work, `reel-${ref.replace(/[^a-zA-Z0-9-]/g, "-")}.tsx`)
    const bundleConfig = project.config.bundle ?? {}
    const fromWork = (file: string) => {
        const rel = relative(work, file).split("\\").join("/")
        return rel.startsWith(".") ? rel : "./" + rel
    }
    const spec = {
        still: !!still,
        imports: (bundleConfig.css ?? []).map((p) => fromWork(resolve(project.social, p))),
        fps,
        durationInFrames: Math.max(1, Math.round(seconds * fps)),
        formats: formats.map((format) => ({id: compId(format), format, ...sizeOf(project, format)})),
        props,
        voice: voiceFor(project, dir),
        brand: project.brand,
        css: (project.config.css ?? []).map((p) => urlFor(project.root, join(project.social, p))),
    }
    writeFileSync(entry, reelEntry(fromWork(template.entry.file), spec))

    const alias: Record<string, string> = {"@perxel/social-kit$": join(KIT_ROOT, "dist/index.js")}
    for (const id of ["react", "react-dom", "remotion"]) {
        const path = packageDir(project, id)
        if (path) alias[id] = path
    }
    // The project's own aliases first, so an exact one (`x$`) wins over a prefix (`@`).
    const own = Object.fromEntries(Object.entries(bundleConfig.alias ?? {}).map(([key, path]) => [key, resolve(project.social, path)]))
    const tailwind = bundleConfig.tailwind
        ? (await importFrom<typeof import("@remotion/tailwind-v4")>(project, "@remotion/tailwind-v4", "Tailwind in bundles needs @remotion/tailwind-v4: pnpm add -D @remotion/tailwind-v4")).enableTailwind
        : undefined
    log(`${ref}: bundling`)
    const serveUrl = await bundle({
        entryPoint: entry,
        // Files are served from the project root (as in stills); a symlink, not a copy.
        publicDir: project.root,
        symlinkPublicDir: true,
        webpackOverride: (config) => {
            const next = {
                ...config,
                resolve: {...config.resolve, alias: {...own, ...(config.resolve?.alias as Record<string, string>), ...alias}},
            }
            return leaveRootUrls(tailwind ? tailwind(next) : next)
        },
    })
    if (bundleConfig.root) serveRoot(serveUrl, resolve(project.social, bundleConfig.root))
    return {serveUrl, spec, seconds, renderer}
}

/** Loader fixes: css-loader leaves root URLs (`url(/x.svg)`) alone, served at render time from `bundle.root`; esbuild uses the automatic JSX runtime. */
function leaveRootUrls<C extends {module?: {rules?: unknown[]}}>(config: C): C {
    const visit = (use: unknown): unknown => {
        if (Array.isArray(use)) return use.map(visit)
        if (use && typeof use === "object" && "loader" in use && String((use as {loader: string}).loader).includes("css-loader")) {
            const entry = use as {loader: string; options?: Record<string, unknown>}
            return {...entry, options: {...entry.options, url: {filter: (url: string) => !url.startsWith("/")}}}
        }
        // Automatic JSX runtime, as in stills: esbuild only reads it from tsconfig.json, which
        // Remotion's loader can't parse under TypeScript 7.
        if (use && typeof use === "object" && "loader" in use && String((use as {loader: string}).loader).includes("esbuild-loader")) {
            const entry = use as {loader: string; options?: Record<string, unknown>}
            return {...entry, options: {...entry.options, jsx: "automatic"}}
        }
        if (typeof use === "string" && use.includes("css-loader")) return {loader: use, options: {url: {filter: (url: string) => !url.startsWith("/")}}}
        return use
    }
    const rules = config.module?.rules?.map((rule) => rule && typeof rule === "object" && "use" in rule ? {...rule, use: visit((rule as {use: unknown}).use)} : rule)
    return rules ? {...config, module: {...config.module, rules}} : config
}

/**
 * Makes root URLs (`/logo.svg`, `/images/a.webp`) work in the bundle: Remotion's server answers
 * any path under the bundle folder, so the web root's folders are linked into it and its few
 * top-level files copied (the server does not follow a link that is the file itself).
 */
function serveRoot(bundleDir: string, root: string) {
    if (!existsSync(root)) throw new Error(`bundle.root ${root} does not exist`)
    for (const name of readdirSync(root)) {
        const from = join(root, name), to = join(bundleDir, name)
        if (name.startsWith(".") || existsSync(to)) continue
        if (statSync(from).isDirectory()) symlinkSync(from, to)
        else copyFileSync(from, to)
    }
}

export async function renderReel(project: Project, dir: string, post: Post, options: ReelOptions) {
    const {serveUrl, spec, seconds, renderer: {selectComposition, renderMedia}} = await prepareReel(project, dir, post, options)
    const {ref, log} = options
    const out = join(dir, "out")
    mkdirSync(out, {recursive: true})
    const written: string[] = []
    for (const {id, format, width, height} of spec.formats) {
        const composition = await selectComposition({serveUrl, id})
        const file = join(out, `${format}.mp4`)
        let shown = -1
        await renderMedia({
            composition, serveUrl, codec: "h264", crf: post.crf ?? 18,
            imageFormat: "jpeg", jpegQuality: 92, outputLocation: file, overwrite: true,
            onProgress: ({progress}) => {
                const pct = Math.floor(progress * 10) * 10
                if (pct > shown) { shown = pct; process.stdout.write(`\r${ref} ${format}: ${pct}%`) }
            },
        })
        process.stdout.write("\n")
        written.push(file)
        log(`${relative(process.cwd(), file)}  ${width}×${height}  ${seconds.toFixed(1)} s`)
        const frames = framesStrip(file, join(out, `${format}.frames.jpg`), seconds, width >= height)
        if (frames) written.push(frames)
    }
    return written
}

/** Stills of a template with `meta.bundle`: frame 0 of each format's composition, as PNG. */
export async function renderBundledStill(project: Project, dir: string, post: Post, options: ReelOptions) {
    const {serveUrl, spec, renderer: {selectComposition, renderStill}} = await prepareReel(project, dir, post, {...options, still: true})
    const out = join(dir, "out")
    mkdirSync(out, {recursive: true})
    const written: string[] = []
    for (const {id, format, width, height} of spec.formats) {
        const composition = await selectComposition({serveUrl, id})
        const file = join(out, `${format}.png`)
        await renderStill({composition, serveUrl, frame: 0, output: file, imageFormat: "png", scale: post.scale ?? 1, overwrite: true})
        written.push(file)
        options.log(`${relative(process.cwd(), file)}  ${width}×${height}`)
    }
    return written
}

/**
 * Stills of a reel without rendering it: one frame per time in `at` (seconds), or twelve evenly
 * spaced, tiled into `out/<format>.preview.jpg` per format. For checking layouts before a render.
 */
export async function previewReel(project: Project, dir: string, post: Post, options: ReelOptions & {at?: number[]}) {
    const {serveUrl, spec, seconds, renderer: {selectComposition, renderStill}} = await prepareReel(project, dir, post, options)
    const at = options.at?.length ? options.at : Array.from({length: 12}, (_, i) => (i + 0.5) * seconds / 12)
    const out = join(dir, "out")
    const tmp = join(project.social, ".kit", "preview")
    rmSync(tmp, {recursive: true, force: true})
    mkdirSync(tmp, {recursive: true})
    mkdirSync(out, {recursive: true})
    const written: string[] = []
    for (const {id, format, width, height} of spec.formats) {
        const composition = await selectComposition({serveUrl, id})
        const scale = (width >= height ? 480 : 320) / width
        for (const [i, s] of at.entries()) {
            const frame = Math.min(spec.durationInFrames - 1, Math.max(0, Math.round(s * spec.fps)))
            await renderStill({composition, serveUrl, frame, output: join(tmp, `${format}-${String(i).padStart(3, "0")}.jpg`), imageFormat: "jpeg", jpegQuality: 85, scale, overwrite: true})
        }
        const cols = Math.min(at.length, width >= height ? 4 : 6)
        const rows = Math.ceil(at.length / cols)
        const file = join(out, `${format}.preview.jpg`)
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(tmp, `${format}-%03d.jpg`), "-vf",
            `tile=${cols}x${rows}:padding=8:color=white`, "-frames:v", "1", "-q:v", "3", file])
        written.push(file)
        options.log(`${relative(process.cwd(), file)}  ${at.map((s) => s.toFixed(2)).join(", ")} s`)
    }
    return written
}

/** Twelve frames of a reel in one image, for the contact sheet. Skipped without ffmpeg. */
function framesStrip(video: string, file: string, seconds: number, wide: boolean) {
    const [cols, rows, h] = wide ? [4, 3, 270] : [6, 2, 480]
    try {
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", video, "-vf",
            `fps=${(cols * rows) / seconds},scale=-2:${h},tile=${cols}x${rows}:padding=8:color=white`, "-frames:v", "1", "-q:v", "3", file])
        return file
    } catch {
        return undefined
    }
}

interface Spec {
    still: boolean
    imports: string[]
    fps: number
    durationInFrames: number
    formats: {id: string; format: Format; width: number; height: number}[]
    props: unknown
    voice?: Record<string, {src: string; seconds: number}>
    brand: Project["brand"]
    css: string[]
}

function reelEntry(templateImport: string, spec: Spec) {
    return `// Written by social-kit for one render; not for editing.
import {createElement, Fragment, useEffect, useState} from "react"
import {cancelRender, Composition, continueRender, delayRender, registerRoot, useCurrentFrame, useVideoConfig} from "remotion"
${spec.imports.map((p) => `import ${JSON.stringify(p)}`).join("\n")}
import * as template from ${JSON.stringify(templateImport)}

const SPEC = ${JSON.stringify(spec)}
const base = () => (typeof window !== "undefined" && (window as any).remotion_staticBase) || ""
// Files are served from the project root under Remotion's static base.
const url = (u?: string) => u && u.startsWith("/") ? base() + u : u
const asset = (path: string) => base() + "/" + path.replace(/^\\/+/, "").split("/").map(encodeURIComponent).join("/")
const brand = () => ({
    ...SPEC.brand,
    logo: SPEC.brand.logo && {light: url(SPEC.brand.logo.light), dark: url(SPEC.brand.logo.dark)},
    fonts: SPEC.brand.fonts.map((f: any) => ({...f, src: url(f.src)})),
})

if (typeof document !== "undefined") {
    const fonts = delayRender("social-kit: brand fonts")
    Promise.all(brand().fonts.map((f: any) => new FontFace(f.family, "url(" + JSON.stringify(f.src) + ")", {weight: f.weight ?? "100 900", style: f.style ?? "normal"})
        .load().then((face) => { document.fonts.add(face) })))
        .then(() => continueRender(fonts), (e) => { console.error(e); continueRender(fonts) })
    for (const href of SPEC.css) {
        const css = delayRender("social-kit: " + href)
        const link = document.createElement("link")
        link.rel = "stylesheet"
        link.href = url(href)!
        link.onload = link.onerror = () => continueRender(css)
        document.head.appendChild(link)
    }
}

/** Stills: hold the frame until nothing is marked data-pending; fail on data-error. */
function useReady() {
    const [handle] = useState(() => SPEC.still ? delayRender("social-kit: data-pending") : null)
    useEffect(() => {
        if (handle === null) return
        let raf = 0
        const check = () => {
            const error = document.querySelector("[data-error]")
            if (error) return cancelRender(new Error(error.getAttribute("data-error") || error.textContent || "data-error"))
            if (document.querySelector("[data-pending]")) { raf = requestAnimationFrame(check); return }
            // Two more frames, so whatever cleared data-pending has painted.
            raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => continueRender(handle)) })
        }
        raf = requestAnimationFrame(check)
        return () => cancelAnimationFrame(raf)
    }, [handle])
}

function Reel({format}: {format: string}) {
    useReady()
    const frame = useCurrentFrame()
    const {width, height, fps} = useVideoConfig()
    return createElement((template as any).default, {width, height, format, frame, fps, props: SPEC.props, voice: SPEC.voice, brand: brand(), asset})
}

registerRoot(() => createElement(Fragment, null, SPEC.formats.map((f: any) => createElement(Composition, {
    key: f.id, id: f.id, component: Reel as any, width: f.width, height: f.height,
    fps: SPEC.fps, durationInFrames: SPEC.durationInFrames, defaultProps: {format: f.format},
}))))
`
}
