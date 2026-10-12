// `social-kit init`: set a project up. Adds the kit (and React, if missing) as dev dependencies,
// scaffolds social/ with a config and a first post, gitignores what renders make, then installs
// the agent skill with `npx skills add` (it asks which agents) and runs doctor.
import {execFileSync} from "node:child_process"
import {appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync} from "node:fs"
import {join, relative} from "node:path"

const PACKAGE = "@perxel/social-kit"
// Overrides for trying a build before it is published: a tarball or path to install, a local
// checkout for the skill.
const INSTALL = process.env.SOCIAL_KIT_INSTALL ?? PACKAGE
const SKILL_SOURCE = process.env.SOCIAL_KIT_SKILL_SOURCE ?? "perxel/perxel-social-kit"

type Pm = "pnpm" | "yarn" | "bun" | "npm"

function packageManager(root: string): Pm {
    if (existsSync(join(root, "pnpm-lock.yaml"))) return "pnpm"
    if (existsSync(join(root, "yarn.lock"))) return "yarn"
    if (existsSync(join(root, "bun.lock")) || existsSync(join(root, "bun.lockb"))) return "bun"
    return "npm"
}

const addDev = (pm: Pm, deps: string[]) => ({
    pnpm: ["add", "-D", ...deps], yarn: ["add", "-D", ...deps], bun: ["add", "-d", ...deps], npm: ["install", "-D", ...deps],
})[pm]

const today = () => new Date().toISOString().slice(0, 10)

const CONFIG = `import {defineConfig} from "${PACKAGE}"

// Your brand for the social kit. Paths are relative to this folder: point them at the files your
// site already uses (fonts, logos), nothing needs copying.
export default defineConfig({
    brand: {
        name: "Your company",
        url: "example.com",
        // logo: {dark: "../public/logo-white.svg", light: "../public/logo.svg"},
        colors: {primary: "#1f2a44", deep: "#0a1022", ink: "#ffffff"},
        // fonts: [{family: "Inter", src: "../public/fonts/inter.woff2", weight: "100 900"}],
        // display: "Inter",
        // body: "Inter",
    },
    defaults: {still: ["square", "landscape"], reel: ["square", "landscape", "portrait"]},
})
`

const POST = `import {definePost} from "${PACKAGE}"

// Render it: npx social-kit render ${today()}-hello
export default definePost({
    template: "announcement",
    formats: ["square", "landscape", "portrait"],
    props: {headline: "Hello from the\\n**social kit**."},
})
`

const IGNORE = `
# social kit: work files, review sheets, footage and rendered reels
social/.kit/
social/posts/*/out/sheet.png
social/posts/*/out/*.preview.jpg
social/posts/*/out/*.frames.jpg
social/posts/*/out/*.mp4
social/assets/footage/
`

/** `agents`: install the skill for these without asking (`claude-code,cursor`); otherwise `skills add` asks. */
export function init({skill = true, agents}: {skill?: boolean; agents?: string} = {}) {
    const root = process.cwd()
    if (!existsSync(join(root, "package.json"))) throw new Error("Run init in your project's root (no package.json here)")
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"))
    const has = (id: string) => !!(pkg.dependencies?.[id] ?? pkg.devDependencies?.[id])
    const pm = packageManager(root)

    // 1. Dependencies.
    const deps = [...(has(PACKAGE) ? [] : [INSTALL]), ...["react", "react-dom"].filter((id) => !has(id))]
    if (deps.length) {
        console.log(`${pm} ${addDev(pm, deps).join(" ")}`)
        execFileSync(pm, addDev(pm, deps), {stdio: "inherit", cwd: root})
    }

    // 2. social/ with a config and a first post.
    const social = join(root, "social")
    if (existsSync(social)) console.log("social/ exists: left as it is")
    else {
        for (const dir of ["templates", "assets/logos", `posts/${today()}-hello`]) mkdirSync(join(social, dir), {recursive: true})
        writeFileSync(join(social, "social.config.ts"), CONFIG)
        writeFileSync(join(social, "posts", `${today()}-hello`, "post.ts"), POST)
        writeFileSync(join(social, "templates", ".gitkeep"), "")
        console.log(`${relative(root, social)}/  social.config.ts, posts/${today()}-hello/post.ts`)
    }

    // 3. .gitignore.
    const gitignore = join(root, ".gitignore")
    if (!existsSync(gitignore) || !readFileSync(gitignore, "utf8").includes("social/.kit/")) {
        appendFileSync(gitignore, IGNORE)
        console.log(".gitignore: social kit work files")
    }

    // 4. The agent skill: `skills add` asks which agents (Claude Code, Cursor, ...).
    if (skill) {
        console.log(`npx skills add ${SKILL_SOURCE} --skill social-kit`)
        try {
            const pick = agents ? [...agents.split(",").flatMap((a) => ["-a", a.trim()]), "-y"] : []
            execFileSync("npx", ["-y", "skills", "add", SKILL_SOURCE, "--skill", "social-kit", ...pick], {stdio: "inherit", cwd: root})
        } catch {
            console.log(`The skill was not installed. Later: npx skills add ${SKILL_SOURCE} --skill social-kit`)
        }
    }
    console.log("\nNext: edit social/social.config.ts, then `npx social-kit render <post>`. Checking your setup:\n")
}
