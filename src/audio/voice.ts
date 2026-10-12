// Voice-over: each line of a post's `voice` spoken by Kokoro, then trimmed and loudness-normalised
// with ffmpeg into social/posts/<post>/voice/<key>.wav, with the lengths in voice.json (reels read
// them to duck the music).
import {execFileSync} from "node:child_process"
import {existsSync, mkdirSync, readFileSync, rmSync, writeFileSync} from "node:fs"
import {join, relative} from "node:path"
import {urlFor, type Project} from "../project.js"
import type {Post} from "../types.js"
import {runPython} from "./python.js"

/** Silence off both ends, then -14 LUFS (music sits around -11; the voice must sit on top of it). */
const CLEAN = "silenceremove=start_periods=1:start_threshold=-45dB,areverse,silenceremove=start_periods=1:start_threshold=-45dB,areverse,loudnorm=I=-14:TP=-1.5:LRA=7"

export function voiceDir(dir: string) {
    return join(dir, "voice")
}

export function makeVoice(project: Project, dir: string, post: Post, only?: string[]) {
    const v = post.voice
    if (!v?.lines || !Object.keys(v.lines).length) throw new Error("The post has no `voice.lines`")
    const out = voiceDir(dir)
    const tmp = join(out, ".raw")
    mkdirSync(tmp, {recursive: true})
    const lines = Object.fromEntries(Object.entries(v.lines).filter(([key]) => !only?.length || only.includes(key)))
    const job = join(tmp, "job.json")
    writeFileSync(job, JSON.stringify({voice: v.voice ?? "am_michael", lang: v.lang ?? "a", speed: v.speed ?? 0.95, out: tmp, lines}))
    runPython("voice.py", [job])
    const index = join(out, "voice.json")
    const seconds: Record<string, number> = existsSync(index) ? JSON.parse(readFileSync(index, "utf8")) : {}
    for (const key of Object.keys(lines)) {
        const file = join(out, `${key}.wav`)
        execFileSync("ffmpeg", ["-y", "-v", "error", "-i", join(tmp, `${key}.raw.wav`), "-af", CLEAN, "-ar", "48000", file])
        const s = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]).toString().trim())
        seconds[key] = Math.round(s * 100) / 100
        console.log(`${relative(process.cwd(), file)}  ${seconds[key]} s`)
    }
    writeFileSync(index, JSON.stringify(seconds, null, 2) + "\n")
    rmSync(tmp, {recursive: true, force: true})
}

/** What a reel template gets as `voice`: per line, its file (project-root path) and length. */
export function voiceFor(project: Project, dir: string): Record<string, {src: string; seconds: number}> | undefined {
    const index = join(voiceDir(dir), "voice.json")
    if (!existsSync(index)) return undefined
    const seconds: Record<string, number> = JSON.parse(readFileSync(index, "utf8"))
    return Object.fromEntries(Object.entries(seconds).map(([key, s]) => [key, {src: urlFor(project.root, join(voiceDir(dir), `${key}.wav`)).slice(1), seconds: s}]))
}
