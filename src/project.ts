// Finds the project's social/ folder and loads its config, templates and posts.
import {existsSync, readdirSync} from "node:fs"
import {createRequire} from "node:module"
import {basename, dirname, join, relative, resolve, sep} from "node:path"
import {fileURLToPath} from "node:url"
import {createJiti, type Jiti} from "jiti"
import type {Format, Post, ResolvedBrand, Size, SocialConfig, TemplateModule} from "./types.js"

export const KIT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..")
export const KIT_TEMPLATES = join(KIT_ROOT, "templates")

export const BUILTIN_FORMATS: Record<string, Size> = {
    square: {width: 1080, height: 1080},
    landscape: {width: 1920, height: 1080},
    portrait: {width: 1080, height: 1920},
}

const TEMPLATE_EXT = [".tsx", ".jsx", ".ts", ".js"]

export interface Project {
    /** The folder holding `social/`; the kit's server serves files from here. */
    root: string
    social: string
    config: SocialConfig
    formats: Record<string, Size>
    brand: ResolvedBrand
    jiti: Jiti
    require: NodeJS.Require
}

/** Walks up from `from` to the first folder with a `social/` in it. */
export function findRoot(from = process.cwd()): string {
    let dir = resolve(from)
    while (true) {
        if (existsSync(join(dir, "social"))) return dir
        const up = dirname(dir)
        if (up === dir) throw new Error("No social/ folder here or above. Run `social-kit init` first.")
        dir = up
    }
}

export async function loadProject(from?: string): Promise<Project> {
    const root = findRoot(from)
    const social = join(root, "social")
    const req = createRequire(join(root, "package.json"))
    // Templates and the renderer must share the project's React, wherever the template file sits.
    const pick = (id: string) => { try { return req.resolve(id) } catch { return undefined } }
    const alias: Record<string, string> = {"@perxel/social-kit": join(KIT_ROOT, "dist/index.js")}
    for (const id of ["react", "react/jsx-runtime", "react/jsx-dev-runtime", "react-dom", "react-dom/server"]) {
        const path = pick(id)
        if (path) alias[id] = path
    }
    const make = (extra: Record<string, string> = {}) => createJiti(join(social, "_"), {
        jsx: {runtime: "automatic"},
        moduleCache: false,
        fsCache: false,
        alias: {...extra, ...alias},
    })
    const configFile = ["social.config.ts", "social.config.js", "social.config.mjs"].map((f) => join(social, f)).find(existsSync)
    const config: SocialConfig = configFile ? await make().import(configFile, {default: true}) : {}
    // The bundle's aliases also apply when Node reads a template (for its meta); `x$` (exact in
    // webpack) is a plain prefix here.
    const jiti = make(Object.fromEntries(Object.entries(config.bundle?.alias ?? {}).map(([key, path]) => [key.replace(/\$$/, ""), resolve(social, path)])))
    const brand = config.brand ?? {}
    const toUrl = (path: string) => urlFor(root, resolve(social, path))
    return {
        root,
        social,
        config,
        formats: {...BUILTIN_FORMATS, ...config.formats},
        brand: {
            ...brand,
            logo: brand.logo && {
                light: brand.logo.light && toUrl(brand.logo.light),
                dark: brand.logo.dark && toUrl(brand.logo.dark),
            },
            fonts: (brand.fonts ?? []).map((f) => ({...f, src: toUrl(f.src)})),
        },
        jiti,
        require: req,
    }
}

/** The URL the kit's server answers for a file under the project root. */
export function urlFor(root: string, file: string) {
    const rel = relative(root, file)
    if (rel.startsWith("..")) throw new Error(`${file} is outside the project (${root})`)
    return "/" + rel.split(sep).map(encodeURIComponent).join("/")
}

export interface TemplateEntry {
    name: string
    file: string
    source: "project" | "kit"
}

