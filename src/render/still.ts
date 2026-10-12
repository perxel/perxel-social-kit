// Still images: one screenshot per format, of the kit's own page for a template or of a URL the
// project serves (URL mode).
import {mkdirSync} from "node:fs"
import {join, relative} from "node:path"
import type {Browser} from "puppeteer-core"
import {loadPost, postFormats, sizeOf, type Project} from "../project.js"
import type {Format} from "../types.js"
import {launch, waitReady} from "./chrome.js"
import {startServer, type KitServer} from "./server.js"

export interface RenderOptions {
    only?: Format[]
    log?: (line: string) => void
}

export async function renderPost(project: Project, dir: string, {only, log = console.log}: RenderOptions = {}) {
    const post = await loadPost(project, dir)
    let formats = await postFormats(project, post)
    if (only?.length) formats = formats.filter((f) => only.includes(f))
    if (!formats.length) throw new Error(`Nothing to render: the post's formats don't include ${only?.join(", ")}`)

    const out = join(dir, "out")
    mkdirSync(out, {recursive: true})
    const ref = relative(join(project.social, "posts"), dir)
    let server: KitServer | undefined
    let browser: Browser | undefined
    const written: string[] = []
    try {
        if (!post.url) server = await startServer(project)
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
            const file = join(out, `${format}.png`)
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

/** A contact sheet of everything in the post's `out/`, at `out/sheet.png`. */
export async function renderSheet(project: Project, dir: string, {log = console.log}: RenderOptions = {}) {
    const ref = relative(join(project.social, "posts"), dir)
    const server = await startServer(project)
    const browser = await launch()
    try {
        const page = await browser.newPage()
        await page.setViewport({width: 1600, height: 900, deviceScaleFactor: 1})
        await page.goto(`${server.url}/__kit/sheet?post=${encodeURIComponent(ref)}`, {waitUntil: "load"})
        await waitReady(page)
        const file = join(dir, "out", "sheet.png")
        mkdirSync(join(dir, "out"), {recursive: true})
        await page.screenshot({path: file as `${string}.png`, fullPage: true})
        log(relative(process.cwd(), file))
        return file
    } finally {
        await browser.close()
        await server.close()
    }
}
