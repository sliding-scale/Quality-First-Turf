/* Sample clients for the dev deployment. Every name, address and number here is invented. Moved here from the CRM app's
   browser sample data (D-013, D-042) so seeding happens on the server. The sequence is seeded, so it is the same every time. */

import { BUSINESS_NAMES } from "./lib/businessNames";

export type SampleClient = {
  /** A stable number the sample rules (stage, status, archived) are worked out from. */
  numId: number;
  type: "homeowner" | "contractor";
  name: string;
  contactName: string;
  company: string;
  phone: string;
  email: string;
  street1: string;
  city: string;
  state: string;
  zip: string;
  business: string;
  notes: string;
  /** How many days ago the client was last active. */
  daysAgo: number;
};

export function generateSampleClients(): SampleClient[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

  const first = ["Maria", "James", "Linda", "Carlos", "Susan", "David", "Angela", "Robert", "Patricia", "Michael", "Jennifer", "Daniel", "Karen", "Luis", "Nancy", "Kevin", "Sandra", "Brian", "Donna", "Jose", "Laura", "Mark", "Emily", "Steven", "Rachel", "Andrew", "Megan", "Victor", "Olivia", "Tyler"];
  const last = ["Alvarez", "Brooks", "Chen", "Delgado", "Ellison", "Foster", "Garcia", "Hughes", "Ibarra", "Jensen", "Kim", "Lopez", "Morales", "Nguyen", "Ortiz", "Patel", "Quinn", "Reyes", "Sanders", "Tran", "Underwood", "Vega", "Walker", "Young", "Zimmerman"];
  const streets = ["Oak Ridge Dr", "Willow Creek Ln", "Sunset Blvd", "Canyon View Rd", "Pepper Tree Way", "Desert Rose Ct", "Hillcrest Ave", "Meadow Lark Ln", "Vista del Sol", "Cedar Glen Rd"];
  const cities: [string, string][] = [["Temecula", "92592"], ["Murrieta", "92562"], ["San Jacinto", "92582"], ["Fallbrook", "92028"], ["Upland", "91784"], ["Glendora", "91741"], ["Altadena", "91001"], ["Menifee", "92584"], ["Corona", "92879"], ["Riverside", "92507"]];
  const companies = ["Rivera Landscape", "Summit Builders", "Coastal Outdoor Design", "Pinnacle Concrete", "GreenLine Contractors", "Sol Patio Works"];

  const clients: SampleClient[] = [];
  for (let i = 0; i < 84; i++) {
    const contractor = rnd() < 0.2;
    const f = pick(first);
    const l = pick(last);
    const c = pick(cities);
    const co = contractor ? pick(companies) : "";
    clients.push({
      numId: 1001 + i,
      name: contractor && rnd() < 0.5 ? co : `${f} ${l}`,
      contactName: `${f} ${l}`,
      company: co,
      type: contractor ? "contractor" : "homeowner",
      phone: `(951) 555-0${100 + Math.floor(rnd() * 900)}`,
      email: `${f}.${l}@example.com`.toLowerCase(),
      street1: `${Math.floor(1000 + rnd() * 38000)} ${pick(streets)}`,
      city: c[0],
      state: "CA",
      zip: c[1],
      business: rnd() < 0.7 ? BUSINESS_NAMES[0] : pick(BUSINESS_NAMES),
      notes: "",
      daysAgo: Math.floor(rnd() * 60),
    });
  }
  Object.assign(clients[0], {
    name: "Jane Demo", contactName: "Jane Demo", company: "", type: "homeowner", email: "jane.demo@example.com",
    phone: "(951) 555-0100", street1: "123 Demo Street", city: "Temecula", zip: "92592", business: BUSINESS_NAMES[0],
    daysAgo: 0, notes: "Prefers phone calls after 3 PM.",
  });

  // Hand-written clients so the top of the list looks like a real business. All invented.
  const dummy = (numId: number, name: string, contactName: string, company: string, type: "homeowner" | "contractor", phone: string, email: string, street1: string, city: string, zip: string, business: string, daysAgo: number, notes?: string): SampleClient =>
    ({ numId, name, contactName, company, type, phone, email, street1, city, state: "CA", zip, business, notes: notes || "", daysAgo });
  const [QFT, QFC, QFP] = BUSINESS_NAMES;
  return [
    dummy(2001, "Michael & Sarah Thompson", "Michael Thompson", "", "homeowner", "(951) 555-0142", "m.thompson@example.com", "41230 Avenida Verde", "Temecula", "92591", QFT, 0, "Wants turf for the back yard and a small putting green."),
    dummy(2002, "Desert Sun Landscaping", "Ramon Castillo", "Desert Sun Landscaping", "contractor", "(951) 555-0178", "ramon@desertsun.example.com", "2250 Industrial Way", "Murrieta", "92562", QFC, 0, "Sends two or three jobs a month."),
    dummy(2003, "Priya Nair", "Priya Nair", "", "homeowner", "(760) 555-0119", "priya.nair@example.com", "1187 Alta Vista Dr", "Fallbrook", "92028", QFT, 1, "Gate code needed for the side yard."),
    dummy(2004, "Okafor Family", "Chidi Okafor", "", "homeowner", "(909) 555-0163", "chidi.okafor@example.com", "745 Mountain Ave", "Upland", "91786", QFP, 1),
    dummy(2005, "Blue Ridge Builders", "Karen Whitfield", "Blue Ridge Builders", "contractor", "(951) 555-0190", "karen@blueridge.example.com", "880 Commerce Pkwy", "Corona", "92880", QFC, 2),
    dummy(2006, "Dave & Lisa Rodriguez", "Dave Rodriguez", "", "homeowner", "(951) 555-0127", "dave.rodriguez@example.com", "36712 Sage Canyon Ct", "Winchester", "92596", QFT, 2),
    dummy(2007, "Emily Carter", "Emily Carter", "", "homeowner", "(626) 555-0155", "emily.carter@example.com", "2308 N Lake Ave", "Altadena", "91001", QFP, 3, "Interested in pavers and a fire pit."),
    dummy(2008, "Coastal Edge Outdoor Design", "Marcus Lee", "Coastal Edge Outdoor Design", "contractor", "(949) 555-0104", "marcus@coastaledge.example.com", "17 Harbor Point Rd", "Riverside", "92507", QFC, 4),
    dummy(2009, "Gregory Alvarado", "Gregory Alvarado", "", "homeowner", "(951) 555-0136", "g.alvarado@example.com", "29480 Pebble Beach Dr", "Menifee", "92584", QFT, 4),
    dummy(2010, "Natalie & Tom Brennan", "Natalie Brennan", "", "homeowner", "(909) 555-0181", "natalie.brennan@example.com", "1456 Foothill Blvd", "Glendora", "91741", QFT, 5),
    dummy(2011, "Summit Concrete & Paving", "Hector Salinas", "Summit Concrete & Paving", "contractor", "(951) 555-0112", "hector@summitconcrete.example.com", "5500 Rail Spur Rd", "San Jacinto", "92582", QFC, 6),
    dummy(2012, "Aisha Rahman", "Aisha Rahman", "", "homeowner", "(951) 555-0149", "aisha.rahman@example.com", "32018 Calle Pinon", "Temecula", "92592", QFT, 7),
    dummy(2013, "Walter Nguyen", "Walter Nguyen", "", "homeowner", "(760) 555-0174", "walter.nguyen@example.com", "612 Sycamore Ln", "Fallbrook", "92028", QFP, 9),
    dummy(2014, "Pacific Pavers Co.", "Jenna Morrison", "Pacific Pavers Co.", "contractor", "(951) 555-0133", "jenna@pacificpavers.example.com", "1200 Via Industria", "Murrieta", "92563", QFC, 12),
    ...clients,
  ];
}

/** The services a sample request can be for. */
export const SAMPLE_SERVICES = ["Turf installation", "Putting green", "Patio pavers", "Fire pit and patio", "Turf for pets", "Drainage and base prep"];
