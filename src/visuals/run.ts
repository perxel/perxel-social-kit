// The recipe runner: `social-kit visuals build | status | inventory`. Captures and records live
// pages (headful Chrome), composes from the kit's templates, encodes with the web presets.
import {copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync} from "node:fs"
import {basename, dirname, join, relative, resolve} from "node:path"
import type {Browser} from "puppeteer-core"
import {sizeOf, type Project} from "../project.js"
import {renderPostTo} from "../render/still.js"
import {DEVICES, launchLive, openPage, pointTo, preparePage, runStep, sleep, wander} from "../capture/browser.js"
import {assertTools, encodeVideo, encodeWebp, extractFrame} from "../encode/web.js"
import type {CaptureVisual, ComposeVisual, ProvideVisual, RecordVisual, Visual, VisualRecipe, VisualsConfig} from "./types.js"

const PROVIDED = {image: ["png", "jpg", "jpeg", "webp"], video: ["mov", "mp4", "webm"]}

interface Loaded {
    recipe: VisualRecipe
    /** Its file name without extension. */
    name: string
    file: string
}

export class Visuals {
    readonly config: VisualsConfig
    constructor(readonly project: Project) {
        const config = project.config.visuals
        if (!config) throw new Error("No `visuals` in social.config.ts (recipes, output, cache, publicRoot)")
        this.config = config
    }

    private at = (path: string) => resolve(this.project.social, path)
    private devices = () => ({...DEVICES, ...this.config.devices})

    /** A recipe by file name (`perxel-website`) or `<folder>/<name>`, searched one level deep. */
    async load(ref: string): Promise<Loaded> {
        const root = this.at(this.config.recipes)
        const name = basename(ref).replace(/\.[jt]s$/, "")
        const dirs = ref.includes("/") ? [join(root, dirname(ref))] : [root, ...readdirSync(root, {withFileTypes: true}).filter((e) => e.isDirectory()).map((e) => join(root, e.name))]
        const file = dirs.map((d) => join(d, `${name}.ts`)).find(existsSync)
        if (!file) throw new Error(`No recipe ${ref} in ${relative(process.cwd(), root)}`)
        const recipe = await this.project.jiti.import<VisualRecipe>(file, {default: true})
        if (!Array.isArray(recipe?.visuals)) throw new Error(`${file} exports no { visuals: [...] }`)
        return {recipe, name, file}
    }

    cacheDir = (r: VisualRecipe) => this.at(this.config.cache(r))
    cacheFile = (r: VisualRecipe, v: Visual, ext: string) => join(this.cacheDir(r), `${v.id}.${ext}`)
    outBase = (r: VisualRecipe, v: Visual) => this.at(this.config.output(r, v))
    url = (file: string) => "/" + relative(this.at(this.config.publicRoot), file).split("\\").join("/")

    isVideo = (v: Visual) => v.kind === "record" || (v.kind === "provide" && v.media === "video")

    /** What a visual publishes (nothing for intermediates and reuse). */
    outputs(r: VisualRecipe, v: Visual) {
        if (v.intermediate || v.kind === "reuse") return []
        const base = this.outBase(r, v)
        return this.isVideo(v) ? [`${base}.mp4`, `${base}.webp`] : [`${base}.webp`]
    }

    providedRaw = (r: VisualRecipe, v: ProvideVisual) => PROVIDED[v.media ?? "image"].map((ext) => this.cacheFile(r, v, ext)).find(existsSync)
    dropHint = (r: VisualRecipe, v: ProvideVisual) => `drop the ${v.media ?? "image"} at ${relative(process.cwd(), this.cacheDir(r))}/${v.id}.(${PROVIDED[v.media ?? "image"].join("|")})`

    // --- making each kind --------------------------------------------------------------------

    async capture(browser: Browser, r: VisualRecipe, v: CaptureVisual, origin: string) {
        const page = await openPage(browser, this.devices(), v)
        await preparePage(page, new URL(v.url, origin).href, {scroll: v.scroll, settle: v.settle ?? 6})
        for (const step of v.steps ?? []) await runStep(page, step)
        if (v.pointer) {
            await pointTo(page, v.pointer)
            await sleep(1)
        }
        const raw = this.cacheFile(r, v, "png") as `${string}.png`
        if (v.selector) {
            const el = await page.$(v.selector)
            if (!el) throw new Error(`No element for ${v.selector}`)
            await el.screenshot({path: raw})
        } else await page.screenshot({path: raw})
        await page.close()
        if (!v.intermediate) encodeWebp(raw, `${this.outBase(r, v)}.webp`)
    }

