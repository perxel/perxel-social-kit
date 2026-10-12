#!/usr/bin/env node
import {execFileSync} from "node:child_process"
import {copyFileSync, existsSync, mkdirSync, writeFileSync} from "node:fs"
import {basename, join, relative} from "node:path"
import {createRequire} from "node:module"
import {parseArgs} from "node:util"
import {chromePath, CHROME_HINT} from "../render/chrome.js"
import {previewPost, renderPost, renderSheet} from "../render/still.js"
import {findRoot, listPosts, listTemplates, loadPost, loadProject, loadTemplate, resolvePostDir} from "../project.js"
import {python, runPython, setupPython} from "../audio/python.js"
import {makeVoice} from "../audio/voice.js"
import {Visuals} from "../visuals/run.js"
import {init} from "./init.js"

const HELP = `social-kit: one post, every size
  social-kit init [--agent <a,b>] [--no-skill] dev dependency, social/, .gitignore, agent skill

  social-kit new <topic> [--template <name>]   social/posts/<date>-<topic>/post.ts
  social-kit render <post...> [--only <fmt,...>] [--no-sheet]
                                               every format the post declares, then its sheet
  social-kit render --all                      every post
  social-kit preview <post> [--at <s,...>] [--only <fmt,...>]
                                               reels: stills at those seconds (or 12 spread
                                               over the reel) tiled per format, no render
  social-kit sheet <post>                      contact sheet of out/ (out/sheet.png)
  social-kit music analyze <track.mp3>         tempo, beats and loudness per bar → <track>.beats.json
  social-kit voice setup                       Python 3.12 + Kokoro + librosa (optional, needs uv)
  social-kit voice make <post> [--only <key,...>]
                                               the post's voice lines → posts/<post>/voice/*.wav
  social-kit visuals build <recipe> [id...] [--origin=<url>]
                                               capture, record, compose, encode for the web
  social-kit visuals status <recipe>           each visual: made? placed? what to provide
  social-kit visuals inventory [folder]        published media and the files that use it
  social-kit templates                         project templates, then the kit's starters
  social-kit eject <template>                  copy a starter into social/templates/
  social-kit doctor                            check Chrome, ffmpeg, React

<post> is a folder name in social/posts/ or a path to it.`

const today = () => {
    const d = new Date()
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
}

const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")

