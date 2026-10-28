/**
 * Lines the app's item names up with the names in the client's Jobber account.
 *
 * The client's items carry a leading sort number ("9.02 RP - AG Budget Friendly Install - ..."), write
 * size bands as "[300 - 699 SF]", and word some families differently from the app (Premium for
 * Deluxe, "Add Ons - ... Installed", "Low Voltage Lighting - ...", and so on). Both sides are reduced
 * to one key by `jobberKey`, so an item is found whichever way it is written. The price always
 * comes from Jobber, never from here.
 */

/** Mistakes in the client's item names that would otherwise hide a real item. */
const typoFixes: [RegExp, string][] = [
  [/pentertaintment/g, "entertainment"],
  [/entertaintment/g, "entertainment"],
  // "[15000 - 1999 SF]" on Demo and Regrade
  [/\[15000-1999\]/g, "[1500-1999]"],
];

/** How the app words an underground item, and how the client words the same one. */
const undergroundNames: Record<string, string> = {
  '3" drains installed': '3" drain installed',
  '4" drains installed': '4" drain installed',
  '1" mainline pvc schedule 40 installed (12" deep)': '1" mainline installed (12" deep)',
  '3/4" waterline pvc schedule 40 installed': '3/4" waterline installed',
  "pipe sleeve pvc schedule 40 installed": '1" pipe sleeve installed',
  '2" conduit installed (18" deep)': '2" conduit installed',
  '3/4" gas line installed': '3/4" gas line installed',
};

/** Add-ons whose wording differs from the client's, by the app's name without "Additional ". */
const addOnNames: Record<string, string> = {
  "pet deodorizer": "pet deodorizer [zeolite]",
  "weed cloth": "3 oz. weed cloth",
  "black aluminum border": "black aluminium border",
};

/** The app's wording for an item, rewritten to the client's. Names already in the client's wording pass through. */
function asClientWording(name: string): string {
  let text = name;
  text = text.replace(/ag deluxe install/, "ag premium install");
  text = text.replace(/rp - ag replacement \[/, "rp - ag turf replacement [");
  text = text.replace(/rp - ag repair \[/, "rp - ag turf repair [");
  text = text.replace(/rp - demolition demolition & regrade \[/, "rp - demo and regrade [");
  text = text.replace(/rp - demolition demolition \[/, "rp - demo [");
  text = text.replace(/rp - putting green entertainment putting green - /, "rp - entertainment putting green installation - ");
  text = text.replace(/rp - putting green pga putting green - /, "rp - pga putting green installation - ");
  text = text.replace(/^rp - lighting /, "low voltage lighting - ");

  const addOn = text.match(/^rp - (?:ag|putting green|demolition) add-on - (.+)$/);
  if (addOn !== null) {
    const bare = addOn[1].replace(/^additional /, "");
    return `rp - add ons - ${addOnNames[bare] ?? bare} installed`;
  }

  const underground = text.match(/^rp - underground (.+) \[(standard soil|rocky or clay soil)\]$/);
  if (underground !== null) {
    const described = undergroundNames[underground[1]] ?? underground[1];
    return `rp - underground - ${described} in ${underground[2]}`;
  }
  return text;
}

/** One comparable form of an item name, the same for the app's wording and the client's. */
export function jobberKey(name: string): string {
  let text = name
    .toLowerCase()
    // The sort number in front: "9.02 RP - ..." and "99.01 Low Voltage Lighting - ..."
    .replace(/^\s*\d+(\.\d+)?\s+/, "")
    // "RP- AG" and "RP  -  AG" are the same as "RP - AG".
    .replace(/\brp\s*-\s*/, "rp - ")
    // A size band reads the same however its spaces and "SF" are written: [300 - 699 SF] = [300-699].
    .replace(/\[([^\]]*)\]/g, (_whole, inner: string) => {
      const band = inner
        .replace(/\bsf\b/g, "")
        .replace(/\s*-\s*/g, "-")
        .replace(/\s*\+/g, "+")
        .replace(/\s+/g, " ")
        .trim();
      return `[${band}]`;
    })
    .replace(/\s+/g, " ")
    .trim();
  for (const [pattern, replacement] of typoFixes) text = text.replace(pattern, replacement);
  return asClientWording(text).replace(/\s+/g, " ").trim();
}
