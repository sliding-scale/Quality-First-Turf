/* Sample data. Every name, address and number here is invented. Fields follow the PRD client profile (D-008, D-031).
   Screens reach this only through lib/clients.ts, so Convex can replace it without rewriting them (D-013). */

export type ClientType = "Homeowner" | "Contractor";

export type Client = {
  id: number;
  name: string;
  contactName: string;
  company: string;
  type: ClientType;
  phone: string;
  email: string;
  street1: string;
  street2: string;
  city: string;
  state: string;
  zip: string;
  business: string;
  notes: string;
  daysAgo: number;
  /** Hidden from the default list. There is no Archive button yet (not built); a few sample clients are archived. */
  archived?: boolean;
};

export const BUSINESSES = ["Quality First Turf", "Quality First Turf Construction", "Quality First Patios"] as const;

// Stage names are verbatim from the PRD.
export const SALES_STAGES = [
  "New Request",
  "Schedule Onsite Consultation",
  "Onsite Consultation",
  "Quote Draft & Site Plan / Design",
  "Proposal Delivered — Awaiting Response",
  "Changes Requested",
  "Quotes Approved — Contract Out for Signature",
  "Closed Won",
  "Closed Lost",
];

export const PREPLANNING_STAGES = [
  "Ready for Preplanning",
  "Contract & Scope of Work Review",
  "Material Takeoff & Availability",
  "Installer Work Package",
  "Crew Alignment & Hold",
  "Schedule & Access Confirmation",
  "Order & Schedule Delivery for Materials",
  "Ready for Construction / Installs Scheduled",
];

