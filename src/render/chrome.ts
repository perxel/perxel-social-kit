// Chrome for Testing through puppeteer-core.
import {existsSync, readdirSync} from "node:fs"
import {homedir} from "node:os"
import {join} from "node:path"
import puppeteer, {type Browser, type Page} from "puppeteer-core"

/** `CHROME_PATH`, or the newest Chrome for Testing in puppeteer's cache. */
export function chromePath(): string | undefined {
    if (process.env.CHROME_PATH) return process.env.CHROME_PATH
    const root = join(homedir(), ".cache/puppeteer/chrome")
    const platform = process.platform === "darwin" ? (process.arch === "arm64" ? "mac_arm-" : "mac-") : "linux-"
    const version = (dir: string) => dir.split("-").pop()!.split(".").map(Number)
    const newest = existsSync(root) && readdirSync(root)
        .filter((d) => d.startsWith(platform))
        .sort((a, b) => {
            const [va, vb] = [version(a), version(b)]
            return va.reduce((r, n, i) => r || n - (vb[i] ?? 0), 0)
        })
        .pop()
    return newest ? [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-linux64/chrome",
    ].map((p) => join(root, newest, p)).find(existsSync) : undefined
}

export const CHROME_HINT = "No Chrome for Testing found: run `npx @puppeteer/browsers install chrome@stable` or set CHROME_PATH"

export function launch(): Promise<Browser> {
    const executablePath = chromePath()
    if (!executablePath) throw new Error(CHROME_HINT)
    return puppeteer.launch({executablePath, headless: true, args: ["--hide-scrollbars", "--autoplay-policy=no-user-gesture-required"]})
}

/**
 * Waits until the page is ready to shoot: fonts and images loaded, nothing marked `data-pending`.
 * Throws with the message of anything marked `data-error`.
 */
export async function waitReady(page: Page, timeout = 30000) {
    await page.waitForFunction(() => {
        const err = document.querySelector("[data-error]")
        if (err) return true
        if (document.readyState !== "complete" || document.fonts.status !== "loaded") return false
        if ([...document.images].some((i) => !i.complete)) return false
        return !document.querySelector("[data-pending]")
    }, {timeout, polling: 100})
    const error = await page.evaluate(() => document.querySelector("[data-error]")?.getAttribute("data-error"))
    if (error) throw new Error(error)
    // One more frame so late layout (fonts swapping in) has painted.
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
}
