// Web presets: what goes into a site's public folder. Images as WebP (ImageMagick, Lanczos),
// videos as silent H.264 MP4 with faststart for inline autoplay. Defaults are Perxel's
// (perxel-web-2026): a prose figure is ~800px wide, so images at most 1600px. In-post videos are
// high resolution by default (owner, 2026-10-13): 1920px at crf 27, since 1120px at crf 34 read
// blurry on retina screens and when enlarged (screen recordings carry small text).
import {execFileSync} from "node:child_process"

export const VIDEO = {crf: 27, preset: "slow", maxWidth: 1920}
export const IMAGE = {maxWidth: 1600, quality: 82}

export function hasTool(tool: string) {
    try { execFileSync(tool, ["-version"], {stdio: "ignore"}); return true } catch { return false }
}

export function assertTools(...tools: string[]) {
    for (const tool of tools) {
        if (!hasTool(tool)) throw new Error(`${tool} not found. Install it first: brew install ${tool === "magick" ? "imagemagick" : tool}`)
    }
}

/** Silent H.264 MP4, faststart, at most `maxWidth` wide; `fps` resamples, `from`/`to` trim (seconds). */
export function encodeVideo(input: string, output: string, {maxWidth = VIDEO.maxWidth, crf = VIDEO.crf, preset = VIDEO.preset, fps, from, to}: {maxWidth?: number; crf?: number; preset?: string; fps?: number; from?: number; to?: number} = {}) {
    const filters = [`scale='min(${maxWidth},iw)':-2`, ...(fps ? [`fps=${fps}`] : [])]
    execFileSync("ffmpeg", [
        "-y", ...(from ? ["-ss", String(from)] : []), "-i", input, ...(to ? ["-t", String(to - (from ?? 0))] : []),
        "-map_metadata", "-1", "-vf", filters.join(","),
        "-c:v", "libx264", "-preset", preset, "-crf", String(crf), "-pix_fmt", "yuv420p", "-movflags", "+faststart", "-an", output,
    ], {stdio: ["ignore", "ignore", "pipe"]})
}

/** One frame of a video, as a full-size PNG. */
export function extractFrame(input: string, output: string, seconds = 0) {
    execFileSync("ffmpeg", ["-y", "-ss", String(seconds), "-i", input, "-frames:v", "1", output], {stdio: ["ignore", "ignore", "pipe"]})
}

/** WebP, downscaled with Lanczos to `width` (exact) or to at most `maxWidth`. */
export function encodeWebp(input: string, output: string, {width, maxWidth = IMAGE.maxWidth, quality = IMAGE.quality}: {width?: number; maxWidth?: number; quality?: number} = {}) {
    const resize = width ? `${width}x` : `${maxWidth}x>`
    execFileSync("magick", [input, "-filter", "Lanczos", "-resize", resize, "-quality", String(quality), "-define", "webp:method=6", output])
}
