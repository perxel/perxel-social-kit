// Still images: one screenshot per format, of the kit's own page for a template or of a URL the
// project serves (URL mode).
import {mkdirSync} from "node:fs"
import {join, relative} from "node:path"
import type {Browser} from "puppeteer-core"
import {loadPost, loadTemplate, outFile, postName, postPlan, sizeOf, type Project} from "../project.js"
import type {Format, Post} from "../types.js"
import {launch, waitReady} from "./chrome.js"
import {previewReel, renderBundledStill, renderReel} from "./reel.js"
import {startServer, type KitServer} from "./server.js"

export interface RenderOptions {
    only?: Format[]
    log?: (line: string) => void
}

/** Renders a post from disk into its `out/`: its stills, then its reel (a `both` template can have both). */
export async function renderPost(project: Project, dir: string, {only, log = console.log}: RenderOptions = {}) {
    const post = await loadPost(project, dir)
    const plan = await postPlan(project, post)
    const pick = (formats: Format[]) => only?.length ? formats.filter((f) => only.includes(f)) : formats
    const stills = pick(plan.stills), reel = pick(plan.reel)
    if (!stills.length && !reel.length) throw new Error(`Nothing to render: the post's formats don't include ${only?.join(", ")}`)
    const ref = relative(join(project.social, "posts"), dir)
    const target = {dir, ref, outDir: join(dir, "out"), name: postName(dir, post), log}
    const written: string[] = []
    if (stills.length) written.push(...await renderPostTo(project, post, {...target, formats: stills, mode: "still"}))
    if (reel.length) written.push(...await renderPostTo(project, post, {...target, formats: reel, mode: "reel"}))
    return written
}

export interface RenderTarget {
    /** The post's folder (voice files are read from it); any folder for a post held in memory. */
    dir: string
    /** Names the post in logs and on the kit's server. */
    ref: string
    formats: Format[]
    /** Files are written here as `<name>-<format>.png` / `.mp4` (`<format>.png` without a name). */
    outDir: string
    name?: string
    /** Still or reel; worked out from the template and the post when left out. */
    mode?: "still" | "reel"
    log?: (line: string) => void
    /** The post is not on disk: serve it from memory. */
    inMemory?: boolean
}

/** Renders a post object (from disk or built in memory) into `outDir`. */
export async function renderPostTo(project: Project, post: Post, {dir, ref, formats, outDir, name, mode, log = console.log, inMemory}: RenderTarget) {
    mkdirSync(outDir, {recursive: true})
    if (post.template && !post.url) {
        const {meta} = await loadTemplate(project, post.template)
        const reel = mode ? mode === "reel" : meta.kind === "reel" || (meta.kind === "both" && post.reel === true)
        if (reel) return renderReel(project, dir, post, {formats, ref, log, outDir, name})
        if (meta.bundle) return renderBundledStill(project, dir, post, {formats, ref, log, outDir, name})
    }
    let server: KitServer | undefined
    let browser: Browser | undefined
    const written: string[] = []
    try {
        if (!post.url) server = await startServer(project, inMemory ? new Map([[ref, post]]) : undefined)
        browser = await launch()
        for (const format of formats) {
            const {width, height} = sizeOf(project, format)
            const url = post.url
                ? post.url.replaceAll("{format}", format).replaceAll("{width}", String(width)).replaceAll("{height}", String(height))
                : `${server!.url}/__kit/render?post=${encodeURIComponent(ref)}&format=${encodeURIComponent(format)}`
            const page = await browser.newPage()
            await page.setViewport({width, height, deviceScaleFactor: post.scale ?? 1})
            await page.goto(url, {waitUntil: "load", timeout: 60000})
            try {
                await waitReady(page)
            } catch (error) {
                throw new Error(`${ref} ${format}: ${error instanceof Error ? error.message : error}`)
            }
            const file = join(outDir, outFile(name, format, "png"))
            await page.screenshot({path: file as `${string}.png`, clip: {x: 0, y: 0, width, height}})
            await page.close()
            written.push(file)
            log(`${relative(process.cwd(), file)}  ${width}×${height}`)
        }
    } finally {
        await browser?.close()
        await server?.close()
    }
    return written
}

/** Reels only: stills at chosen seconds, tiled per format (see `previewReel`). */
export async function previewPost(project: Project, dir: string, {only, at, log = console.log}: RenderOptions & {at?: number[]} = {}) {
    const post = await loadPost(project, dir)
    let formats = (await postPlan(project, post)).reel
    const ref = relative(join(project.social, "posts"), dir)
    if (!formats.length) throw new Error(`${ref} has no reel: \`social-kit render\` it instead`)
    if (only?.length) formats = formats.filter((f) => only.includes(f))
    return previewReel(project, dir, post, {formats, ref, log, at, name: postName(dir, post)})
}

/** A contact sheet of everything in the post's `out/`, at `out/<name>-sheet.png`. */
export async function renderSheet(project: Project, dir: string, {log = console.log}: RenderOptions = {}) {
    const ref = relative(join(project.social, "posts"), dir)
    const name = postName(dir, await loadPost(project, dir))
    const server = await startServer(project)
    const browser = await launch()
    try {
        const page = await browser.newPage()
        await page.setViewport({width: 1600, height: 900, deviceScaleFactor: 1})
        await page.goto(`${server.url}/__kit/sheet?post=${encodeURIComponent(ref)}`, {waitUntil: "load"})
        await waitReady(page)
        const file = join(dir, "out", outFile(name, "sheet", "png"))
        mkdirSync(join(dir, "out"), {recursive: true})
        await page.screenshot({path: file as `${string}.png`, fullPage: true})
        log(relative(process.cwd(), file))
        return file
    } finally {
        await browser.close()
        await server.close()
    }
}
