/** The only text on screen is a numeral. The player cannot read. */
export interface Hud {
  setTotal(n: number): void
  pop(): void
}

export function createHud(host: HTMLElement): Hud {
  const el = document.createElement('div')
  el.setAttribute('aria-hidden', 'true')
  Object.assign(el.style, {
    position: 'fixed',
    top: 'max(16px, env(safe-area-inset-top))',
    left: '0',
    right: '0',
    textAlign: 'center',
    font: '700 84px/1 system-ui, -apple-system, sans-serif',
    color: '#fffdf5',
    textShadow: '0 4px 0 rgba(0,0,0,0.22)',
    pointerEvents: 'none',
    transition: 'transform 120ms ease-out',
    transform: 'scale(1)',
  } satisfies Partial<CSSStyleDeclaration>)
  host.appendChild(el)

  let popTimer: number | undefined

  return {
    setTotal(n) {
      el.textContent = String(n)
    },
    pop() {
      el.style.transform = 'scale(1.28)'
      window.clearTimeout(popTimer)
      popTimer = window.setTimeout(() => {
        el.style.transform = 'scale(1)'
      }, 120)
    },
  }
}
