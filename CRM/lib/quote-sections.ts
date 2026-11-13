/* The sections of a quote that the quote page's pencils open on their own (`/quotes/<id>/edit?section=intro`), as in Jobber. In a plain
   module (not the client-side builder) so the server page can read the address with it. */

export const SECTIONS = ["details", "intro", "lines", "message", "attachments", "contract"] as const;
export type Section = (typeof SECTIONS)[number];

export const SECTION_TITLE: Record<Section, string> = {
  details: "Quote details", intro: "Introduction", lines: "Product / Service", message: "Client Message", attachments: "Attachments", contract: "Contract / Disclaimer",
};

export const parseSection = (s: string | undefined): Section | undefined => ((SECTIONS as readonly string[]).includes(s ?? "") ? (s as Section) : undefined);
