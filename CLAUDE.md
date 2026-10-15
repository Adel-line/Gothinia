# Gothinia

Scroll-driven documentary on how Gothic architecture works, told as a **mason's drawing brought to life** in SVG. See `VISION.md` for the intent.

## The real project

`index.html` -> `src/svg/main.ts`. That is the site. Everything else is either shared data or retired.

## Structure (`src/svg/`)

- `main.ts`: entry point. Builds the scenes, maps scroll to scene progress, drives the overlay text.
- `geometry.ts`: shared geometry in SVG units (origin at rose centre, +y down, 100 = edge of glazing); everything is true arcs and straight lines, set out "with compass and rule".
- `rose.ts`: the rose window (after Notre-Dame's south rose). Scene 1.
- `archScene.ts`: pointed arch, string course, claire-voie. Scene 2.
- `swarm.ts`: the transition that melts one drawing's lines and lands them as the next.
- `vaultScene.ts`: rib vault in perspective. Scene 3.
- `dom.ts`: shared helpers (`el`, `ramp`, `ease`, `lerp`, draw/opacity setters).
- `svg.css`: styles. Section copy lives in `src/content/sections.ts`.

Scenes are pure functions of scroll progress, so scrolling must stay seamless in both directions. Don't add stateful one-way animation.

## Run and build

- `npm install`
- `npm run dev`: Vite dev server, serves `index.html`.
- `npm run build`: `tsc -b && vite build`. Strict TS with `noUnusedLocals`/`noUnusedParameters`, so unused code fails the build.
- `npm run preview`: serve the built `dist/`.

## Retired: the 3D version

The React Three Fiber version (`3d.html`, `src/main.tsx`, `src/App.tsx`, `src/three/`, `src/scenes/`, `src/overlay/`, `src/scroll/`, `public/textures/`, `tools/`) is kept for reference only. Do not extend it or fix bugs in it. `3d.html` is still a second Vite entry in `vite.config.ts`, which is why react/three deps remain in `package.json`. The SVG code does not import from it; the one shared module is `src/content/sections.ts`.

`References/` is source photography for the rose and stone; leave it alone.
