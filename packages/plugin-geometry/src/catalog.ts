/**
 * Form catalog — plain geometric names + book citations.
 * Popular / historical nicknames may appear only as search keywords, never as UI labels.
 */
export type FormId =
  | 'two-circle'
  | 'cord-triples'
  | 'equal-shadows'
  | 'square-module-grid'
  | 'turned-square'
  | 'root-rectangle'
  | 'extreme-mean'
  | 'regular-pentagon'
  | 'fibonacci-squares'
  | 'log-spiral'
  | 'archimedean-spiral'
  | 'regular-polygon'
  | 'tilings'
  | 'hex-circle-lattice'
  | 'regular-solids'
  | 'archimedean-solids'
  | 'room-proportions'
  | 'hanging-chain'
  | 'minimal-surface'
  | 'similar-triangles'

export type FormDef = {
  id: FormId
  /** Plain geometric UI label — never a mystical name. */
  label: string
  book: string
  link: string
  note: string
  /** Optional search-only keywords (not shown as titles). */
  keywords?: string[]
}

export const FORMS: readonly FormDef[] = [
  {
    id: 'two-circle',
    label: 'Two-circle construction',
    book: 'Euclid, Elements I.1',
    link: 'https://mathcs.clarku.edu/~djoyce/java/elements/',
    note: 'Equilateral triangle, perpendicular bisector, and the lens (√3 : 1).',
    keywords: ['lens'],
  },
  {
    id: 'cord-triples',
    label: 'Right angle from cord triples',
    book: 'Śulbasūtras',
    link: 'https://en.wikipedia.org/wiki/Shulba_Sutras',
    note: '3-4-5, 5-12-13, 8-15-17.',
  },
  {
    id: 'equal-shadows',
    label: 'North–south from equal shadows',
    book: 'Vitruvius I.6',
    link: 'https://www.gutenberg.org/files/20239/20239-h/20239-h.htm',
    note: 'Gnomon, circle, and bisector.',
  },
  {
    id: 'square-module-grid',
    label: 'Square module grid',
    book: 'Hyginus; Mayamata',
    link: 'https://archive.org/details/dieschriftenderr01blum',
    note: 'n × n modules (8×8 and 9×9 presets).',
  },
  {
    id: 'turned-square',
    label: 'Square turned 45° inside a square',
    book: 'Roriczer 1486',
    link: 'https://archive.org/details/bub_gb_aHo_AAAAcAAJ',
    note: 'Repeated ad quadratum steps.',
  },
  {
    id: 'root-rectangle',
    label: 'Root rectangles',
    book: 'Euclid; Hambidge 1920',
    link: 'https://archive.org/details/dynamicsymmetry00hamb',
    note: '√2, √3, √5 from diagonals.',
  },
  {
    id: 'extreme-mean',
    label: 'Extreme and mean ratio',
    book: 'Euclid VI.30',
    link: 'https://mathcs.clarku.edu/~djoyce/java/elements/',
    note: 'Divide a line; φ rectangle; whirling squares.',
  },
  {
    id: 'regular-pentagon',
    label: 'Regular pentagon and diagonals',
    book: 'Euclid IV.11',
    link: 'https://mathcs.clarku.edu/~djoyce/java/elements/',
    note: 'Diagonal : side = φ.',
  },
  {
    id: 'fibonacci-squares',
    label: 'Fibonacci squares',
    book: 'Fibonacci, Liber Abaci 1202',
    link: 'https://archive.org/details/bub_gb_w86fLKi88pYC',
    note: 'Common in plants — not a universal law.',
  },
  {
    id: 'log-spiral',
    label: 'Logarithmic spiral',
    book: 'Dürer 1525',
    link: 'https://commons.wikimedia.org/wiki/Category:Underweysung_der_Messung',
    note: 'Pitch parameter; golden pitch is a preset, not the default.',
  },
  {
    id: 'archimedean-spiral',
    label: 'Archimedean spiral',
    book: 'Dürer 1525',
    link: 'https://commons.wikimedia.org/wiki/Category:Underweysung_der_Messung',
    note: 'Constant spacing.',
  },
  {
    id: 'regular-polygon',
    label: 'Regular polygons',
    book: 'Euclid IV; Dürer',
    link: 'https://commons.wikimedia.org/wiki/Category:Underweysung_der_Messung',
    note: '3–13 sides; exact where possible.',
  },
  {
    id: 'tilings',
    label: 'Regular and semiregular tilings',
    book: 'Kepler 1619',
    link: 'https://archive.org/details/ioanniskepplerih00kepl',
    note: '3 regular and 8 semiregular.',
  },
  {
    id: 'hex-circle-lattice',
    label: 'Hexagonal lattice of equal circles',
    book: 'Kepler 1611',
    link: 'https://archive.org/details/ioanniskepleriss00kepl',
    note: 'Grown ring by ring, with erase and repair.',
  },
  {
    id: 'regular-solids',
    label: 'Five regular solids',
    book: 'Euclid XIII',
    link: 'https://mathcs.clarku.edu/~djoyce/java/elements/',
    note: 'Standing in 3D.',
  },
  {
    id: 'archimedean-solids',
    label: 'Thirteen Archimedean solids',
    book: 'Pacioli 1509; Kepler',
    link: 'https://archive.org/details/divinaproportion00paci',
    note: 'Uniform polyhedra with regular faces.',
  },
  {
    id: 'room-proportions',
    label: 'Room proportion checker',
    book: 'Alberti 1485; Palladio 1570',
    link: 'https://www.c82.net/architecture/book1',
    note: "Alberti's nine ratios and Palladio's seven room shapes.",
  },
  {
    id: 'hanging-chain',
    label: 'Hanging-chain arch guide',
    book: 'Hooke 1675',
    link: 'https://archive.org/details/LectionesCutler00Hook',
    note: '2D guide; 3D arch is H16.2.',
  },
  {
    id: 'minimal-surface',
    label: 'Minimal surface on a closed curve',
    book: 'Plateau 1873',
    link: 'https://www.digitale-sammlungen.de/en/details/bsb11160319',
    note: 'Reuses the soap-film generator.',
  },
  {
    id: 'similar-triangles',
    label: 'Similar triangles (height by sighting)',
    book: 'Hero, Dioptra; Liu Hui',
    link: 'https://archive.org/details/heronisalexandri03hero',
    note: 'Height of a tree or wall from two sightings or a shadow.',
  },
] as const

export function formById(id: FormId): FormDef {
  const f = FORMS.find((x) => x.id === id)
  if (!f) throw new Error(`unknown form ${id}`)
  return f
}
