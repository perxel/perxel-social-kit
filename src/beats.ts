// A track's beat grid: place everything in a reel by bar and beat instead of by seconds.
// Browser-safe (no Node imports): templates import it.

export interface BeatGridOptions {
    /** Tempo in beats per minute. */
    bpm: number
    /** Seconds into the track of its first downbeat (bar 1, beat 1). */
    firstBeat?: number
    /** The track bar (1-based) the reel starts on, so a track's intro can be skipped. 1 by default. */
    startBar?: number
    /** Beats per bar, 4 by default. */
    beatsPerBar?: number
}

export interface BeatGrid {
    bpm: number
    /** Seconds per beat and per bar. */
    beat: number
    bar: number
    /** Seconds into the track where the reel starts: trim the music by this much. */
    trackOffset: number
    /** Reel seconds at track bar `bar` (1-based) plus `beats` beats. */
    at(bar: number, beats?: number): number
    /** 1 on every beat, decaying before the next (0 before the reel's first beat): drives pulses. */
    kick(seconds: number, decay?: number): number
}

export function beatGrid({bpm, firstBeat = 0, startBar = 1, beatsPerBar = 4}: BeatGridOptions): BeatGrid {
    const beat = 60 / bpm
    const bar = beat * beatsPerBar
    const trackOffset = firstBeat + (startBar - 1) * bar
    return {
        bpm, beat, bar, trackOffset,
        at: (n, beats = 0) => firstBeat + (n - 1) * bar + beats * beat - trackOffset,
        kick: (seconds, decay = 7) => {
            const b = (seconds + trackOffset - firstBeat) / beat
            return b < 0 ? 0 : Math.exp(-(b - Math.floor(b)) * decay)
        },
    }
}

/** The grid from `social-kit music analyze` output (`<track>.beats.json`). The tempo and first
 * beat are the analysis' guesses: check them by ear and override when a beat lands early or late. */
export function gridFromAnalysis(analysis: {tempo: number; beats: number[]}, options: Omit<BeatGridOptions, "bpm" | "firstBeat"> = {}) {
    return beatGrid({bpm: analysis.tempo, firstBeat: analysis.beats[0] ?? 0, ...options})
}
