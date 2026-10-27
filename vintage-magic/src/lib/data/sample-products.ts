import type { DiagramId, Product } from "../types";

/**
 * SAMPLE ARCHIVE — replace with real database content.
 *
 * This is the seed for the file-backed development repository (`data/db.json`). When Supabase
 * is configured the seed is ignored and the `products` table is the only source of truth.
 * Nothing here is a claim about an actual garment: the pieces, prices, eras and measurements
 * are illustrative sample data used to build and test the shop.
 *
 * Three entries carry no photograph on purpose. They are documented by their cut diagram and
 * rendered with a "plate only" label, which is how a real archive records a piece before a
 * studio day - and it keeps the shop honest instead of inventing imagery for an item nobody
 * has photographed.
 */

interface SeedInput {
  id: string;
  slug: string;
  name: string;
  era: string | null;
  categories: Product["categories"];
  genders: Product["genders"];
  sizeLabel: string | null;
  priceCents: number;
  quantity: number;
  images: Product["images"];
  diagram: DiagramId | null;
  measurements?: Product["measurements"];
  condition?: string | null;
  description?: string | null;
  provenance?: string | null;
  annotations?: Product["annotations"];
  featured?: boolean;
  createdAt: string;
}

const SEED_INPUT: SeedInput[] = [
  {
    id: "vm-0001",
    slug: "rooftop-camel-coat",
    name: "Rooftop Camel Coat",
    era: "1970s",
    categories: ["jackets"],
    genders: ["women"],
    sizeLabel: "M",
    priceCents: 26000,
    quantity: 1,
    images: [{ src: "/media/hero-coat.jpg", alt: "Oversized camel wool coat photographed flat on paper" }],
    diagram: "coat",
    measurements: [
      { label: "Shoulder", value: "44 cm" },
      { label: "Sleeve", value: "60 cm" },
      { label: "Length", value: "108 cm" },
      { label: "Chest, flat", value: "54 cm" },
    ],
    condition: "Original lining intact. Two small moth repairs at the left shoulder, felted closed.",
    description:
      "A heavy camel coat cut wide enough to wear over everything else you own. The lapels are padded by hand and hold their shape on their own; the hem was let down once, by somebody taller than you probably are.",
    provenance: "From a Hamra apartment clear-out",
    annotations: [
      { label: "01", note: "Hand-padded lapel", x: 0.42, y: 0.24, side: "right" },
      { label: "02", note: "Hem let down once", x: 0.55, y: 0.86, side: "left" },
    ],
    featured: true,
    createdAt: "2024-11-02T09:00:00.000Z",
  },
  {
    id: "vm-0002",
    slug: "souk-leather-jacket",
    name: "Souk Leather Jacket",
    era: "1970s",
    categories: ["jackets"],
    genders: ["unisex"],
    sizeLabel: "L",
    priceCents: 34000,
    quantity: 1,
    images: [{ src: "/media/p01-leather-jacket.jpg", alt: "Worn brown leather motorcycle jacket" }],
    diagram: "jacket",
    measurements: [
      { label: "Shoulder", value: "47 cm" },
      { label: "Chest, flat", value: "58 cm" },
      { label: "Length", value: "62 cm" },
    ],
    condition: "Leather softened, not cracked. Zip replaced in the 1990s by a cobbler, not by us.",
    description:
      "Asymmetric zip, an off-centre pocket that only ever held bus tickets, and a collar that has given up trying to stand up. It smells faintly of cedar.",
    featured: true,
    createdAt: "2024-10-24T09:00:00.000Z",
  },
  {
    id: "vm-0003",
    slug: "ashrafiye-silk-camp-shirt",
    name: "Ashrafiye Silk Camp Shirt",
    era: "1970s",
    categories: ["shirts"],
    genders: ["men"],
    sizeLabel: "M",
    priceCents: 9500,
    quantity: 1,
    images: [{ src: "/media/p02-silk-shirt.jpg", alt: "Cream silk camp shirt with a faint olive stripe" }],
    diagram: "shirt",
    measurements: [
      { label: "Chest, flat", value: "56 cm" },
      { label: "Length", value: "72 cm" },
    ],
    condition: "One small darn at the cuff, done well. No stains under daylight.",
    description:
      "Silk with a stripe so faint it only shows in photographs. Open collar, boxy body, one button replaced with a slightly wrong one, which is the correct outcome.",
    annotations: [{ label: "03", note: "Replaced button, does not match", x: 0.5, y: 0.38, side: "left" }],
    featured: true,
    createdAt: "2024-12-08T09:00:00.000Z",
  },
  {
    id: "vm-0004",
    slug: "olive-herringbone-trousers",
    name: "Olive Herringbone Trousers",
    era: "1980s",
    categories: ["trousers"],
    genders: ["women"],
    sizeLabel: "38",
    priceCents: 12000,
    quantity: 1,
    images: [{ src: "/media/p03-wool-trousers.jpg", alt: "High-waisted wide-leg wool trousers in faded olive" }],
    diagram: "trousers",
    measurements: [
      { label: "Waist, flat", value: "35 cm" },
      { label: "Inseam", value: "74 cm" },
      { label: "Rise", value: "32 cm" },
    ],
    condition: "Waistband re-tacked. Original side adjusters still work.",
    description:
      "A high waist with enough leg to make a pair of boots worth owning. The olive has faded to the colour of dried hay wherever it was folded.",
    createdAt: "2024-11-19T09:00:00.000Z",
  },
  {
    id: "vm-0005",
    slug: "gabardine-trench-sand",
    name: "Gabardine Trench, Sand",
    era: "1970s",
    categories: ["jackets"],
    genders: ["unisex"],
    sizeLabel: "L",
    priceCents: 21000,
    quantity: 1,
    images: [{ src: "/media/p04-trench.jpg", alt: "Sand cotton gabardine trench coat with its belt" }],
    diagram: "coat",
    measurements: [
      { label: "Shoulder", value: "48 cm" },
      { label: "Sleeve", value: "62 cm" },
      { label: "Length", value: "118 cm" },
    ],
    condition: "Belt is original and keeps its buckle. The storm flap has a fray we chose not to cut away.",
    description:
      "The kind of coat that makes a bad day look deliberate. Deep pockets, a throat latch, and enough back length to sit in.",
    featured: true,
    createdAt: "2025-01-11T09:00:00.000Z",
  },
  {
    id: "vm-0006",
    slug: "bleached-denim-trucker",
    name: "Bleached Denim Trucker",
    era: "1980s",
    categories: ["jackets"],
    genders: ["women"],
    sizeLabel: "S",
    priceCents: 13500,
    quantity: 1,
    images: [{ src: "/media/p05-denim-jacket.jpg", alt: "Faded indigo denim trucker jacket" }],
    diagram: "jacket",
    measurements: [
      { label: "Chest, flat", value: "50 cm" },
      { label: "Length", value: "54 cm" },
    ],
    condition: "Copper buttons tarnished evenly. One cuff button sewn on twice.",
    description:
      "Sun and laundry did the fading, not a factory. Cropped in the way it was always cut, which is why it still looks right.",
    createdAt: "2025-02-02T09:00:00.000Z",
  },
  {
    id: "vm-0007",
    slug: "caramel-cashmere-roll-neck",
    name: "Caramel Cashmere Roll-Neck",
    era: "1970s",
    categories: ["shirts"],
    genders: ["unisex"],
    sizeLabel: "M",
    priceCents: 17500,
    quantity: 1,
    images: [{ src: "/media/p06-cashmere-sweater.jpg", alt: "Caramel cashmere roll-neck sweater" }],
    diagram: "shirt",
    measurements: [
      { label: "Chest, flat", value: "55 cm" },
      { label: "Sleeve", value: "63 cm" },
      { label: "Length", value: "66 cm" },
    ],
    condition: "Lightly felted from washing, which is what cashmere does. No holes.",
    description: "A roll neck tall enough to hide behind. The caramel has gone the way caramel does when it likes the sun.",
    createdAt: "2025-01-28T09:00:00.000Z",
  },
  {
    id: "vm-0008",
    slug: "sun-bleached-linen-shirt",
    name: "Sun-Bleached Linen Shirt",
    era: "1980s",
    categories: ["shirts"],
    genders: ["men"],
    sizeLabel: "XL",
    priceCents: 7000,
    quantity: 1,
    images: [{ src: "/media/p07-linen-shirt.jpg", alt: "Oatmeal linen shirt with a soft open collar" }],
    diagram: "shirt",
    measurements: [
      { label: "Chest, flat", value: "62 cm" },
      { label: "Length", value: "78 cm" },
    ],
    condition: null,
    description:
      "Linen washed so often it no longer irons. The collar was cut away into something softer, probably by the person who wore it most.",
    createdAt: "2025-03-06T09:00:00.000Z",
  },
  {
    id: "vm-0009",
    slug: "charcoal-pleated-midi-skirt",
    name: "Charcoal Pleated Midi Skirt",
    era: "1970s",
    categories: ["trousers"],
    genders: ["women"],
    sizeLabel: "40",
    priceCents: 9500,
    quantity: 1,
    images: [{ src: "/media/p08-pleated-skirt.jpg", alt: "Charcoal wool pleated midi skirt" }],
    diagram: "skirt",
    measurements: [
      { label: "Waist, flat", value: "36 cm" },
      { label: "Length", value: "78 cm" },
    ],
    condition: "Pleats have relaxed at the hem, which is what wool pleats do after fifty years.",
    description: "Twelve pleats, a zip that needs convincing, and a hem swing that only weighted wool produces.",
    createdAt: "2025-04-14T09:00:00.000Z",
  },
  {
    id: "vm-0010",
    slug: "burgundy-velvet-slip-dress",
    name: "Burgundy Velvet Slip Dress",
    era: "1970s",
    categories: ["dresses"],
    genders: ["women"],
    sizeLabel: "S",
    priceCents: 18500,
    quantity: 0,
    images: [{ src: "/media/p09-velvet-dress.jpg", alt: "Bias-cut burgundy velvet slip dress" }],
    diagram: "dress",
    measurements: [
      { label: "Bust, flat", value: "44 cm" },
      { label: "Length", value: "112 cm" },
    ],
    condition: "Pile crushed at the waist, where it was always sat on. Bias cut holds its shape.",
    description:
      "Cut on the bias so it falls instead of hanging. Collected already; the record stays because the dress was worth recording.",
    featured: true,
    createdAt: "2025-02-20T09:00:00.000Z",
  },
  {
    id: "vm-0011",
    slug: "night-market-sequin-dress",
    name: "Night Market Sequin Dress",
    era: "1980s",
    categories: ["dresses"],
    genders: ["women"],
    sizeLabel: "M",
    priceCents: 24000,
    quantity: 1,
    images: [],
    diagram: "dress",
    measurements: [
      { label: "Bust, flat", value: "46 cm" },
      { label: "Length", value: "124 cm" },
    ],
    condition: "Back zip works. Roughly forty sequins are missing and the dress is better for it.",
    description:
      "Weighted with hand-set sequins, which is why it hangs straight instead of skimming. Loud in the right room, absurd in most others.",
    createdAt: "2025-05-09T09:00:00.000Z",
  },
  {
    id: "vm-0012",
    slug: "printed-silk-square-olive",
    name: "Printed Silk Square, Olive",
    era: "1970s",
    categories: ["accessories"],
    genders: ["unisex"],
    sizeLabel: "90 × 90 cm",
    priceCents: 4500,
    quantity: 2,
    images: [],
    diagram: "scarf",
    measurements: [{ label: "Size", value: "90 × 90 cm" }],
    condition: "Fold lines are set. Hem rolled by hand.",
    description:
      "An abstract botanical print in colours that were fashionable for exactly four years and now look timeless. Two squares in the drawer, so this one is not the last.",
    createdAt: "2025-03-18T09:00:00.000Z",
  },
  {
    id: "vm-0013",
    slug: "ink-beaded-evening-purse",
    name: "Ink Beaded Evening Purse",
    era: "1960s",
    categories: ["accessories"],
    genders: ["women"],
    sizeLabel: null,
    priceCents: 12000,
    quantity: 1,
    images: [],
    diagram: "purse",
    measurements: [
      { label: "Width", value: "18 cm" },
      { label: "Depth", value: "5 cm" },
    ],
    condition: "Brass frame tarnished and still snaps shut. One bead missing at the lower corner.",
    description: "Thousands of tiny glass beads on a frame that clicks. Fits a lip colour, a key and one folded note, which was the assignment.",
    createdAt: "2025-04-21T09:00:00.000Z",
  },
];

export const SAMPLE_PRODUCTS: Product[] = SEED_INPUT.map((input) => ({
  id: input.id,
  slug: input.slug,
  name: input.name,
  era: input.era,
  categories: input.categories,
  genders: input.genders,
  sizeLabel: input.sizeLabel,
  measurements: input.measurements ?? [],
  condition: input.condition ?? null,
  description: input.description ?? null,
  priceCents: input.priceCents,
  quantity: input.quantity,
  images: input.images,
  diagram: input.diagram,
  annotations: input.annotations ?? [],
  featured: input.featured ?? false,
  archived: false,
  provenance: input.provenance ?? null,
  createdAt: input.createdAt,
  updatedAt: input.createdAt,
}));

/** Shown in the interface while the app is serving sample data instead of a real database. */
export const SAMPLE_DATA_NOTICE =
  "Sample archive shipped with the build. Connect a database or edit pieces in /admin - this data is not live stock.";
