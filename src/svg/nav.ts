import './nav.css'
import { sections, vaultSection } from '../content/sections'

/**
 * Side navigation: a mason's rule down the right edge with one tick per scene.
 * It only reads the scroll position and sets it, so it stays in step with the
 * drawing (a pure function of scroll) in both directions.
 */

// where each scene's text is fully shown, and where the next scene takes over,
// as a fraction of the page's scroll (see the timeline constants in main.ts)
const SCENES = [
  { id: 'rose', title: sections[0].title, at: 0.27, until: 0.35 },
  { id: 'arch', title: sections[1].title, at: 0.575, until: 0.69 },
  { id: 'vault', title: vaultSection.title, at: 0.985, until: Infinity },
]
const NUMERALS = ['I', 'II', 'III']

export function initNav(): void {
  const nav = document.createElement('nav')
  nav.className = 'scenes'
  nav.setAttribute('aria-label', 'Scenes')
  nav.innerHTML =
    '<span class="rule" aria-hidden="true"></span><ol>' +
    SCENES.map(
      (s, i) =>
        `<li><a href="#${s.id}" data-i="${i}"><span class="num" aria-hidden="true">${NUMERALS[i]}</span>` +
        `<span class="name">${s.title}</span><span class="tick" aria-hidden="true"></span></a></li>`,
    ).join('') +
    '</ol>'
  document.body.appendChild(nav)
  const links = [...nav.querySelectorAll<HTMLAnchorElement>('a')]

  const progress = () => {
    const max = document.documentElement.scrollHeight - innerHeight
    return max > 0 ? scrollY / max : 0
  }
  let shown = -1
  const sync = () => {
    const g = progress()
    const i = SCENES.findIndex((s) => g < s.until)
    nav.style.setProperty('--g', String(Math.min(1, g)))
    if (i === shown) return
    shown = i
    links.forEach((a, k) => {
      if (k === i) a.setAttribute('aria-current', 'true')
      else a.removeAttribute('aria-current')
    })
  }
  addEventListener('scroll', sync, { passive: true })
  addEventListener('resize', sync)
  sync()

  const reduced = matchMedia('(prefers-reduced-motion: reduce)')
  nav.addEventListener('click', (e) => {
    const a = (e.target as Element).closest<HTMLAnchorElement>('a')
    if (!a) return
    e.preventDefault()
    const max = document.documentElement.scrollHeight - innerHeight
    scrollTo({ top: SCENES[Number(a.dataset.i)].at * max, behavior: reduced.matches ? 'auto' : 'smooth' })
  })
}
