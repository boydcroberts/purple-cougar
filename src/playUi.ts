/** Minimal, child-readable feedback for the opening story. */
export interface PlayUi {
  showBallInvite(): void
  showBounce(count: number): void
  showRampReady(): void
  celebrate(): void
  announce(message: string): void
  /** A short visual fact card for a tapped garden, train, or wildlife detail. */
  showDiscovery(title: string, detail: string, fact: string): void
  /** Keeps the learning control out of the opening wake-and-ball story beat. */
  setExplorationEnabled(enabled: boolean): void
  /** Respect OS motion preferences for the visual discovery card. */
  setReducedMotion(reduced: boolean): void
  setSoundMuted(muted: boolean): void
  onSoundToggle(listener: (muted: boolean) => void): void
  onExplore(listener: () => void): void
}

export function createPlayUi(host: HTMLElement): PlayUi {
  const root = document.createElement('div')
  Object.assign(root.style, {
    position: 'fixed',
    inset: '0',
    pointerEvents: 'none',
    overflow: 'hidden',
    zIndex: '2',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(root)

  const live = document.createElement('span')
  live.setAttribute('aria-live', 'polite')
  live.setAttribute('aria-atomic', 'true')
  Object.assign(live.style, {
    position: 'absolute',
    width: '1px',
    height: '1px',
    overflow: 'hidden',
    clipPath: 'inset(50%)',
  } satisfies Partial<CSSStyleDeclaration>)
  root.appendChild(live)

  // Learning stays in a compact, transient visual card rather than narration:
  // the owner explicitly removed the voice, and a child should be able to keep
  // playing the ball while a grown-up reads the fact aloud if they want to.
  const discovery = document.createElement('section')
  discovery.setAttribute('aria-label', 'World discovery')
  discovery.setAttribute('aria-hidden', 'true')
  Object.assign(discovery.style, {
    position: 'fixed',
    left: 'max(16px, env(safe-area-inset-left))',
    bottom: 'max(16px, env(safe-area-inset-bottom))',
    width: 'min(244px, calc(100vw - 32px))',
    padding: '9px 11px 10px',
    border: '1px solid rgba(255,255,255,0.24)',
    borderRadius: '13px',
    background: 'rgba(38, 26, 56, 0.74)',
    color: '#fffdf8',
    boxShadow: '0 7px 20px rgba(24, 13, 34, 0.18)',
    fontFamily: 'ui-rounded, "Avenir Next", system-ui, sans-serif',
    pointerEvents: 'none',
    opacity: '0',
    transform: 'translate(0, 10px) scale(0.98)',
    transition: 'opacity 180ms ease, transform 220ms cubic-bezier(.2,.8,.2,1)',
  } satisfies Partial<CSSStyleDeclaration>)
  root.appendChild(discovery)

  const discoveryTitle = document.createElement('strong')
  Object.assign(discoveryTitle.style, {
    display: 'block',
    fontSize: '14px',
    lineHeight: '1.1',
    letterSpacing: '0.01em',
  } satisfies Partial<CSSStyleDeclaration>)
  discovery.appendChild(discoveryTitle)

  const discoveryDetail = document.createElement('span')
  Object.assign(discoveryDetail.style, {
    display: 'block',
    marginTop: '2px',
    color: '#f1dbff',
    fontSize: '11px',
    fontStyle: 'italic',
    lineHeight: '1.25',
  } satisfies Partial<CSSStyleDeclaration>)
  discovery.appendChild(discoveryDetail)

  const discoveryFact = document.createElement('span')
  Object.assign(discoveryFact.style, {
    display: 'block',
    marginTop: '5px',
    color: '#fffaf0',
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.3',
  } satisfies Partial<CSSStyleDeclaration>)
  discovery.appendChild(discoveryFact)

  const sound = document.createElement('button')
  sound.type = 'button'
  sound.setAttribute('aria-label', 'Sound on')
  sound.textContent = '🔊'
  Object.assign(sound.style, {
    position: 'fixed',
    top: 'max(14px, env(safe-area-inset-top))',
    right: 'max(14px, env(safe-area-inset-right))',
    width: '40px',
    height: '40px',
    border: '1px solid rgba(255,255,255,0.58)',
    borderRadius: '50%',
    background: 'rgba(47, 36, 63, 0.34)',
    color: '#fffdf5',
    font: '700 20px/1 system-ui, sans-serif',
    boxShadow: '0 2px 9px rgba(26,12,39,0.13)',
    pointerEvents: 'auto',
    cursor: 'pointer',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(sound)

  // This compact companion control gives keyboard and assistive-technology
  // users an intentional way into the garden facts without putting a panel
  // over the world. It stays out of sight until the opening beat is complete.
  const explore = document.createElement('button')
  explore.type = 'button'
  explore.setAttribute('aria-label', 'Explore the garden')
  explore.textContent = '🌿'
  explore.disabled = true
  Object.assign(explore.style, {
    position: 'fixed',
    top: 'max(14px, env(safe-area-inset-top))',
    left: 'max(14px, env(safe-area-inset-left))',
    width: '40px',
    height: '40px',
    border: '1px solid rgba(255,255,255,0.58)',
    borderRadius: '50%',
    background: 'rgba(41, 81, 52, 0.4)',
    color: '#fffdf5',
    font: '700 19px/1 system-ui, sans-serif',
    boxShadow: '0 2px 9px rgba(16,42,25,0.13)',
    pointerEvents: 'auto',
    cursor: 'not-allowed',
    opacity: '0',
    display: 'none',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(explore)

  let muted = false
  let reducedMotion = false
  let soundListener: ((isMuted: boolean) => void) | null = null
  let exploreListener: (() => void) | null = null
  let discoveryTimer: number | null = null
  sound.addEventListener('click', () => {
    muted = !muted
    sound.textContent = muted ? '🔇' : '🔊'
    sound.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on')
    soundListener?.(muted)
  })
  explore.addEventListener('click', () => {
    if (!explore.disabled) exploreListener?.()
  })

  function announce(message: string): void {
    live.textContent = message
  }

  function updateDiscoveryMotion(): void {
    discovery.style.transition = reducedMotion
      ? 'none'
      : 'opacity 180ms ease, transform 220ms cubic-bezier(.2,.8,.2,1)'
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
    showDiscovery(title, detail, fact) {
      discoveryTitle.textContent = title
      discoveryDetail.textContent = detail
      discoveryFact.textContent = fact
      discovery.setAttribute('aria-hidden', 'false')
      discovery.style.opacity = '1'
      discovery.style.transform = 'translate(0, 0) scale(1)'
      announce(`${title}. ${fact}`)
      if (discoveryTimer !== null) window.clearTimeout(discoveryTimer)
      discoveryTimer = window.setTimeout(() => {
        discovery.style.opacity = '0'
        discovery.style.transform = 'translate(0, 10px) scale(0.98)'
        discovery.setAttribute('aria-hidden', 'true')
        discoveryTimer = null
      }, 2600)
    },
    setExplorationEnabled(enabled) {
      explore.disabled = !enabled
      explore.style.cursor = enabled ? 'pointer' : 'not-allowed'
      explore.style.display = enabled ? 'grid' : 'none'
      explore.style.opacity = enabled ? '1' : '0'
      explore.setAttribute(
        'aria-label',
        enabled ? 'Explore the garden' : 'Explore the garden after the first ball tap',
      )
    },
    setReducedMotion(nextReducedMotion) {
      reducedMotion = nextReducedMotion
      updateDiscoveryMotion()
    },
    setSoundMuted(nextMuted) {
      muted = nextMuted
      sound.textContent = muted ? '🔇' : '🔊'
      sound.setAttribute('aria-label', muted ? 'Sound off' : 'Sound on')
    },
    onSoundToggle(listener) {
      soundListener = listener
    },
    onExplore(listener) {
      exploreListener = listener
    },
  }
}
