/** Every sound is synthesized. Phase 1 ships no audio assets. */
export interface Sfx {
  unlock(): void
  whoosh(): void
  bonk(): void
  cheer(): void
  respin(): void
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null

  function ac(): AudioContext | null {
    if (!ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
    }
    return ctx
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    const c = ac()
    if (!c) return
    const osc = c.createOscillator()
    const amp = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, c.currentTime)
    if (slideTo !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(slideTo, c.currentTime + dur)
    }
    amp.gain.setValueAtTime(gain, c.currentTime)
    amp.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur)
    osc.connect(amp).connect(c.destination)
    osc.start()
    osc.stop(c.currentTime + dur)
  }

  function noise(dur: number, gain: number, cutoff: number): void {
    const c = ac()
    if (!c) return
    const frames = Math.floor(c.sampleRate * dur)
    const buf = c.createBuffer(1, frames, c.sampleRate)
    const data = buf.getChannelData(0)
    for (let i = 0; i < frames; i++) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / frames)
    }
    const src = c.createBufferSource()
    src.buffer = buf
    const filter = c.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(cutoff, c.currentTime)
    const amp = c.createGain()
    amp.gain.setValueAtTime(gain, c.currentTime)
    src.connect(filter).connect(amp).connect(c.destination)
    src.start()
  }

  return {
    unlock() {
      const c = ac()
      if (c && c.state === 'suspended') void c.resume()
    },
    whoosh() {
      noise(0.16, 0.16, 1400)
    },
    bonk() {
      tone(180, 0.22, 'sine', 0.28, 60)
      noise(0.12, 0.1, 320)
    },
    cheer() {
      const notes = [523, 659, 784, 1046]
      notes.forEach((f, i) => {
        window.setTimeout(() => tone(f, 0.14, 'triangle', 0.14), i * 70)
      })
    },
    respin() {
      tone(300, 0.3, 'triangle', 0.1, 620)
    },
  }
}
