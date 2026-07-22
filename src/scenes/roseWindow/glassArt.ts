import type { Opening } from './tracery'

/**
 * Gothic stained-glass art system for the rose (Scene 1).
 *
 * This is the DATA layer: it turns each tracery opening into a compact,
 * declarative GlassArtwork "recipe" — colour regions, a decorative border, a
 * field pattern, a symbolic motif and imperfection seed — which the pane
 * compositor material renders procedurally. No geometry, no textures.
 *
 * The assignment is an iconographic PROGRAM after Sainte-Chapelle / French
 * Rayonnant, not a hash: a gold sun at the heart, a royal blue/red heraldic
 * wreath (fleurs-de-lis and castles of Castile), a foliate celestial middle
 * band with green life and violet star-gems, and a luminous grisaille frame.
 */

// ---------------------------------------------------------------------------
// Named medieval pot-metal palette (nominal sRGB; the shader deepens + varies)
// ---------------------------------------------------------------------------
export const GLASS_COLORS = {
  cobalt: '#1b3d92', // Chartres blue — primary
  ruby: '#8f1522', // primary
  gold: '#d7a53c', // silver-stain — the drawing/border colour
  emerald: '#1f6b46', // foliage accent
  murrey: '#5a2e6e', // violet — rare accent
  grisaille: '#c6c1a2', // neutral silvery — the light zones
  white: '#e8e3cf', // highlight
} as const
export type GlassColorName = keyof typeof GLASS_COLORS

// Numeric codes (used directly as shader uniforms)
export enum Motif {
  None = 0,
  Sunburst = 1,
  Rosette = 2,
  FleurDeLis = 3,
  Castle = 4,
  Star6 = 5,
  Trefoil = 6,
  Knot = 7,
  LeafSpray = 8,
  Cross = 9,
}
export enum Field {
  Plain = 0,
  Diaper = 1,
  Grisaille = 2,
  Crosshatch = 3,
}
export enum Border {
  None = 0,
  Bead = 1,
  Dentil = 2,
  Foliate = 3,
  Plain = 4,
}
export enum Lead {
  Auto = 0,
  Radial = 1,
}

export interface GlassArtwork {
  ground: GlassColorName
  border: Border
  borderColor: GlassColorName
  /** border band width as a fraction of the pane's local radius */
  borderWidth: number
  field: Field
  fieldColor: GlassColorName
  motif: Motif
  motifColor: GlassColorName
  motifAccent: GlassColorName
  /** motif size relative to the pane */
  motifScale: number
  lead: Lead
  /** 0..1 deterministic per-pane seed for imperfections */
  seed: number
}

function seedOf(o: Opening): number {
  let h = (o.ring * 73856093) ^ (o.index * 19349663)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (Math.abs(h) % 1024) / 1024
}

/**
 * Ring families (from tracery.ts):
 *   0 twelve-foil oculus · 1 inner lancets · 2 quatrefoil nodes ·
 *   3 middle sub-lancets · 4 sexfoil head-foils · 5 sexfoil nodes ·
 *   6 outer fan lancets · 7 outer wreath circles · 8 spandrel triangles
 *
 * The iconographic program (after Sainte-Chapelle / French Rayonnant) reads
 * as concentric zones: a gold sun at the heart, a royal heraldic wreath, a
 * celestial foliate middle band with violet star-gems, then a luminous
 * grisaille outer fan ringed by jewelled medallions and spandrel gems.
 */
