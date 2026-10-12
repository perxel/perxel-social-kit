// The optional Python steps (beat analysis with librosa, voice with Kokoro) run in one virtualenv
// the kit makes with uv, shared by every project on the machine. Reels work without either.
import {execFileSync} from "node:child_process"
import {existsSync} from "node:fs"
import {homedir} from "node:os"
import {join} from "node:path"
import {KIT_ROOT} from "../project.js"

export const VENV = join(homedir(), ".cache", "perxel-social-kit", "venv")
export const PY_SCRIPTS = join(KIT_ROOT, "python")
const SETUP_HINT = "run `social-kit voice setup` (needs uv: brew install uv), or set SOCIAL_KIT_PYTHON to a Python with librosa (and kokoro for voice)"

/** `SOCIAL_KIT_PYTHON`, else the kit's virtualenv. */
export function python(): string | undefined {
    if (process.env.SOCIAL_KIT_PYTHON) return process.env.SOCIAL_KIT_PYTHON
    const bin = join(VENV, "bin", "python")
    return existsSync(bin) ? bin : undefined
}

export function runPython(script: string, args: string[]) {
    const py = python()
    if (!py) throw new Error(`No Python for ${script}: ${SETUP_HINT}`)
    execFileSync(py, [join(PY_SCRIPTS, script), ...args], {stdio: "inherit"})
}

/** Python 3.12 with Kokoro 0.9.4 and librosa. Kokoro needs transformers 4.45+, or uv picks one that fails to build. */
export function setupPython() {
    try { execFileSync("uv", ["--version"], {stdio: "ignore"}) } catch { throw new Error("uv is not installed: brew install uv (or see docs.astral.sh/uv)") }
    execFileSync("uv", ["venv", "--python", "3.12", VENV], {stdio: "inherit"})
    execFileSync("uv", ["pip", "install", "--python", join(VENV, "bin", "python"), "kokoro==0.9.4", "transformers>=4.45", "soundfile", "librosa"], {stdio: "inherit"})
    console.log(`Python ready: ${VENV}`)
}
