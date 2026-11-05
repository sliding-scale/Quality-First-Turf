/* Icons the Atlantis table does not include, drawn to match its 24px grid and weight. */

import { ICONS, type IconDef } from "./icons-data";

export const EXTRA_ICONS: Record<string, IconDef> = {
  // Replaces the table's "sort" glyph: the copy in the Atlantis table draws overlapping arrows and a bar, which turns into a blob at
  // the 16px size used in column headers. This is a plain pair of chevrons, up and down, the same shape Jobber shows.
  sort: {
    vb: "0 0 24 24",
    paths: [
      { d: "M7.5 10 12 5.5 16.5 10", stroke: true },
      { d: "M7.5 14 12 18.5 16.5 14", stroke: true },
    ],
  },
  // Import is Export turned half a turn: the arrow points into the box instead of out of it.
  import: {
    vb: "0 0 24 24",
    paths: ICONS.export.paths.map((p) => ({ ...p, transform: "rotate(180 12 12)" })),
  },
  // Merge: two lines run together into one, with an arrow.
  merge: {
    vb: "0 0 24 24",
    paths: [
      { d: "M3 7h3.5c3.2 0 4.6 2.4 5.5 5", stroke: true },
      { d: "M3 17h3.5c3.2 0 4.6-2.4 5.5-5", stroke: true },
      { d: "M12 12h8.5", stroke: true },
      { d: "M17 8.5 20.5 12 17 15.5", stroke: true },
    ],
  },
};