    async record(browser: Browser, r: VisualRecipe, v: RecordVisual, origin: string) {
        const fps = v.fps ?? 30
        const page = await openPage(browser, this.devices(), {...v, scale: 1})
        if (v.cpu) await (await page.createCDPSession()).send("Emulation.setCPUThrottlingRate", {rate: v.cpu})
        const stopWander = v.pointer === "wander" ? wander(page) : null
        const url = new URL(v.url, origin).href
        const webm = this.cacheFile(r, v, "webm") as `${string}.webm`
        let recorder
        if (v.fromLoad) {
            // A fresh load (no cache from earlier captures), recorded from the first HTML on screen:
            // the blank frames before it vary per run, so they are skipped rather than trimmed.
            await page.setCacheEnabled(false)
            const loaded = page.goto(url, {waitUntil: "load", timeout: 60000})
            await page.waitForSelector("body > *", {timeout: 60000})
            recorder = await page.screencast({path: webm, fps})
            await loaded
        } else {
            await preparePage(page, url, {scroll: v.scroll, settle: v.settle ?? 3})
            recorder = await page.screencast({path: webm, fps})
        }
        for (const step of v.steps) await runStep(page, step)
        await recorder.stop()
        await stopWander?.()
        await page.close()
        if (!v.intermediate) this.publishVideo(r, v, webm, fps)
    }

    /** The MP4 and its poster (same name, .webp) at `poster` seconds. */
    publishVideo(r: VisualRecipe, v: RecordVisual | ProvideVisual, input: string, fps = 30) {
        const mp4 = `${this.outBase(r, v)}.mp4`
        encodeVideo(input, mp4, {fps, from: v.trim?.[0], to: v.trim?.[1]})
        const frame = this.cacheFile(r, v, "png")
        extractFrame(mp4, frame, v.poster ?? 0)
        encodeWebp(frame, `${this.outBase(r, v)}.webp`)
    }

