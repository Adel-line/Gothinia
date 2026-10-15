# Gothinia

Scroll-driven documentary on how Gothic architecture works, told as a **mason's drawing brought to life** in SVG. See `VISION.md` for the intent.

## The real project

`index.html` -> `src/svg/main.ts`. That is the site. Everything else is shared data or support material.

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

The React Three Fiber version has been removed from the tree (`3d.html`, `src/three/`, `src/scenes/`, `src/overlay/`, `src/scroll/` and the react/three dependencies). Its code is kept at the git tag `archive/3d-version`. Do not bring it back or extend it. The only build dependencies now are vite and typescript.

`References/` is source photography for the rose and stone; leave it alone.
