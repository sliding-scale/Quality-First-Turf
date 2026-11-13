/* Saved disclaimers for quotes (D-075). Pure rules and the starter wording only (no Convex, no React), so the backend, the screens and the
   tests share them. The starter wording is a plain, common-sense first draft for a turf, patio and landscape business: the client should have
   it read by their own lawyer before relying on it, and edit it freely in Settings → Disclaimers. */

export const MAX_DISCLAIMERS_PER_QUOTE = 20;
export const MAX_LIBRARY = 100;
export const MAX_TITLE = 120;
export const MAX_TEXT = 3000;

export type DisclaimerCopy = { title: string; text: string };

/** The first thing wrong with a disclaimer, or null. */
export function checkDisclaimer(d: DisclaimerCopy): string | null {
  const title = d.title.trim();
  const text = d.text.trim();
  if (!title) return "Give the disclaimer a title.";
  if (title.length > MAX_TITLE) return `The title is too long (${MAX_TITLE} characters at most).`;
  if (!text) return "Write the disclaimer's wording.";
  if (text.length > MAX_TEXT) return `The wording is too long (${MAX_TEXT} characters at most).`;
  return null;
}

/** Disclaimers are told apart by title, so one title is attached to a quote once. */
export const sameTitle = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const STARTER_DISCLAIMERS: DisclaimerCopy[] = [
  { title: "Quote validity", text: "This quote is valid for 30 days from the date it was sent. After that, prices and availability of materials may change." },
  { title: "Payment terms", text: "A deposit is due when the quote is approved. The remaining balance is due on completion of the work. Payments received more than 15 days late may be charged a late fee." },
  { title: "Changes to the work", text: "Work that is not in this quote is priced separately and needs the client's written approval before it starts. Changes to the scope may change the price and the schedule." },
  { title: "Underground utilities and site conditions", text: "Underground lines, pipes, irrigation, buried rock, poor soil or drainage problems that are not visible before work starts can change the cost and schedule. The client will be told before any extra work is done. The client is responsible for marking private lines (for example gas, sprinkler or electrical lines) that are not covered by the public locate service." },
  { title: "Site access and preparation", text: "The client will provide clear access to the work area, including gates and paths, and will move vehicles, furniture, plants and other items before work begins unless agreed otherwise." },
  { title: "Materials and colour variation", text: "Natural stone, pavers, turf and other materials vary in colour, texture and size between batches. Samples, photos and renderings are a guide and may differ from the finished product." },
  { title: "Weather and delays", text: "The schedule depends on weather and on supplier delivery times. Delays caused by rain, extreme heat or material shortages are not a breach of this agreement, and the schedule will be adjusted." },
  { title: "Permits and HOA approval", text: "Unless stated in this quote, the client is responsible for any homeowner association approval and for permits the work requires. Permit fees are not included unless listed." },
  { title: "Warranty", text: "Workmanship is warranted for the period stated in this quote or agreement. Manufacturer warranties on turf, pavers and other products are provided by the manufacturer and are separate from our workmanship warranty. The warranty does not cover damage from misuse, neglect, accidents or settling caused by ground movement or flooding." },
  { title: "Care and maintenance", text: "Natural settling can occur in new installations and is normal. Following the care instructions we provide, including cleaning, pet-waste care for turf and sealing for pavers when recommended, helps the work last." },
  { title: "Cancellation", text: "If the client cancels after the quote is approved, the deposit may be kept to cover materials ordered, time reserved and work already done." },
  { title: "Photos", text: "We may take photos of the finished work, with no personal information shown, for our records and marketing, unless the client tells us in writing not to." },
];
