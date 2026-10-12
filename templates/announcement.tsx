// Starter: a headline on the brand colour, logo row on top, hairline and url at the bottom.
// Copy it into your project with `social-kit eject announcement` to change it.
import type {CSSProperties, ReactNode} from "react"
import type {TemplateMeta, TemplateProps} from "@perxel/social-kit"

interface Props {
    /** `**bold**` marks the phrase that matters; a newline breaks the line. */
    headline: string
    /** Logo after the brand's, joined by ×. A URL from the project root (`/social/assets/logos/x.svg`). */
    partner?: string
    /** Small mark at the bottom right, same kind of URL. */
    mark?: string
    /** Bottom left text; the brand's `url` when left out. */
    footer?: string
    /** Scales the headline for longer or shorter text, 1 by default. */
    size?: number
}

export const meta: TemplateMeta<Props> = {
    name: "announcement",
    description: "Headline on the brand colour, logo row, footer",
    formats: ["square", "landscape", "portrait"],
    kind: "still",
    example: {headline: "Something new is **here**.", footer: "example.com"},
}

// Per format: padding, logo row, headline and footer sizes.
const LAYOUT = {
    landscape: {pad: 128, top: 112, logo: 56, gap: 36, head: 132, track: -3, bottom: 96, foot: 30, mark: 26, rule: 56},
    square: {pad: 88, top: 88, logo: 40, gap: 24, head: 96, track: -2, bottom: 72, foot: 24, mark: 20, rule: 44},
    portrait: {pad: 96, top: 140, logo: 48, gap: 28, head: 116, track: -2.5, bottom: 132, foot: 28, mark: 24, rule: 52},
}

function rich(text: string): ReactNode[] {
    return text.split("\n").flatMap((line, i) => [
        ...(i ? [<br key={`br${i}`}/>] : []),
        ...line.split(/\*\*(.+?)\*\*/g).map((part, j) => j % 2 ? <b key={`${i}-${j}`} style={{fontWeight: 600}}>{part}</b> : part),
    ])
}

export default function Announcement({width, height, format, props, brand}: TemplateProps<Props>) {
    const l = LAYOUT[format as keyof typeof LAYOUT] ?? LAYOUT.square
    const c = {primary: "#1f2a44", deep: "#0a1022", ink: "#ffffff", ...brand.colors}
    const display = brand.display ? `${JSON.stringify(brand.display)}, system-ui, sans-serif` : "system-ui, sans-serif"
    const body = brand.body ? `${JSON.stringify(brand.body)}, system-ui, sans-serif` : "system-ui, sans-serif"
    const logo = brand.logo?.dark ?? brand.logo?.light
    const footer = props.footer ?? brand.url
    const abs = (style: CSSProperties): CSSProperties => ({position: "absolute", left: l.pad, right: l.pad, ...style})

    return (
        <div className="sk-announcement" style={{
            position: "relative", width, height, overflow: "hidden", color: c.ink, fontFamily: body,
            background: `radial-gradient(120% 90% at 85% 110%, ${c.deep} 0%, transparent 60%), ${c.primary}`,
        }}>
            {(logo || props.partner) && (
                <div style={abs({top: l.top, display: "flex", alignItems: "center", gap: l.gap})}>
                    {logo && <img src={logo} alt={brand.name ?? ""} style={{height: l.logo, display: "block"}}/>}
                    {logo && props.partner && <span style={{fontFamily: display, fontWeight: 200, fontSize: l.logo, lineHeight: 1, opacity: .7}}>×</span>}
                    {props.partner && <img src={props.partner} alt="" style={{height: l.logo, display: "block"}}/>}
                </div>
            )}
            <div style={abs({
                top: "50%", transform: "translateY(-46%)", fontFamily: display, fontWeight: 300,
                fontSize: l.head * (props.size ?? 1), lineHeight: 1.06, letterSpacing: l.track,
            })}>{rich(props.headline ?? "")}</div>
            {(footer || props.mark) && (
                <div style={abs({
                    bottom: l.bottom, height: l.foot * 1.4, display: "flex", justifyContent: "space-between",
                    alignItems: "center", fontSize: l.foot, letterSpacing: .3,
                })}>
                    <div style={{position: "absolute", left: 0, right: 0, top: -l.rule, height: 1, background: "rgba(255,255,255,.28)"}}/>
                    <span style={{opacity: .8}}>{footer}</span>
                    {props.mark && <img src={props.mark} alt="" style={{height: l.mark, display: "block", opacity: .9}}/>}
                </div>
            )}
        </div>
    )
}