async function main() {
    const {positionals, values} = parseArgs({
        allowPositionals: true,
        options: {
            template: {type: "string", short: "t"},
            only: {type: "string"},
            at: {type: "string"},
            origin: {type: "string"},
            all: {type: "boolean"},
            "no-sheet": {type: "boolean"},
            help: {type: "boolean", short: "h"},
            "no-skill": {type: "boolean"},
            agent: {type: "string"},
        },
    })
    const [command, ...args] = positionals
    if (!command || values.help || command === "help") return console.log(HELP)

    if (command === "doctor") return doctor()
    if (command === "init") {
        init({skill: !values["no-skill"], agents: values.agent})
        return doctor()
    }
    if (command === "music" && args[0] === "analyze") {
        if (!args[1]) throw new Error("Usage: social-kit music analyze <track.mp3> [out.json]")
        return runPython("analyze.py", args.slice(1))
    }
    if (command === "voice" && args[0] === "setup") return setupPython()

    const project = await loadProject()

    switch (command) {
        case "templates": {
            for (const t of listTemplates(project)) {
                const {meta} = await loadTemplate(project, t.name)
                console.log(`${t.name.padEnd(18)} ${t.source.padEnd(8)} ${(meta.formats ?? []).join(", ").padEnd(28)} ${meta.description ?? ""}`)
            }
            return
        }
        case "eject": {
            const name = args[0]
            const entry = listTemplates(project).find((t) => t.name === name)
            if (!entry) throw new Error(`No template "${name}"`)
            if (entry.source === "project") throw new Error(`${relative(process.cwd(), entry.file)} is already the project's`)
            const dest = join(project.social, "templates", basename(entry.file))
            mkdirSync(join(project.social, "templates"), {recursive: true})
            copyFileSync(entry.file, dest)
            return console.log(`${relative(process.cwd(), dest)}  (now used instead of the starter)`)
        }
        case "new": {
            const topic = slug(args.join(" "))
            if (!topic) throw new Error("Usage: social-kit new <topic> [--template <name>]")
            const name = values.template ?? "announcement"
            const {meta} = await loadTemplate(project, name)
            const dir = join(project.social, "posts", `${today()}-${topic}`)
            if (existsSync(dir)) throw new Error(`${relative(process.cwd(), dir)} already exists`)
            mkdirSync(dir, {recursive: true})
            const props = JSON.stringify(meta.example ?? {}, null, 4).replace(/^(\s*)"([A-Za-z_$][\w$]*)":/gm, "$1$2:").replace(/\n/g, "\n    ")
            writeFileSync(join(dir, "post.ts"), `import {definePost} from "@perxel/social-kit"

export default definePost({
    template: ${JSON.stringify(name)},
    props: ${props},
})
`)
            return console.log(`${relative(process.cwd(), join(dir, "post.ts"))}\nEdit the props, then: social-kit render ${basename(dir)}`)
        }
        case "render": {
            const refs = values.all ? listPosts(project) : args
            if (!refs.length) throw new Error("Usage: social-kit render <post...> | --all")
            const only = values.only?.split(",").map((s) => s.trim()).filter(Boolean)
            for (const ref of refs) {
                const dir = resolvePostDir(project, ref)
                await renderPost(project, dir, {only})
                if (!values["no-sheet"]) await renderSheet(project, dir)
            }
            return
        }
        case "preview": {
            if (!args[0]) throw new Error("Usage: social-kit preview <post> [--at <s,...>] [--only <fmt,...>]")
            const dir = resolvePostDir(project, args[0])
            const only = values.only?.split(",").map((s) => s.trim()).filter(Boolean)
            const at = values.at?.split(",").map(Number).filter((n) => Number.isFinite(n))
            await previewPost(project, dir, {only, at})
            return
        }
        case "visuals": {
            const visuals = new Visuals(project)
            const [sub, ref, ...ids] = args
            if (sub === "build" && ref) return visuals.build(ref, ids, {origin: values.origin})
            if (sub === "status" && ref) return visuals.status(ref)
            if (sub === "inventory") return visuals.inventory(ref)
            throw new Error("Usage: social-kit visuals build <recipe> [id...] | status <recipe> | inventory [folder]")
        }
        case "voice": {
            if (args[0] !== "make" || !args[1]) throw new Error("Usage: social-kit voice setup | voice make <post> [--only <key,...>]")
            const dir = resolvePostDir(project, args[1])
            makeVoice(project, dir, await loadPost(project, dir), values.only?.split(",").map((s) => s.trim()).filter(Boolean))
            return
        }
        case "sheet": {
            if (!args[0]) throw new Error("Usage: social-kit sheet <post>")
            await renderSheet(project, resolvePostDir(project, args[0]))
            return
        }
        default:
            console.log(HELP)
            process.exitCode = 1
    }
}

function doctor() {
    /** `optional`: reported, but not a failure (reels, Python). */
    const check = (label: string, ok: boolean, hint: string, optional = false) => {
        console.log(`${ok ? "ok  " : optional ? "--  " : "MISS"} ${label}${ok ? "" : `\n     ${hint}`}`)
        if (!ok && !optional) process.exitCode = 1
    }
    let root: string | undefined
    try { root = findRoot() } catch {}
    check("social/ folder", !!root, "run social-kit init (or create social/)")
    const chrome = chromePath()
    check(`Chrome${chrome ? ` (${chrome.split("/").find((p) => /\d+\.\d+/.test(p)) ?? chrome})` : ""}`, !!chrome, CHROME_HINT)
    let ffmpeg = false
    try { execFileSync("ffmpeg", ["-version"], {stdio: "ignore"}); ffmpeg = true } catch {}
    check("ffmpeg (reels and video presets, not needed for images)", ffmpeg, "brew install ffmpeg / apt install ffmpeg", true)
    let magick = false
    try { execFileSync("magick", ["-version"], {stdio: "ignore"}); magick = true } catch {}
    check("ImageMagick (visuals: WebP for the web; optional otherwise)", magick, "brew install imagemagick / apt install imagemagick", true)
    if (root) {
        const req = createRequire(join(root, "package.json"))
        const has = (id: string) => { try { return !!req.resolve(id) } catch { return false } }
        check("react + react-dom in the project", has("react") && has("react-dom/server"), "pnpm add -D react react-dom")
        const remotion = has("remotion") && has("@remotion/bundler") && has("@remotion/renderer")
        check("Remotion (reels only; free up to 3 people, else a company licence: remotion.dev/license)", remotion,
            "pnpm add -D remotion @remotion/bundler @remotion/renderer", true)
    }
    const py = python()
    check(`Python for music analyze and voice (optional)${py ? ` (${py})` : ""}`, !!py, "social-kit voice setup (needs uv), or set SOCIAL_KIT_PYTHON", true)
}

main().catch((error) => {
    console.error(`social-kit: ${error instanceof Error ? (process.env.DEBUG ? error.stack : error.message) : error}`)
    process.exitCode = 1
})

