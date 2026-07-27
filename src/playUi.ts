/** Minimal, child-readable feedback for the opening story. */
export interface PlayUi {
  showBallInvite(): void
  showBounce(count: number): void
  showRampReady(): void
  celebrate(): void
  announce(message: string): void
  setSoundMuted(muted: boolean): void
  onSoundToggle(listener: (muted: boolean) => void): void
}

export function createPlayUi(host: HTMLElement): PlayUi {
  const root = document.createElement('div')
  root.setAttribute('aria-live', 'polite')
  root.setAttribute('aria-atomic', 'true')
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '2',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(root)

  const live = document.createElement('span')
  Object.assign(live.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
  } satisfies Partial<CSSStyleDeclaration>)
  root.appendChild(live)

  const sound = document.createElement('button')
  sound.type = 'button'
  sound.setAttribute('aria-label', 'Sound on')
  sound.textContent = '🔊'
  Object.assign(sound.style, {
    position: 'fixed',
    top: 'max(14px, env(safe-area-inset-top))',
    right: 'max(14px, env(safe-area-inset-right))',
    width: '52px',
    height: '52px',
    border: '3px solid rgba(255,255,255,0.84)',
    borderRadius: '50%',
    background: 'rgba(81, 52, 121, 0.52)',
    color: '#fffdf5',
    font: '700 27px/1 system-ui, sans-serif',
    boxShadow: '0 4px 0 rgba(40,18,62,0.22)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(sound)

  let muted = false
  let soundListener: ((isMuted: boolean) => void) | null = null
  sound.addEventListener('click', () => {
    muted = !muted
    sound.textContent = muted ? '🔇' : '🔊'
    sound.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on')
    soundListener?.(muted)
  })

  function announce(message: string): void {
    live.textContent = message
  }

  return {
    showBallInvite() {
      announce('Purple Cougar is ready to play with the ball.')
    },
    showBounce(count) {
      announce(`${count} bounce${count === 1 ? '' : 's'}!`)
    },
    showRampReady() {
      announce('The ramp is ready!')
    },
    celebrate() {
      announce('Purple Cougar is celebrating!')
    },
    announce,
    setSoundMuted(nextMuted) {
      muted = nextMuted
      sound.textContent = muted ? '🔇' : '🔊'
      sound.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on')
    },
    onSoundToggle(listener) {
      soundListener = listener
    },
  }
}