export function assignRoseArtwork(o: Opening): GlassArtwork {
  const even = o.index % 2 === 0
  const seed = seedOf(o)

  switch (o.ring) {
    // ---- ring 0 · central oculus: the radiant sun ----
    case 0:
      return {
        ground: 'cobalt',
        border: Border.Bead,
        borderColor: 'gold',
        borderWidth: 0.16,
        field: Field.Plain,
        fieldColor: 'cobalt',
        motif: Motif.Sunburst,
        motifColor: 'gold',
        motifAccent: 'white',
        motifScale: 0.94,
        lead: Lead.Radial,
        seed,
      }

    // ---- ring 1 · inner lancets: the heraldry of the crown ----
    case 1:
      return even
        ? {
            ground: 'cobalt',
            border: Border.Bead,
            borderColor: 'gold',
            borderWidth: 0.1,
            field: Field.Plain,
            fieldColor: 'cobalt',
            motif: Motif.FleurDeLis,
            motifColor: 'gold',
            motifAccent: 'gold',
            motifScale: 0.72,
            lead: Lead.Auto,
            seed,
          }
        : {
            ground: 'ruby',
            border: Border.Bead,
            borderColor: 'gold',
            borderWidth: 0.1,
            field: Field.Plain,
            fieldColor: 'ruby',
            motif: Motif.Castle,
            motifColor: 'gold',
            motifAccent: 'gold',
            motifScale: 0.72,
            lead: Lead.Auto,
            seed,
          }

    // ---- ring 2 · inner nodes: gold gems on blue ----
    case 2:
      return {
        ground: 'cobalt',
        border: Border.Plain,
        borderColor: 'gold',
        borderWidth: 0.09,
        field: Field.Plain,
        fieldColor: 'cobalt',
        motif: even ? Motif.Star6 : Motif.Rosette,
        motifColor: 'gold',
        motifAccent: 'white',
        motifScale: 0.72,
        lead: Lead.Auto,
        seed,
      }

    // ---- ring 3 · middle sub-lancets: foliage on the celestial field ----
    case 3:
      return {
        ground: even ? 'ruby' : 'cobalt',
        border: Border.Foliate,
        borderColor: 'gold',
        borderWidth: 0.12,
        field: Field.Diaper,
        fieldColor: even ? 'ruby' : 'cobalt',
        motif: Motif.LeafSpray,
        motifColor: 'emerald',
        motifAccent: 'gold',
        motifScale: 0.82,
        lead: Lead.Auto,
        seed,
      }

    // ---- ring 4 · middle head-foils: the violet star-gems ----
    case 4:
      return {
        ground: 'murrey',
        border: Border.Plain,
        borderColor: 'gold',
        borderWidth: 0.1,
        field: Field.Plain,
        fieldColor: 'murrey',
        motif: Motif.Knot,
        motifColor: 'gold',
        motifAccent: 'gold',
        motifScale: 0.78,
        lead: Lead.Auto,
        seed,
      }

    // ---- ring 5 · doubling-course nodes: rosette gems on blue ----
    case 5:
      return {
        ground: 'cobalt',
        border: Border.Plain,
        borderColor: 'gold',
        borderWidth: 0.09,
        field: Field.Plain,
        fieldColor: 'cobalt',
        motif: Motif.Rosette,
        motifColor: 'gold',
        motifAccent: 'white',
        motifScale: 0.74,
        lead: Lead.Auto,
        seed,
      }

    // ---- ring 6 · outer fan: the luminous grisaille lancets ----
    case 6:
      return {
        ground: 'grisaille',
        border: Border.Dentil,
        borderColor: 'gold',
        borderWidth: 0.13,
        field: Field.Grisaille,
        fieldColor: 'grisaille',
        motif: even ? Motif.Trefoil : Motif.FleurDeLis,
        motifColor: even ? 'ruby' : 'cobalt',
        motifAccent: 'gold',
        motifScale: 0.56,
        lead: Lead.Auto,
        seed,
      }

    // ---- ring 7 · outer wreath: the jewelled medallion ring ----
    case 7:
      return {
        ground: even ? 'ruby' : 'cobalt',
        border: Border.Bead,
        borderColor: 'gold',
        borderWidth: 0.12,
        field: Field.Plain,
        fieldColor: even ? 'ruby' : 'cobalt',
        motif: even ? Motif.Cross : Motif.Star6,
        motifColor: 'gold',
        motifAccent: 'white',
        motifScale: 0.66,
        lead: Lead.Auto,
        seed,
      }

    // ---- ring 8 · spandrel triangles: small emerald trefoil gems ----
    case 8:
    default:
      return {
        ground: 'emerald',
        border: Border.Plain,
        borderColor: 'gold',
        borderWidth: 0.1,
        field: Field.Plain,
        fieldColor: 'emerald',
        motif: Motif.Trefoil,
        motifColor: 'gold',
        motifAccent: 'white',
        motifScale: 0.66,
        lead: Lead.Auto,
        seed,
      }
  }
}
