/** Every sound is synthesized. Phase 1 ships no audio assets. */
export interface Sfx {
  unlock(): void
  setMuted(muted: boolean): void
  whoosh(): void
  bonk(): void
  cheer(): void
  respin(): void
  wake(): void
  purr(): void
  bounce(): void
  bell(): void
  roar(): void
  whistle(): void
  splash(): void
  quack(): void
  chitter(): void
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let muted = false

  // Purple Cougar is designed to communicate through animation, color, and
  // small musical cues. Clear any speech an earlier hot-reloaded build left
  // behind, then never start browser speech from this toy.
  if ('speechSynthesis' in window) window.speechSynthesis.cancel()

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

  /**
   * One output node makes mute real: it silences a roar or canyon tail already
   * in flight instead of merely blocking the next synthesized cue.
   */
  function masterGain(c: AudioContext): GainNode {
    if (master) return master
    master = c.createGain()
    master.gain.value = muted ? 0.0001 : 1
    master.connect(c.destination)
    return master
  }

  function setMasterMuted(nextMuted: boolean): void {
    muted = nextMuted
    if (!ctx || !master) return
    const now = ctx.currentTime
    master.gain.cancelScheduledValues(now)
    master.gain.setValueAtTime(master.gain.value, now)
    master.gain.linearRampToValueAtTime(nextMuted ? 0.0001 : 1, now + 0.025)
  }