function templatesIn(dir: string, source: TemplateEntry["source"]): TemplateEntry[] {
    if (!existsSync(dir)) return []
    return readdirSync(dir)
        .filter((f) => TEMPLATE_EXT.some((e) => f.endsWith(e)) && !f.endsWith(".d.ts") && !f.startsWith("_"))
        .map((f) => ({name: f.replace(/\.[jt]sx?$/, ""), file: join(dir, f), source}))
}

/** Project templates first: one with a starter's name replaces the starter. */
export function listTemplates(project: Project): TemplateEntry[] {
    const own = templatesIn(join(project.social, "templates"), "project")
    const names = new Set(own.map((t) => t.name))
    return [...own, ...templatesIn(KIT_TEMPLATES, "kit").filter((t) => !names.has(t.name))]
}

export async function loadTemplate(project: Project, name: string): Promise<TemplateModule & {entry: TemplateEntry}> {
    const entry = listTemplates(project).find((t) => t.name === name)
    if (!entry) throw new Error(`No template "${name}". See \`social-kit templates\`.`)
    const mod = await project.jiti.import<TemplateModule>(entry.file)
    if (typeof mod.default !== "function") throw new Error(`${entry.file} has no default export`)
    return {...mod, meta: {...mod.meta, name: mod.meta?.name ?? name}, entry}
}

/** A post folder from a name (`2026-10-12-topic`), a path to it, or a path to its post.ts. */
export function resolvePostDir(project: Project, ref: string): string {
    const candidates = [resolve(ref), join(project.social, "posts", ref), join(project.social, "posts", basename(ref))]
    for (const c of candidates) {
        const dir = /\.[jt]s$/.test(c) ? dirname(c) : c
        if (postFile(dir)) return dir
    }
    throw new Error(`No post "${ref}" (looked for post.ts in social/posts/${ref}/)`)
}

export function postFile(dir: string) {
    return ["post.ts", "post.tsx", "post.js", "post.mjs"].map((f) => join(dir, f)).find(existsSync)
}

export async function loadPost(project: Project, dir: string): Promise<Post> {
    const file = postFile(dir)
    if (!file) throw new Error(`No post.ts in ${dir}`)
    return project.jiti.import<Post>(file, {default: true})
}

export function listPosts(project: Project): string[] {
    const dir = join(project.social, "posts")
    if (!existsSync(dir)) return []
    return readdirSync(dir).filter((d) => postFile(join(dir, d))).sort()
}

/** What a post renders: its still formats and its reel formats (either may be empty). */
export async function postPlan(project: Project, post: Post): Promise<{stills: Format[]; reel: Format[]}> {
    const stills = () => post.formats?.length ? post.formats : project.config.defaults?.still ?? ["square", "landscape"]
    const reels = (own?: Format[]) => own?.length ? own : project.config.defaults?.reel ?? ["square", "landscape", "portrait"]
    if (post.template && !post.url) {
        const {meta} = await loadTemplate(project, post.template)
        if (meta.kind === "reel" || (meta.kind === "both" && post.reel === true)) return {stills: [], reel: reels(post.formats)}
        if (meta.kind === "both" && typeof post.reel === "object") return {stills: stills(), reel: reels(post.reel.formats)}
    }
    return {stills: stills(), reel: []}
}

/** The name in a post's output files: `post.name`, else its folder name without the date. */
export function postName(dir: string, post: Post) {
    return post.name ?? basename(dir).replace(/^\d{4}-\d{2}-\d{2}-/, "")
}

/** `<name>-<format>.<ext>`, or `<format>.<ext>` with no name (posts held in memory). */
export const outFile = (name: string | undefined, format: string, ext: string) => `${name ? `${name}-` : ""}${format}.${ext}`

export function sizeOf(project: Project, format: Format): Size {
    const size = project.formats[format]
    if (!size) throw new Error(`Unknown format "${format}". Known: ${Object.keys(project.formats).join(", ")}`)
    return size
}
