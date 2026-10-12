// Capturing and recording live pages: page setup per device, scrolling through pinned sections,
// the pointer, keyboard and taps. Live pages run headful: hover effects need
// `(hover: hover) and (pointer: fine)` and a real window.
import puppeteer, {type Browser, type KeyInput, type Page} from "puppeteer-core"
import {chromePath, CHROME_HINT} from "../render/chrome.js"

export interface Device {
    width: number
    height: number
    /** Device pixel ratio for screenshots; recordings are always 1x (screencast frames). */
    scale: number
    /** Touch and mobile viewport. */
    mobile: boolean
}

export const DEVICES: Record<string, Device> = {
    desktop: {width: 1440, height: 900, scale: 2, mobile: false},
    tablet: {width: 820, height: 1180, scale: 2, mobile: true},
    phone: {width: 390, height: 844, scale: 3, mobile: true},
}

/**
 * Where to scroll: page pixels, a selector (its top), or a point through a pinned section
 * (`at` 0 = the pin starts, 1 = it lets go). A pinned stage is sticky inside a taller spacer;
 * the spacer is measured.
 */
export type ScrollTarget = number | string | {selector: string; at: number}

export type RecordStep =
    | {scroll: ScrollTarget; seconds: number}
    | {wait: number}
    /** Move the pointer to a point (share of the viewport) over `seconds`. */
    | {pointer: [number, number]; seconds?: number}
    /** Click an element (opens a dialog, a viewer). */
    | {click: string}
    /** Tap an element (touch devices). */
    | {tap: string}
    /** Type text into whatever has focus (or `into`, a selector), one key every `delay` ms (80 by default). */
    | {type: string; delay?: number; into?: string}
    /**
     * Press a key or a chord: `"Enter"`, `"Escape"`, `"ArrowDown"`, `"Meta+K"`. `times` repeats it,
     * `gap` seconds apart (0.35 by default).
     */
    | {key: string; times?: number; gap?: number}

export const sleep = (seconds: number) => new Promise((r) => setTimeout(r, seconds * 1000))

export function launchLive({headless = false}: {headless?: boolean} = {}): Promise<Browser> {
    const executablePath = chromePath()
    if (!executablePath) throw new Error(CHROME_HINT)
    return puppeteer.launch({
        executablePath, headless, defaultViewport: null,
        args: ["--hide-scrollbars", "--autoplay-policy=no-user-gesture-required", "--window-size=1600,1300"],
    })
}

/** A page with a device's viewport; `scale: 1` for recordings. */
export async function openPage(browser: Browser, devices: Record<string, Device>, {device = "desktop", scale, reducedMotion}: {device?: string; scale?: number; reducedMotion?: boolean} = {}) {
    const d = devices[device]
    if (!d) throw new Error(`Unknown device "${device}". Known: ${Object.keys(devices).join(", ")}`)
    const page = await browser.newPage()
    await page.setViewport({width: d.width, height: d.height, deviceScaleFactor: scale ?? d.scale, isMobile: d.mobile, hasTouch: d.mobile})
    if (reducedMotion) await page.emulateMediaFeatures([{name: "prefers-reduced-motion", value: "reduce"}])
    return page
}

/** A scroll target in page pixels. */
export function resolveScroll(page: Page, target: ScrollTarget): Promise<number> {
    return page.evaluate((target) => {
        if (typeof target === "number") return target
        const selector = typeof target === "string" ? target : target.selector
        const el = document.querySelector<HTMLElement>(selector)
        if (!el) throw new Error(`No element for ${selector}`)
        // A pinned stage is sticky inside a taller spacer: measure the first ancestor taller than it.
        let spacer = el.parentElement
        while (spacer && spacer.offsetHeight <= el.offsetHeight + 10) spacer = spacer.parentElement
        const box = (spacer && spacer.offsetHeight < innerHeight * 12 ? spacer : el).getBoundingClientRect()
        const top = box.top + scrollY
        if (typeof target === "string") return top
        return top + target.at * Math.max(0, box.height - innerHeight)
    }, target)
}

/** Eased scroll inside the page on rAF (smooth-scroll libraries and scroll triggers follow a native scroll). */
export async function scrollTo(page: Page, target: ScrollTarget, seconds = 0) {
    const y = await resolveScroll(page, target)
    await page.evaluate((y, seconds) => new Promise<void>((resolve) => {
        const from = scrollY, start = performance.now()
        const ease = (t: number) => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
        const tick = () => {
            const t = seconds ? Math.min(1, (performance.now() - start) / (seconds * 1000)) : 1
            window.scrollTo(0, from + (y - from) * ease(t))
            if (t < 1) requestAnimationFrame(tick)
            else resolve()
        }
        tick()
    }), y, seconds)
}

/**
 * Loads a page and puts it at `scroll`. A scroll made before hydration can be reset when the page's
 * scripts start, so it waits a moment first and checks the position after `settle`.
 */
export async function preparePage(page: Page, url: string, {scroll, settle}: {scroll?: ScrollTarget; settle: number}) {
    await page.goto(url, {waitUntil: "load", timeout: 60000})
    await sleep(1)
    if (scroll === undefined) return sleep(settle)
    await scrollTo(page, scroll)
    await sleep(settle)
    const [want, have] = [await resolveScroll(page, scroll), await page.evaluate(() => scrollY)]
    if (Math.abs(want - have) > 4) {
        await scrollTo(page, scroll)
        await sleep(Math.max(1.5, settle / 2))
    }
}

/** Moves the pointer to a share of the viewport over `seconds`. */
export async function pointTo(page: Page, [fx, fy]: [number, number], seconds = 0) {
    const {width, height} = page.viewport()!
    await page.mouse.move(fx * width, fy * height, {steps: Math.max(1, Math.round(seconds * 60))})
}

/** A slow loop over the lower half of the screen until `stop()`; keeps cursor effects alive. */
export function wander(page: Page) {
    let on = true
    const {width, height} = page.viewport()!
    const run = (async () => {
        const start = Date.now()
        while (on) {
            const s = (Date.now() - start) / 1000
            await page.mouse.move(width * (0.5 + 0.32 * Math.sin(s * 0.55)), height * (0.6 + 0.2 * Math.sin(s * 0.83 + 1))).catch(() => {})
            await sleep(1 / 60)
        }
    })()
    return async () => {
        on = false
        await run
    }
}

/** `"Meta+K"` → hold Meta, press K. Single letters are lowercased the way puppeteer names keys. */
async function press(page: Page, chord: string) {
    const keys = chord.split("+").map((k) => (k.length === 1 ? k.toLowerCase() : k) as KeyInput)
    const main = keys.pop()!
    for (const k of keys) await page.keyboard.down(k)
    await page.keyboard.press(main)
    for (const k of keys.reverse()) await page.keyboard.up(k)
}

export async function runStep(page: Page, step: RecordStep) {
    if ("wait" in step) await sleep(step.wait)
    else if ("scroll" in step) await scrollTo(page, step.scroll, step.seconds)
    else if ("pointer" in step) await pointTo(page, step.pointer, step.seconds)
    else if ("click" in step) await page.click(step.click)
    else if ("tap" in step) await page.tap(step.tap)
    else if ("type" in step) {
        if (step.into) await page.focus(step.into)
        await page.keyboard.type(step.type, {delay: step.delay ?? 80})
    } else if ("key" in step) {
        for (let i = 0; i < (step.times ?? 1); i++) {
            if (i) await sleep(step.gap ?? 0.35)
            await press(page, step.key)
        }
    }
}
