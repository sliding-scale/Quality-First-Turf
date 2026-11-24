/** The photo of each turf product the customer can pick on the form. Files are in `public/images/products` of both apps.
 *  The quote uses them so a line for a product the customer chose shows its picture (client notes, 2026-11-24). Pure TypeScript. */
const files: Record<string, string> = {
  "Players Choice": "Players Choice.webp",
  "Olive Natural": "Olive Natural.webp",
  "Cali's Finest Light": "Cali_s Finest Light.webp",
  Hollywood: "Hollywood.webp",
  "Spring Natural": "Spring Natural.webp",
  "La Jolla Lush": "La Jolla Lush.webp",
  Pasadena: "Pasadena.webp",
  "Cali's Finest": "Calis Finest.webp",
  "Hollywood Lush": "Hollywood Lush.webp",
  "Central Park": "Central Park.webp",
  Wimbledon: "Wimbledon.webp",
  Malibu: "Malibu.webp",
  "Big Sur": "Big Sur.webp",
  Monterey: "Monterey.webp",
  "Sol Natural": "Sol Natural.webp",
  Brentwood: "Brentwood.webp",
  Newport: "Newport.webp",
  "Pets Choice": "Pets Choice.webp",
  "Kennels Best": "Kennels Best.webp",
  Fringe: "Fringe.webp",
  "Kids Play": "Kids Play.webp",
  "Champions Choice": "Champions Choice.webp",
  "Pro Putter": "Pro Putter.webp",
  "Poa Annua Natural": "POA Annua Natural.webp",
  "Poa Annua Max": "POA Annua Max.webp",
};

/** The site path of a product's photo, or null when it has none. */
export function productPhotoPath(product: string | null | undefined): string | null {
  const file = product ? files[product] : undefined;
  return file ? `/images/products/${encodeURIComponent(file)}` : null;
}

/** A picture kept on a quote line by path rather than as an uploaded file: only our own product photos qualify. */
export function isProductPhotoPath(path: string): boolean {
  return path.startsWith("/images/products/") && !path.includes("..");
}