  /**
   * A canyon tail, built once and shared.
   *
   * Reverb is what separates a buzzing synth noise from a sound that seems to
   * happen in a real place. The impulse response is exponentially decaying
   * noise, low-passed a little more as it decays so the tail darkens the way
   * air and hillsides actually absorb the high end first.
   */
  let canyon: ConvolverNode | null = null
  let canyonConnected = false
  function reverb(c: AudioContext): ConvolverNode {
    if (!canyon) {
      const seconds = 2.4
      const frames = Math.floor(c.sampleRate * seconds)
      const impulse = c.createBuffer(2, frames, c.sampleRate)
      for (let channel = 0; channel < 2; channel++) {
        const data = impulse.getChannelData(channel)
        let smoothed = 0
        for (let i = 0; i < frames; i++) {
          const decay = Math.pow(1 - i / frames, 2.6)
          // A one-pole lowpass on the noise, opened wide early and closed as the
          // tail fades: a bright forever-tail sounds like metal, not mountains.
          smoothed += ((Math.random() * 2 - 1) - smoothed) * (0.22 + decay * 0.5)
          data[i] = smoothed * decay
        }
      }
      canyon = c.createConvolver()
      canyon.buffer = impulse
    }
    if (!canyonConnected) {
      canyon.connect(masterGain(c))
      canyonConnected = true
    }
    return canyon
  }

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    gain: number,
    slideTo?: number,
  ): void {
    if (muted) return
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
    osc.connect(amp).connect(masterGain(c))
    osc.start()
    osc.stop(c.currentTime + dur)
  }

  function noise(dur: number, gain: number, cutoff: number): void {
    if (muted) return
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
    src.connect(filter).connect(amp).connect(masterGain(c))
    src.start()
  }

  return {
    unlock() {
      const c = ac()
      if (c && c.state === 'suspended') void c.resume()
    },
    setMuted(nextMuted) {
      setMasterMuted(nextMuted)
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
    wake() {
      tone(330, 0.16, 'triangle', 0.12, 440)
      window.setTimeout(() => tone(523, 0.2, 'triangle', 0.1), 80)
    },
    purr() {
      tone(94, 0.45, 'sine', 0.05, 108)
      window.setTimeout(() => tone(141, 0.18, 'sine', 0.025), 60)
    },
    bounce() {
      tone(390, 0.11, 'sine', 0.12, 560)
    },
    bell() {
      tone(1260, 0.55, 'sine', 0.09, 980)
      window.setTimeout(() => tone(1670, 0.35, 'sine', 0.055), 85)
    },
    /**
     * The big one. A full cinematic roar, synthesized end to end.
     *
     * A single sliding oscillator sounds like a kazoo, so this is built the way
     * a real big-cat call is built:
     *   - a stack of detuned sawtooths plus a sub sine for the chest,
     *   - a pitch arc that punches UP fast and then falls away, which is the
     *     shape the ear actually reads as "roar" rather than "siren",
     *   - vibrato and a ~24Hz growl tremolo for the rasp in the throat,
     *   - two bandpass formants at vocal-tract frequencies so it reads as a
     *     voice coming from an animal instead of a filter sweep,
     *   - a lowpass "mouth" that opens on the attack and closes on the decay,
     *   - and a canyon reverb tail so it rings out over the ridges.
     *
     * It is deliberately triumphant rather than threatening: the pitch resolves
     * upward at the end and the peak gain stays modest, because a three-year-old
     * has to want to press it again.
     */
    roar() {
      if (muted) return
      const c = ac()
      if (!c) return
      const t0 = c.currentTime
      const length = 1.9

      const out = c.createGain()
      out.gain.value = 0
      // Attack fast enough to feel like an impact, then a long proud fall.
      out.gain.setValueAtTime(0.0001, t0)
      out.gain.exponentialRampToValueAtTime(0.5, t0 + 0.11)
      out.gain.setValueAtTime(0.5, t0 + 0.72)
      out.gain.exponentialRampToValueAtTime(0.22, t0 + 1.25)
      out.gain.exponentialRampToValueAtTime(0.0001, t0 + length)

      // The mouth: a lowpass that opens wide on the roar and closes as it dies.
      const mouth = c.createBiquadFilter()
      mouth.type = 'lowpass'
      mouth.Q.value = 1.1
      mouth.frequency.setValueAtTime(420, t0)
      mouth.frequency.exponentialRampToValueAtTime(3400, t0 + 0.16)
      mouth.frequency.exponentialRampToValueAtTime(900, t0 + 1.1)
      mouth.frequency.exponentialRampToValueAtTime(320, t0 + length)

      // Formants — the resonances that make it a throat and not a synth.
      const formantMix = c.createGain()
      for (const [freq, q, gain] of [
        [620, 5.5, 0.5],
        [1180, 7, 0.3],
      ] as const) {
        const formant = c.createBiquadFilter()
        formant.type = 'bandpass'
        formant.frequency.value = freq
        formant.Q.value = q
        const level = c.createGain()
        level.gain.value = gain
        mouth.connect(formant).connect(level).connect(formantMix)
      }
      // Keep the unfiltered body too, or the formants hollow it out entirely.
      const body = c.createGain()
      body.gain.value = 0.72
      mouth.connect(body).connect(formantMix)
      formantMix.connect(out)

      // Growl: a fast tremolo riding the output is the rasp of a big cat.
      const growl = c.createOscillator()
      growl.type = 'sine'
      growl.frequency.setValueAtTime(24, t0)
      growl.frequency.linearRampToValueAtTime(16, t0 + length)
      const growlDepth = c.createGain()
      growlDepth.gain.setValueAtTime(0.16, t0)
      growlDepth.gain.linearRampToValueAtTime(0.05, t0 + length)
      growl.connect(growlDepth).connect(out.gain)
      growl.start(t0)
      growl.stop(t0 + length)

      // Vibrato keeps the held note alive rather than electronically steady.
      const vibrato = c.createOscillator()
      vibrato.type = 'sine'
      vibrato.frequency.value = 5.5
      const vibratoDepth = c.createGain()
      vibratoDepth.gain.value = 4.5
      vibrato.connect(vibratoDepth)
      vibrato.start(t0)
      vibrato.stop(t0 + length)

      // Voice stack. Slight detuning between the sawtooths is what gives the
      // roar its thickness — perfectly tuned copies just sound louder.
      for (const [ratio, detune, gain, type] of [
        [1, 0, 0.34, 'sawtooth'],
        [1.005, 9, 0.26, 'sawtooth'],
        [0.994, -11, 0.26, 'sawtooth'],
        [2.01, 5, 0.12, 'sawtooth'],
        [0.5, 0, 0.4, 'sine'],
      ] as const) {
        const osc = c.createOscillator()
        osc.type = type
        osc.detune.value = detune
        const base = 128 * ratio
        // Punch up to the peak, hold, then fall — and end a little ABOVE the
        // start so the whole gesture lands as triumphant, not as a groan.
        osc.frequency.setValueAtTime(base * 0.55, t0)
        osc.frequency.exponentialRampToValueAtTime(base * 1.28, t0 + 0.13)
        osc.frequency.exponentialRampToValueAtTime(base * 1.0, t0 + 0.55)
        osc.frequency.exponentialRampToValueAtTime(base * 0.72, t0 + 1.35)
        osc.frequency.exponentialRampToValueAtTime(base * 0.62, t0 + length)
        vibratoDepth.connect(osc.detune)
        const level = c.createGain()
        level.gain.value = gain
        osc.connect(level).connect(mouth)
        osc.start(t0)
        osc.stop(t0 + length)
      }

      // Breath rasp: bandpassed noise riding the same envelope.
      const rasp = c.createBufferSource()
      const raspFrames = Math.floor(c.sampleRate * length)
      const raspBuffer = c.createBuffer(1, raspFrames, c.sampleRate)
      const raspData = raspBuffer.getChannelData(0)
      for (let i = 0; i < raspFrames; i++) {
        raspData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / raspFrames, 1.4)
      }
      rasp.buffer = raspBuffer
      const raspFilter = c.createBiquadFilter()
      raspFilter.type = 'bandpass'
      raspFilter.Q.value = 0.9
      raspFilter.frequency.setValueAtTime(900, t0)
      raspFilter.frequency.exponentialRampToValueAtTime(2600, t0 + 0.18)
      raspFilter.frequency.exponentialRampToValueAtTime(700, t0 + length)
      const raspLevel = c.createGain()
      raspLevel.gain.value = 0.3
      rasp.connect(raspFilter).connect(raspLevel).connect(out)
      rasp.start(t0)

      // Dry signal plus a generous send to the canyon, so it rings out.
      const dry = c.createGain()
      dry.gain.value = 0.82
      out.connect(dry).connect(masterGain(c))
      const wet = c.createGain()
      wet.gain.value = 0.5
      out.connect(wet).connect(reverb(c))
    },
    // Distant two-tone toy-train whistle.
    whistle() {
      tone(660, 0.28, 'sine', 0.07, 622)
      window.setTimeout(() => tone(880, 0.42, 'sine', 0.06, 830), 240)
    },
    // A soft plop-and-fizz for the ball meeting the pool.
    splash() {
      tone(230, 0.16, 'sine', 0.12, 90)
      noise(0.38, 0.12, 2400)
    },
    // A cheerful toy-duck quack: two quick nasal square honks.
    quack() {
      tone(310, 0.12, 'square', 0.055, 230)
      window.setTimeout(() => tone(285, 0.14, 'square', 0.05, 200), 130)
    },
    // The white squirrel's scolding chatter: a fast run of tiny high chirps.
    chitter() {
      for (let chirp = 0; chirp < 5; chirp++) {
        window.setTimeout(
          () => tone(1750 + chirp * 70, 0.05, 'triangle', 0.035, 1350),
          chirp * 62,
        )
      }
    },
  }
}
