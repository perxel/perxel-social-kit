// The kit's own page server: renders templates to static HTML (React on the server, no bundler)
// and serves every other path as a file from the project root, so templates can load fonts and logos.
import {createReadStream, existsSync, readdirSync, statSync} from "node:fs"
import {createServer, type Server} from "node:http"
import type {AddressInfo} from "node:net"
import {extname, join, relative, resolve, sep} from "node:path"
import {loadPost, loadTemplate, resolvePostDir, sizeOf, urlFor, type Project} from "../project.js"
import type {Format} from "../types.js"

const TYPES: Record<string, string> = {
    ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".mjs": "text/javascript",
    ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg", ".webp": "image/webp", ".gif": "image/gif", ".avif": "image/avif",
    ".woff2": "font/woff2", ".woff": "font/woff", ".ttf": "font/ttf", ".otf": "font/otf",
    ".mp4": "video/mp4", ".webm": "video/webm", ".mp3": "audio/mpeg", ".wav": "audio/wav",
    ".json.lottie": "application/zip", ".lottie": "application/zip",
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"})[c]!)

export function pageShell(project: Project, {width, height, body, title = ""}: {width: number; height: number | "auto"; body: string; title?: string}) {
    const fonts = project.brand.fonts.map((f) =>
        `@font-face{font-family:${JSON.stringify(f.family)};src:url(${JSON.stringify(f.src)});font-weight:${f.weight ?? "100 900"};font-style:${f.style ?? "normal"};font-display:block}`,
    ).join("\n")
    const css = (project.config.css ?? []).map((p) => `<link rel="stylesheet" href="${urlFor(project.root, resolve(project.social, p))}">`).join("")
    const h = height === "auto" ? "auto" : `${height}px`
    return `<!doctype html><html><head><meta charset="utf-8"><title>${escape(title)}</title>
<style>${fonts}
*{box-sizing:border-box}html,body{margin:0;width:${width}px;height:${h}}body{overflow:hidden}${height === "auto" ? "body{overflow:visible}" : ""}</style>${css}
</head><body>${body}</body></html>`
}

async function renderPage(project: Project, postRef: string, format: Format) {
    const {width, height} = sizeOf(project, format)
    try {
        const post = await loadPost(project, resolvePostDir(project, postRef))
        if (!post.template) throw new Error("post has no template (and no url)")
        const template = await loadTemplate(project, post.template)
        const React = project.require("react") as typeof import("react")
        const {renderToStaticMarkup} = project.require("react-dom/server") as typeof import("react-dom/server")
        const html = renderToStaticMarkup(React.createElement(template.default, {
            width, height, format, frame: 0, fps: 30, props: post.props ?? {}, brand: project.brand,
            asset: (path: string) => "/" + path.replace(/^\/+/, "").split("/").map(encodeURIComponent).join("/"),
        }))
        return pageShell(project, {width, height, body: html, title: `${postRef} ${format}`})
    } catch (error) {
        const message = error instanceof Error ? error.stack ?? error.message : String(error)
        return pageShell(project, {width, height, body: `<pre data-error="${escape(message.split("\n")[0])}" style="padding:24px;white-space:pre-wrap;font:14px ui-monospace">${escape(message)}</pre>`})
    }
}

const order = (file: string) => {
    const i = ["square", "landscape", "portrait"].indexOf(file.split(".")[0])
    return i < 0 ? 99 : i
}

/** One page with every rendered file of a post, labelled, for review. */
function sheetPage(project: Project, postRef: string) {
    const dir = resolvePostDir(project, postRef)
    const out = join(dir, "out")
    const files = existsSync(out) ? readdirSync(out).filter((f) => /\.(png|jpe?g|webp)$/.test(f) && !f.startsWith("sheet."))
        .sort((a, b) => order(a) - order(b) || a.localeCompare(b)) : []
    const width = 1600, row = 520
    const items = files.map((f) => {
        const url = `${urlFor(project.root, join(out, f))}?t=${statSync(join(out, f)).mtimeMs}`
        return `<figure><img src="${url}"><figcaption>${escape(f)}</figcaption></figure>`
    }).join("")
    const body = `<style>
body{background:#f5f5f5;font:500 15px/1.4 ui-sans-serif,system-ui,sans-serif;color:#222;padding:32px}
h1{font-size:18px;font-weight:500;margin:0 0 24px}
main{display:flex;flex-wrap:wrap;gap:32px;align-items:flex-end}
figure{margin:0}img{display:block;height:${row}px;width:auto;box-shadow:0 0 0 1px rgba(0,0,0,.08),0 4px 12px rgba(0,0,0,.06)}
figcaption{margin-top:10px;color:#555}
</style><h1>${escape(postRef)}</h1><main>${items || "<p>Nothing rendered yet.</p>"}</main>`
    return pageShell(project, {width, height: "auto", body, title: `${postRef} sheet`})
}

export interface KitServer {
    url: string
    close(): Promise<void>
}

export async function startServer(project: Project): Promise<KitServer> {
    const server: Server = createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", "http://kit")
        try {
            if (url.pathname === "/__kit/render") {
                const html = await renderPage(project, url.searchParams.get("post")!, url.searchParams.get("format")!)
                res.writeHead(200, {"content-type": TYPES[".html"], "cache-control": "no-store"}).end(html)
                return
            }
            if (url.pathname === "/__kit/sheet") {
                res.writeHead(200, {"content-type": TYPES[".html"], "cache-control": "no-store"}).end(sheetPage(project, url.searchParams.get("post")!))
                return
            }
            const file = resolve(project.root, "." + decodeURIComponent(url.pathname))
            const inside = file === project.root || !relative(project.root, file).startsWith("..")
            if (!inside || !existsSync(file) || !statSync(file).isFile() || file.split(sep).includes("node_modules")) {
                res.writeHead(404).end("not found")
                return
            }
            const type = Object.entries(TYPES).find(([ext]) => file.endsWith(ext))?.[1] ?? TYPES[extname(file)]
            res.writeHead(200, {"content-type": type ?? "application/octet-stream"})
            createReadStream(file).pipe(res)
        } catch (error) {
            res.writeHead(500).end(String(error))
        }
    })
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r))
    const {port} = server.address() as AddressInfo
    return {
        url: `http://127.0.0.1:${port}`,
        close: () => new Promise((r) => server.close(() => r())),
    }
}
