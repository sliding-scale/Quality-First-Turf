/* The logo each business shows in the sidebar (D-112). Quality First Turf Landscape and Construction share the Quality First Turf
   logo; Quality First Patios has its own. Files live in public/brand. The height is always 30px, so the width keeps each file's shape. */

export type BrandLogo = { src: string; width: number; height: number };

const TURF: BrandLogo = { src: "/brand/logo-full.png", width: 39, height: 30 };
const PATIOS: BrandLogo = { src: "/brand/QFP-logo.png", width: 67, height: 30 }; // the file is 800 x 357

export function brandLogo(slug: string): BrandLogo {
  return slug === "quality-first-patios" ? PATIOS : TURF;
}
