# GOTHINIA

*"An interactive journey through the birth of Gothic architecture."*

---

# Project Vision

GOTHINIA is not a website.

It is not a museum.

It is not a game.

It is a scroll-driven documentary in which the visitor discovers how Gothic architecture works by watching a mason's drawing come to life.

Scrolling should feel like looking over the shoulder of a master mason as he sets out the building with compass and rule.

The experience should evoke awe, curiosity and wonder rather than simply presenting information.

The architecture is the protagonist.

---

# Core Philosophy

Every design decision should answer one question:

> Does this make the visitor feel they are watching a real medieval mason work out how a cathedral stands up?

If the answer is no, it should not be implemented.

---

# The Drawing

The whole site is a single drawing.

Pale lines on dark vellum, struck from true arcs and straight lines, set out as the masons did: a centre, a compass, a rule.

No photographs. No textures. No render.

The drawing is not a diagram of the cathedral. It is how the cathedral was thought.

Construction lines appear first, then the stone is drawn over them, and the guides stay as faint ghosts of the geometry underneath.

Lines are drawn, never faded in. Scrolling forward draws them. Scrolling back un-draws them.

---

# Emotional Goals

The visitor should feel:

• tiny
• curious
• peaceful
• amazed
• contemplative
• inspired

Never:

• frightened
• overwhelmed
• confused
• rushed
• distracted

---

# Keywords

timeless

monumental

sacred

elegant

stone

light

silence

verticality

craftsmanship

history

engineering

---

# Design Principles

Less UI.

More architecture.

Less explanation.

More discovery.

Less decoration.

More authenticity.

The geometry itself should tell the story.

---

# Narrative

The visitor begins extremely close to a detail.

They don't initially understand what they're looking at.

As they scroll, they slowly discover how it was made:

• the rose and its tracery
• the pointed arch
• the clustered pier
• the clerestory
• the rib vault

Every reveal should answer a question while introducing a new one.

---

# Story Structure

Scene 1

The Rose Window

Question:

"What am I looking at?"

The south rose of Notre-Dame is set out ring by ring: the centre, the twelve lights, the doubling to twenty-four.

"How can stone become something so delicate?"

↓

The rose melts. Its lines are the same lines, and they land as the next drawing.

↓

Scene 2

The Pointed Arch

"Why aren't these arches round?"

Two arcs, each struck from the opposite side. The string course, the clustered pier, the clerestory lancets under the rose.

↓

The arches melt and land as the next drawing.

↓

Scene 3

The Rib Vault

"How can this ceiling stay standing?"

A nave of bays in perspective. Two diagonal ribs, four pointed arches, a thin shell between. The weight runs down the ribs into the piers, and the walls are free to become glass.

The visitor understands the engineering.

*Still to come: columns, flying buttresses, the whole cathedral. If they are added, they are drawn the same way and the same lines carry over.*

---

# Transitions

One drawing does not cut to the next. Its lines melt and land as the next.

The visitor should never feel a cut, only that the same marks have found a new meaning.

---

# Movement

Everything is a pure function of scroll.

Scrolling forward and back must be seamless. No one-way animation, no triggers, no timers.

The visitor controls the pace entirely.

Every movement should feel heavy and deliberate.

Never:

- snap
- bounce
- accelerate quickly

Always:

- smooth easing
- slow reveals
- deliberate framing

Even the vault's change of viewpoint is part of the drawing: it should feel like a patient draughtsman turning the sheet, not a software camera.

---

# Visual Style

True geometry.

The drawing must be right: true arcs, correct proportions, real construction.

Stylization is limited to the nature of drawing itself: line weights, ghost guides, a few quiet marks.

---

# Architecture References

Primary:

Notre-Dame de Paris (the south rose)

Sainte-Chapelle

Amiens Cathedral

Chartres Cathedral

Saint-Denis Basilica

Milan Cathedral

Never invent fantasy architecture.

Every architectural element should be inspired by real Gothic structures.

---

# Colour and Line

A dark ground, almost black, warm.

Ink the colour of old chalk or silverpoint: a pale warm cream.

Guide lines in a dimmer, browner tone, dashed.

Stone shapes in a barely lighter fill than the ground.

That is the whole palette.

Never glossy. Never neon. Never saturated.

Light, the cathedral's great subject, is implied by what the drawing shows: the glazing, the open walls, the narrow lancets. Colour belongs to the glass, which the words describe and the drawing leaves empty.

---

# Atmosphere

The drawing should feel quiet and unhurried.

Large areas of empty ground.

Nothing decorative that does not belong to the geometry.

Everything remains understated.

---

# Audio

Minimal, if used at all.

Almost silent.

Occasional:

- distant birds
- subtle wind
- footsteps
- quiet choir
- wooden creaks

No music that dominates the experience.

Silence is part of the atmosphere.

---

# Scroll Behaviour

Scrolling is drawing.

Not zooming.

Not playing a video.

Each notch of the wheel puts a few more lines on the sheet.

The visitor progresses naturally through the building, one drawing at a time.

---

# UI

UI should almost disappear.

Typography:

Elegant.

Quiet.

Readable.

Large margins.

Never block important architecture.

Animations:

Fade.

Slide.

Opacity.

No bouncing.

No flashy motion.

---

# Educational Content

Never write like Wikipedia.

Instead:

Tell stories.

Explain engineering.

Create curiosity.

Example:

Bad:

"The pointed arch distributes loads more efficiently."

Better:

"The pointed arch allowed builders to reach heights that had once seemed impossible."

Teach through wonder.

Section copy lives in `src/content/sections.ts` and can be replaced without touching code.

---

# Technical Direction

SVG, drawn in code. No images, no models, no WebGL.

Prioritize:

Geometry

Composition

Line weight

Timing against scroll

Visual storytelling

Do not add complexity unless it improves the drawing.

---

# Performance Goals

Target:

Smooth scrolling on a laptop.

Fast loading, with nothing to download but the page itself.

---

# Things to Avoid

Do not create fantasy castles.

Do not exaggerate Gothic proportions.

Do not fake the geometry. If an arc is not a true arc, it is wrong.

Do not add textures, gradients or glow to imitate realism.

Do not use saturated neon colors.

Do not use game UI.

Do not create visual clutter.

Do not add interactions that interrupt the drawing.

---

# Success Criteria

A visitor should finish the experience and think:

"I finally understand why Gothic cathedrals look the way they do."

Not:

"That was a cool website."
