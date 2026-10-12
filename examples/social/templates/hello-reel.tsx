// Example reel: words land on the beat. Uses only `frame`, so it needs no Remotion import.
import {beatGrid, type TemplateMeta, type TemplateProps} from "@perxel/social-kit"

interface Props {words: string[]; bpm: number}

export const meta: TemplateMeta<Props> = {
    name: "hello-reel",
    kind: "reel",
    fps: 30,
    duration: (p) => (p.words.length + 1) * 60 / p.bpm,
    example: {words: ["One", "post,", "every", "size."], bpm: 120},
}

export default function HelloReel({width, height, frame, fps, props, brand}: TemplateProps<Props>) {
    const grid = beatGrid({bpm: props.bpm})
    const t = frame / fps
    const shown = Math.min(props.words.length, Math.floor(t / grid.beat) + 1)
    const k = grid.kick(t)
    return (
        <div style={{width, height, display: "flex", alignItems: "center", justifyContent: "center", gap: 24, flexWrap: "wrap", padding: 80,
            background: brand.colors?.primary ?? "#1f2a44", color: "#fff", fontFamily: brand.display ?? "system-ui", fontSize: Math.min(width, height) / 8}}>
            {props.words.slice(0, shown).map((w, i) => <span key={i} style={{transform: `scale(${i === shown - 1 ? 1 + 0.15 * k : 1})`}}>{w}</span>)}
        </div>
    )
}