    async compose(loaded: Loaded, v: ComposeVisual) {
        const r = loaded.recipe
        const size = sizeOf(this.project, v.size)
        const resolveProp = (value: unknown): unknown => {
            if (typeof value === "string" && value.startsWith("@")) {
                const dep = r.visuals.find((d) => d.id === value.slice(1))
                if (!dep) throw new Error(`${v.id}: no visual ${value} in the recipe`)
                const file = this.cacheFile(r, dep, "png")
                if (!existsSync(file)) throw new Error(`${v.id}: ${value} is not made yet; build it first`)
                // A path from the project root: templates turn it into a URL with `asset()`.
                return relative(this.project.root, file).split("\\").join("/")
            }
            if (Array.isArray(value)) return value.map(resolveProp)
            if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, resolveProp(x)]))
            return value
        }
        const tmp = join(this.project.social, ".kit", "compose", v.id)
        rmSync(tmp, {recursive: true, force: true})
        const [png] = await renderPostTo(this.project, {template: v.template, props: resolveProp(v.props) as Record<string, unknown>, scale: v.scale ?? 2}, {
            dir: this.cacheDir(r), ref: `${loaded.name}-${v.id}`, formats: [v.size], outDir: tmp, inMemory: true, log: () => {},
        })
        const raw = this.cacheFile(r, v, "png")
        copyFileSync(png, raw)
        rmSync(tmp, {recursive: true, force: true})
        if (!v.intermediate) encodeWebp(raw, `${this.outBase(r, v)}.webp`, {width: size.width})
    }

    provide(r: VisualRecipe, v: ProvideVisual) {
        const raw = this.providedRaw(r, v)
        if (raw) {
            if (this.isVideo(v)) this.publishVideo(r, v, raw)
            // An intermediate stays in the cache, as the input of a compose.
            else if (!v.intermediate) encodeWebp(raw, `${this.outBase(r, v)}.webp`)
            return "encoded"
        }
        if (this.outputs(r, v).every(existsSync)) return "done"
        return `waiting: ${this.dropHint(r, v)}\n      ${v.ask}`
    }

    // --- commands ----------------------------------------------------------------------------

    async build(ref: string, ids: string[], {origin}: {origin?: string} = {}) {
        const loaded = await this.load(ref)
        const r = loaded.recipe
        const site = origin ?? this.config.origin
        const chosen = ids.length ? r.visuals.filter((v) => ids.includes(v.id)) : r.visuals
        if (ids.length && chosen.length !== ids.length) throw new Error(`Unknown id. Known: ${r.visuals.map((v) => v.id).join(", ")}`)
        assertTools("ffmpeg", "magick")
        mkdirSync(this.cacheDir(r), {recursive: true})
        for (const v of chosen) for (const f of this.outputs(r, v)) mkdirSync(dirname(f), {recursive: true})

        const live = chosen.filter((v): v is CaptureVisual | RecordVisual => v.kind === "capture" || v.kind === "record")
        if (live.length) {
            if (!site) throw new Error("No site to capture: set `visuals.origin` or pass --origin=<url>")
            const browser = await launchLive()
            for (const v of live) {
                process.stdout.write(`${v.kind} ${v.id} ... `)
                await (v.kind === "capture" ? this.capture(browser, r, v, site) : this.record(browser, r, v, site))
                    .then(() => console.log("ok"), (e) => console.log(`FAILED ${e instanceof Error ? e.message : e}`))
            }
            await browser.close()
        }
        for (const v of chosen.filter((v): v is ComposeVisual => v.kind === "compose")) {
            process.stdout.write(`compose ${v.id} ... `)
            await this.compose(loaded, v).then(() => console.log("ok"), (e) => console.log(`FAILED ${e instanceof Error ? e.message : e}`))
        }
        for (const v of chosen.filter((v): v is ProvideVisual => v.kind === "provide")) console.log(`provide ${v.id} ... ${this.provide(r, v)}`)
        const root = this.at(this.config.publicRoot)
        for (const v of chosen) if (v.kind === "reuse") console.log(`reuse ${v.id} ... ${existsSync(join(root, v.src)) ? "ok" : `MISSING ${v.src}`}`)
    }

    async status(ref: string) {
        const {recipe: r, name} = await this.load(ref)
        const files = (this.config.placedIn?.(r) ?? []).map((f) => this.at(f)).filter(existsSync)
        const texts = files.map((f) => [f, readFileSync(f, "utf8")] as const)
        const label = (f: string) => relative(process.cwd(), f)
        console.log(`${name}: ${r.visuals.length} visuals; placed in: ${files.map(label).join(", ") || "no files"}\n`)
        for (const v of r.visuals) {
            const outs = v.kind === "reuse" ? [join(this.at(this.config.publicRoot), v.src)] : this.outputs(r, v)
            const made = v.intermediate ? existsSync(this.cacheFile(r, v, "png")) : outs.every(existsSync)
            const url = v.kind === "reuse" ? v.src : v.intermediate ? null : this.url(`${this.outBase(r, v)}.${this.isVideo(v) ? "mp4" : "webp"}`)
            const placed = url ? texts.filter(([, t]) => t.includes(url)).map(([f]) => label(f)) : []
            const state = v.intermediate ? (made ? "cached" : "not made") : `${made ? "made" : "NOT MADE"}, ${placed.length ? `placed (${placed.join(", ")})` : "not placed"}`
            console.log(`- ${v.id} [${v.kind}${v.intermediate ? ", input" : ""}] ${state}\n    ${v.note}${url ? `\n    ${url}` : ""}`)
            if (v.kind === "provide" && !made) console.log(`    ASK: ${v.ask}\n    ${this.dropHint(r, v)}`)
        }
    }

    /** Every media file under the inventory folders, with the source files that use it. */
    inventory(folder?: string) {
        const inv = this.config.inventory
        if (!inv) throw new Error("No `visuals.inventory` in social.config.ts")
        const walk = (dir: string): string[] => readdirSync(dir, {withFileTypes: true}).flatMap((e) => e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)])
        const sources = inv.sources.map((d) => this.at(d)).filter(existsSync).flatMap(walk).filter((f) => /\.(mdx|tsx?)$/.test(f))
        const texts = sources.map((f) => [f, readFileSync(f, "utf8")] as const)
        const altOf = (text: string, url: string) => text.match(new RegExp(`!\\[([^\\]]*)\\]\\(${url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\)`))?.[1]
        // A folder name narrows it to that subfolder of the inventory folders (`insights`).
        const folders = inv.folders.map((f) => this.at(f)).flatMap((f) => folder ? [join(f, folder)] : [f])
        for (const dir of folders.filter(existsSync)) {
            console.log(`\n${relative(process.cwd(), dir)}/`)
            for (const file of walk(dir).filter((f) => !f.endsWith(".DS_Store")).sort()) {
                const url = this.url(file)
                const users = texts.filter(([, t]) => t.includes(url))
                const alt = users.map(([, t]) => altOf(t, url)).find(Boolean)
                const kb = Math.round(statSync(file).size / 1024)
                console.log(`  ${url} (${kb} KB) ${users.length ? users.map(([f]) => relative(process.cwd(), f)).join(", ") : "UNUSED"}${alt ? `\n    alt: ${alt}` : ""}`)
            }
        }
    }
}