function generate(): Client[] {
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];

  const first = ["Maria", "James", "Linda", "Carlos", "Susan", "David", "Angela", "Robert", "Patricia", "Michael", "Jennifer", "Daniel", "Karen", "Luis", "Nancy", "Kevin", "Sandra", "Brian", "Donna", "Jose", "Laura", "Mark", "Emily", "Steven", "Rachel", "Andrew", "Megan", "Victor", "Olivia", "Tyler"];
  const last = ["Alvarez", "Brooks", "Chen", "Delgado", "Ellison", "Foster", "Garcia", "Hughes", "Ibarra", "Jensen", "Kim", "Lopez", "Morales", "Nguyen", "Ortiz", "Patel", "Quinn", "Reyes", "Sanders", "Tran", "Underwood", "Vega", "Walker", "Young", "Zimmerman"];
  const streets = ["Oak Ridge Dr", "Willow Creek Ln", "Sunset Blvd", "Canyon View Rd", "Pepper Tree Way", "Desert Rose Ct", "Hillcrest Ave", "Meadow Lark Ln", "Vista del Sol", "Cedar Glen Rd"];
  const cities: [string, string][] = [["Temecula", "92592"], ["Murrieta", "92562"], ["San Jacinto", "92582"], ["Fallbrook", "92028"], ["Upland", "91784"], ["Glendora", "91741"], ["Altadena", "91001"], ["Menifee", "92584"], ["Corona", "92879"], ["Riverside", "92507"]];
  const companies = ["Rivera Landscape", "Summit Builders", "Coastal Outdoor Design", "Pinnacle Concrete", "GreenLine Contractors", "Sol Patio Works"];

  const clients: Client[] = [];
  for (let i = 0; i < 84; i++) {
    const contractor = rnd() < 0.2;
    const f = pick(first);
    const l = pick(last);
    const c = pick(cities);
    const co = contractor ? pick(companies) : "";
    clients.push({
      id: 1001 + i,
      name: contractor && rnd() < 0.5 ? co : `${f} ${l}`,
      contactName: `${f} ${l}`,
      company: co,
      type: contractor ? "Contractor" : "Homeowner",
      phone: `(951) 555-0${100 + Math.floor(rnd() * 900)}`,
      email: `${f}.${l}@example.com`.toLowerCase(),
      street1: `${Math.floor(1000 + rnd() * 38000)} ${pick(streets)}`,
      street2: "",
      city: c[0],
      state: "CA",
      zip: c[1],
      business: rnd() < 0.7 ? BUSINESSES[0] : pick(BUSINESSES),
      notes: "",
      daysAgo: Math.floor(rnd() * 60),
    });
  }
  Object.assign(clients[0], {
    name: "Jane Demo", contactName: "Jane Demo", company: "", type: "Homeowner", email: "jane.demo@example.com",
    phone: "(951) 555-0100", street1: "123 Demo Street", city: "Temecula", zip: "92592", business: BUSINESSES[0],
    daysAgo: 0, notes: "Prefers phone calls after 3 PM.",
  });

  // A few archived clients, so the Archived status filter has something to show.
  for (const c of clients) if (c.id % 11 === 0 && c.id !== 1001) c.archived = true;

  // Hand-written dummy clients so the top of the list looks like a real business. All invented.
  const dummy = (id: number, name: string, contactName: string, company: string, type: ClientType, phone: string, email: string, street1: string, city: string, zip: string, business: string, daysAgo: number, notes?: string): Client =>
    ({ id, name, contactName, company, type, phone, email, street1, street2: "", city, state: "CA", zip, business, notes: notes || "", daysAgo });
  const [QFT, QFC, QFP] = BUSINESSES;
  clients.unshift(
    dummy(2001, "Michael & Sarah Thompson", "Michael Thompson", "", "Homeowner", "(951) 555-0142", "m.thompson@example.com", "41230 Avenida Verde", "Temecula", "92591", QFT, 0, "Wants turf for the back yard and a small putting green."),
    dummy(2002, "Desert Sun Landscaping", "Ramon Castillo", "Desert Sun Landscaping", "Contractor", "(951) 555-0178", "ramon@desertsun.example.com", "2250 Industrial Way", "Murrieta", "92562", QFC, 0, "Sends two or three jobs a month."),
    dummy(2003, "Priya Nair", "Priya Nair", "", "Homeowner", "(760) 555-0119", "priya.nair@example.com", "1187 Alta Vista Dr", "Fallbrook", "92028", QFT, 1, "Gate code needed for the side yard."),
    dummy(2004, "Okafor Family", "Chidi Okafor", "", "Homeowner", "(909) 555-0163", "chidi.okafor@example.com", "745 Mountain Ave", "Upland", "91786", QFP, 1),
    dummy(2005, "Blue Ridge Builders", "Karen Whitfield", "Blue Ridge Builders", "Contractor", "(951) 555-0190", "karen@blueridge.example.com", "880 Commerce Pkwy", "Corona", "92880", QFC, 2),
    dummy(2006, "Dave & Lisa Rodriguez", "Dave Rodriguez", "", "Homeowner", "(951) 555-0127", "dave.rodriguez@example.com", "36712 Sage Canyon Ct", "Winchester", "92596", QFT, 2),
    dummy(2007, "Emily Carter", "Emily Carter", "", "Homeowner", "(626) 555-0155", "emily.carter@example.com", "2308 N Lake Ave", "Altadena", "91001", QFP, 3, "Interested in pavers and a fire pit."),
    dummy(2008, "Coastal Edge Outdoor Design", "Marcus Lee", "Coastal Edge Outdoor Design", "Contractor", "(949) 555-0104", "marcus@coastaledge.example.com", "17 Harbor Point Rd", "Riverside", "92507", QFC, 4),
    dummy(2009, "Gregory Alvarado", "Gregory Alvarado", "", "Homeowner", "(951) 555-0136", "g.alvarado@example.com", "29480 Pebble Beach Dr", "Menifee", "92584", QFT, 4),
    dummy(2010, "Natalie & Tom Brennan", "Natalie Brennan", "", "Homeowner", "(909) 555-0181", "natalie.brennan@example.com", "1456 Foothill Blvd", "Glendora", "91741", QFT, 5),
    dummy(2011, "Summit Concrete & Paving", "Hector Salinas", "Summit Concrete & Paving", "Contractor", "(951) 555-0112", "hector@summitconcrete.example.com", "5500 Rail Spur Rd", "San Jacinto", "92582", QFC, 6),
    dummy(2012, "Aisha Rahman", "Aisha Rahman", "", "Homeowner", "(951) 555-0149", "aisha.rahman@example.com", "32018 Calle Pinon", "Temecula", "92592", QFT, 7),
    dummy(2013, "Walter Nguyen", "Walter Nguyen", "", "Homeowner", "(760) 555-0174", "walter.nguyen@example.com", "612 Sycamore Ln", "Fallbrook", "92028", QFP, 9),
    dummy(2014, "Pacific Pavers Co.", "Jenna Morrison", "Pacific Pavers Co.", "Contractor", "(951) 555-0133", "jenna@pacificpavers.example.com", "1200 Via Industria", "Murrieta", "92563", QFC, 12),
  );
  return clients;
}

/** The generated clients. Built once; the sequence is seeded, so server and browser agree. */
export const SAMPLE_CLIENTS: Client[] = generate();
