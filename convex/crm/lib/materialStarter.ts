/* The client's "QFT LANDSCAPE - Material Take off Calculator" (a spreadsheet they supplied on 2026-11-20), turned into materials and kits (D-104).
   Each spreadsheet row is a material with a formula: its yellow-cell input (square feet, or linear feet) is `area` or `length`, its quantity
   column is a rate in the formula, and its ORDER column's ROUNDUP / CEILING is the rounding. Each spreadsheet block (Standard install, 3" drain...)
   is a kit. Pure TypeScript, no Convex or React imports. Loaded by `materialKits.loadStarter`; a name that already exists is left alone.

   Reading the spreadsheet: ROUNDUP(x, 0) is rounding "up"; CEILING(x, 0.5) is `ceil(x * 2) / 2` with rounding "none"; CEILING(x, 10) is
   `ceil(x / 10) * 10`. A rate the spreadsheet gives as 1/20 is written 0.05. A material whose rate differs between blocks is a separate material
   with its own name (the two Camofill rates, the infill for a glued install), so a kit never needs a rate of its own. */

import type { Rounding } from "./takeoff";

export type StarterMaterial = { name: string; category: string; unit: string; formula: string; wastagePercent: number; rounding: Rounding; sizeDetails: string };
export type StarterKit = { name: string; group: string; description: string; items: string[] };

const TURF = "Turf installation";
const OTHER = "Other installations";
const ADD = "Add ons";
const UNDER = "Underground";
const DEMO = "Demolition";
const IRR = "Irrigation";
const LIGHT = "Lighting";

const AREA = "Priced by the area in square feet.";
const LENGTH = "Priced by the length in linear feet.";

const m = (category: string, name: string, unit: string, formula: string, rounding: Rounding = "up", wastagePercent = 0, sizeDetails = ""): StarterMaterial => ({
  name, category, unit, formula, wastagePercent, rounding, sizeDetails,
});

export const STARTER_MATERIALS: StarterMaterial[] = [
  // Turf installation. The roll is ordered in feet of roll: area plus 15% waste, over the roll's 15 ft width (the spreadsheet's default).
  m(TURF, "Artificial Grass Roll", "ft of roll", "area / 15", "up", 15, "15 ft wide. For another roll width, change the 15 in the formula."),
  m(TURF, "2 in. Class 2 Road Base", "cubic yard", "ceil(area * 0.0067 * 2) / 2", "none", 0, "Ordered to the next half cubic yard."),
  m(TURF, "4 in. Class 2 Road Base", "cubic yard", "ceil(area * 0.0123 * 2) / 2", "none", 0, "Ordered to the next half cubic yard."),
  m(TURF, "2 in. of 3/4 in. Drain Rock", "cubic yard", "area * 0.0067"),
  m(TURF, "1 in. Decomposed Granite", "cubic yard", "ceil(area * 0.0031 * 2) / 2", "none", 0, "Ordered to the next half cubic yard."),
  m(TURF, "5 in. 4D Nails non galvanized", "box", "area * 0.002"),
  m(TURF, "3 1/2 in. finishing 4D nails non galvanized", "box", "area * 0.002"),
  m(TURF, "6 in. Sod Staple Flat Top", "bag of 100", "area * 0.33 / 100"),
  m(TURF, "Site pro pre emergent", "bag of 50 lb", "area * 0.05 / 50"),
  m(TURF, "#16 OR #20 Silica Infill", "bag of 50 lb", "area * 1.5 / 50"),
  m(TURF, "#16 OR #20 Silica Infill (glued over concrete)", "bag of 50 lb", "area * 2 / 50"),
  m(TURF, "#60 Silica Infill (entertainment putting green)", "bag of 50 lb", "area * 1.75 / 50"),
  m(TURF, "#60 Silica Infill (PGA putting green)", "bag of 50 lb", "area * 2.75 / 50"),
  m(TURF, "Camofill (Antimicrobial Infil)", "bag of 50 lb", "area * 2 / 50"),
  m(TURF, "Camofill (Antimicrobial Infil), premium", "bag of 50 lb", "area * 2.5 / 50"),
  m(TURF, "Zeolite", "bag of 50 lb", "area * 0.5 / 50"),
  m(TURF, "Seaming Tape", "linear ft", "area * 0.1", "up", 0, "For seams between turf rolls: 1 ft for every 10 sq ft."),
  m(TURF, "Adhesive / Glue (for seams)", "quart", "ceil(area * 0.1) * 0.0125", "up", 0, "About 20 linear ft of seam per quart."),
  // A turf strip is measured by its length and its width in feet (6 in. is 0.5).
  m(TURF, "Turf Strips", "linear ft", "length", "none"),
  m(TURF, "6 in. finishing 4D nails non galvanized", "box", "width * length * 0.002"),
  m(TURF, "Site pro pre emergent (strips)", "bag of 50 lb", "width * length * 0.05 / 50"),
  m(TURF, "#16 OR #20 Silica Infill (strips)", "bag of 50 lb", "width * length * 2 / 50"),

  m(OTHER, "Geotextile Black Weed Barrier", "sq ft", "area", "none"),
  m(OTHER, "Mulch", "cubic yard", "area * 0.0093", "up", 0, "Up to 3 in. deep."),
  m(OTHER, "Decorative Rock", "cubic yard", "area * 0.0093", "up", 0, "Up to 3 in. deep."),

  m(ADD, "#16 / #20 grit silica sand", "bag of 50 lb", "area * 1 / 50"),
  m(ADD, "#60 grit silica sand", "bag of 50 lb", "area * 1 / 50"),
  m(ADD, "Zeolite pet deodorize", "bag of 50 lb", "area * 1 / 50"),
  m(ADD, "Camofill 4 color blend", "bag of 50 lb", "area * 1 / 50"),
  m(ADD, "Seaming Tape (by seam length)", "linear ft", "length", "none"),
  m(ADD, "Adhesive / Glue (for seams, by seam length)", "quart", "length * 0.0125", "up"),
  m(ADD, "Weed Cloth", "sq ft", "area", "none"),
  m(ADD, "Gopher Wire 4 ft x 100 ft", "roll", "area / (100 * 4)", "up", 0, "Rolls 4 ft wide and 100 ft long."),
  m(ADD, "Bender board - 1 in. x 4 in. x 20 ft.", "unit", "length / 20"),
  m(ADD, "Lumber 2 in. x 4 in. x 20 ft.", "unit", "length / 20"),

  m(UNDER, "PVC Sewer and Drain Pipe 3 in. SDR-35 Bell End", "ft", "ceil(length / 10) * 10", "none", 0, "Ordered to the next 10 ft."),
  m(UNDER, "NDS PVC S&D 90 Deg. Elbow HUB x HUB White 3 in.", "unit", "length * 0.1"),
  m(UNDER, "NDS PVC S&D Tee HUB x HUB x HUB White 3 in.", "unit", "length * 0.1"),
  m(UNDER, "NDS Drain Grate Round Polyolefin Green 3 in.", "unit", "length * 0.1"),
  m(UNDER, "PVC Sewer and Drain Pipe 4 in. SDR-35 Bell End", "ft", "ceil(length / 10) * 10", "none", 0, "Ordered to the next 10 ft."),
  m(UNDER, "NDS PVC S&D 90 Deg. Elbow HUB x HUB White 4 in.", "unit", "length * 0.1"),
  m(UNDER, "NDS PVC S&D Tee HUB x HUB x HUB White 4 in.", "unit", "length * 0.1"),
  m(UNDER, "NDS Drain Grate Round Polyolefin Green 4 in.", "unit", "length * 0.1"),
  m(UNDER, "Christys Red Hot Glue", "oz", "length * 0.08", "none"),
  m(UNDER, "Drain Rock", "cubic yard", "length * 0.05", "none"),
  m(UNDER, "3/4 in. x 20 ft Sch. 40 Bell End PVC Pipe", "ft", "ceil(length / 10) * 10", "none", 0, "Ordered to the next 10 ft."),
  m(UNDER, "3/4 in. Couplings", "unit", "length * 0.1"),
  m(UNDER, "1 in. x 20 ft Sch. 40 Bell End PVC Pipe", "ft", "ceil(length / 10) * 10", "none", 0, "Ordered to the next 10 ft."),
  m(UNDER, "1 in. Couplings", "unit", "length * 0.1"),
  m(UNDER, "Bedding sand", "cubic yard", "length * 0.04", "none"),

  // Irrigation: the drip system. Its yellow cells are the measurements valves, drip_line, drip_line_emitters, soaker_hose, plants, tree_rings and large_tree_rings.
  // A "per system" material is 1 each: adding the kit is adding a system. Tubing is ordered to the next 10 ft, like the sheet's CEILING(x, 10).
  m(IRR, "Valves", "unit", "valves"),
  m(IRR, "Drip tubing (0.625 in. diameter)", "ft", "ceil((drip_line + drip_line_emitters + large_tree_rings * 20 + tree_rings * 12) / 10) * 10", "none", 0, "Ordered to the next 10 ft. A large tree ring takes 20 ft, a standard one 12 ft."),
  m(IRR, "Drip Tubing Adapter (1 in. x 3/4 in.)", "unit", "1"),
  m(IRR, "Drip Emitters", "unit", "plants * 2", "up", 0, "2 per plant."),
  m(IRR, "Hunter drip filter", "unit", "1"),
  m(IRR, "Pressure Regulator (25 PSI)", "unit", "1"),
  m(IRR, "Backflow Preventer", "unit", "1"),
  m(IRR, "Ball Valve (shutoff)", "unit", "1"),
  m(IRR, "Pressure Gauge", "unit", "1"),
  m(IRR, "Stake Holders", "unit", "(soaker_hose + drip_line + drip_line_emitters + tree_rings * 12 + large_tree_rings * 20) * 0.2", "up", 0, "1 for every 5 ft of tubing."),
  m(IRR, "End Cap", "unit", "1"),
  m(IRR, "18 in. sch 80 risers with thread", "unit", "2"),
  m(IRR, "Black electrical tape", "unit", "1"),
  m(IRR, "Teflon tape 3/4 in.", "unit", "1"),
  m(IRR, "Christy's Red Hot Glue + primer", "oz", "(soaker_hose + drip_line + drip_line_emitters + large_tree_rings * 20 + tree_rings * 12) * 0.08", "up", 0, "Comes in different sizes; always round up to cover the amount."),
  // The sheet marks these three "OPTIONAL, CONFIRM BEFORE ORDERING", so they are their own kit.
  m(IRR, "Rain Bird Rain/Freeze Sensor Wireless w/Controller Interface", "unit", "1"),
  m(IRR, "Rain Bird Moisture Sensor", "unit", "1"),
  m(IRR, "Rain Bird model ESP-LXIVM 2-Wire Controller, 60 Station Capacity", "unit", "1"),

  // Lighting: the transformer and the lights (the sheet's other lighting blocks, running line under concrete, loose lay wire and in conduit, are empty).
  m(LIGHT, "Alliance TF150 OR TF300 Transformer", "unit", "transformers"),
  m(LIGHT, "12Ga Galvanized Tiewire 50Ft Roll", "roll", "lights * 0.5"),
  m(LIGHT, "Waterproof Wire Nuts", "unit", "lights * 2"),
  m(LIGHT, "Alliance WL400-Bluetooth", "unit", "lights"),

  // The demo calculator the client asked for: length x width x depth, worked out in cubic yards. Depth is in inches (12 in. to a foot, 27 cubic ft to a yard).
  m(DEMO, "Dirt to haul away (demo)", "cubic yard", "length * width * depth / 12 / 27", "none", 0, "Length and width in feet, depth in inches."),
];

export const STARTER_KITS: StarterKit[] = [
  { name: "Turf: Standard install", group: TURF, description: AREA, items: ["Artificial Grass Roll", "2 in. Class 2 Road Base", "5 in. 4D Nails non galvanized", "6 in. Sod Staple Flat Top", "Site pro pre emergent", "#16 OR #20 Silica Infill"] },
  { name: "Turf: Pet install, basic", group: TURF, description: AREA, items: ["Artificial Grass Roll", "4 in. Class 2 Road Base", "5 in. 4D Nails non galvanized", "6 in. Sod Staple Flat Top", "Site pro pre emergent", "Camofill (Antimicrobial Infil)"] },
  { name: "Turf: Pet install, premium", group: TURF, description: AREA, items: ["Artificial Grass Roll", "2 in. Class 2 Road Base", "2 in. of 3/4 in. Drain Rock", "5 in. 4D Nails non galvanized", "6 in. Sod Staple Flat Top", "Site pro pre emergent", "Zeolite", "Camofill (Antimicrobial Infil), premium"] },
  { name: "Turf: Replacement", group: TURF, description: AREA, items: ["Artificial Grass Roll", "2 in. Class 2 Road Base", "5 in. 4D Nails non galvanized", "6 in. Sod Staple Flat Top", "Site pro pre emergent", "#16 OR #20 Silica Infill"] },
  { name: "Turf: Glued over concrete", group: TURF, description: AREA, items: ["Artificial Grass Roll", "2 in. Class 2 Road Base", "#16 OR #20 Silica Infill (glued over concrete)", "Seaming Tape", "Adhesive / Glue (for seams)"] },
  { name: "Putting green: Entertainment", group: TURF, description: AREA, items: ["Artificial Grass Roll", "4 in. Class 2 Road Base", "1 in. Decomposed Granite", "3 1/2 in. finishing 4D nails non galvanized", "6 in. Sod Staple Flat Top", "Site pro pre emergent", "#60 Silica Infill (entertainment putting green)", "Seaming Tape", "Adhesive / Glue (for seams)"] },
  { name: "Putting green: PGA", group: TURF, description: AREA, items: ["Artificial Grass Roll", "4 in. Class 2 Road Base", "1 in. Decomposed Granite", "3 1/2 in. finishing 4D nails non galvanized", "6 in. Sod Staple Flat Top", "Site pro pre emergent", "#60 Silica Infill (PGA putting green)", "Seaming Tape", "Adhesive / Glue (for seams)"] },
  { name: "Turf: Strip install", group: TURF, description: "Priced by the strip's length and its width in feet (6 in. is 0.5).", items: ["Turf Strips", "6 in. finishing 4D nails non galvanized", "Site pro pre emergent (strips)", "#16 OR #20 Silica Infill (strips)"] },

  { name: "Mulch up to 3 in.", group: OTHER, description: AREA, items: ["Geotextile Black Weed Barrier", "6 in. Sod Staple Flat Top", "Mulch"] },
  { name: "Decorative rock up to 3 in.", group: OTHER, description: AREA, items: ["Geotextile Black Weed Barrier", "6 in. Sod Staple Flat Top", "Decorative Rock"] },

  { name: "Add on: #16 / #20 silica sand", group: ADD, description: AREA, items: ["#16 / #20 grit silica sand"] },
  { name: "Add on: #60 silica sand", group: ADD, description: AREA, items: ["#60 grit silica sand"] },
  { name: "Add on: Zeolite pet deodorizer", group: ADD, description: AREA, items: ["Zeolite pet deodorize"] },
  { name: "Add on: Camofill 4 color blend", group: ADD, description: AREA, items: ["Camofill 4 color blend"] },
  { name: "Add on: Seam tape", group: ADD, description: "Priced by the length of seam in linear feet.", items: ["Seaming Tape (by seam length)", "Adhesive / Glue (for seams, by seam length)"] },
  { name: "Add on: Weed cloth", group: ADD, description: AREA, items: ["Weed Cloth"] },
  { name: "Add on: Gopher wire", group: ADD, description: AREA, items: ["Gopher Wire 4 ft x 100 ft"] },
  { name: "Add on: Bender board", group: ADD, description: LENGTH, items: ["Bender board - 1 in. x 4 in. x 20 ft."] },
  { name: "Add on: 2 x 4 lumber", group: ADD, description: LENGTH, items: ["Lumber 2 in. x 4 in. x 20 ft."] },

  { name: "Underground: 3 in. drain", group: UNDER, description: LENGTH, items: ["PVC Sewer and Drain Pipe 3 in. SDR-35 Bell End", "NDS PVC S&D 90 Deg. Elbow HUB x HUB White 3 in.", "NDS PVC S&D Tee HUB x HUB x HUB White 3 in.", "NDS Drain Grate Round Polyolefin Green 3 in.", "Christys Red Hot Glue", "Drain Rock"] },
  { name: "Underground: 4 in. drain", group: UNDER, description: LENGTH, items: ["PVC Sewer and Drain Pipe 4 in. SDR-35 Bell End", "NDS PVC S&D 90 Deg. Elbow HUB x HUB White 4 in.", "NDS PVC S&D Tee HUB x HUB x HUB White 4 in.", "NDS Drain Grate Round Polyolefin Green 4 in.", "Christys Red Hot Glue", "Drain Rock"] },
  { name: "Underground: 3/4 in. waterline", group: UNDER, description: LENGTH, items: ["3/4 in. x 20 ft Sch. 40 Bell End PVC Pipe", "3/4 in. Couplings", "Christys Red Hot Glue", "Bedding sand"] },
  { name: "Underground: 1 in. waterline", group: UNDER, description: LENGTH, items: ["1 in. x 20 ft Sch. 40 Bell End PVC Pipe", "1 in. Couplings", "Christys Red Hot Glue", "Bedding sand"] },

  { name: "Irrigation: Drip system", group: IRR, description: "Priced by the valves, tubing lengths, plants and tree rings. Fill them in under Irrigation measurements.", items: ["Valves", "Drip tubing (0.625 in. diameter)", "Drip Tubing Adapter (1 in. x 3/4 in.)", "Drip Emitters", "Hunter drip filter", "Pressure Regulator (25 PSI)", "Backflow Preventer", "Ball Valve (shutoff)", "Pressure Gauge", "Stake Holders", "End Cap", "18 in. sch 80 risers with thread", "Black electrical tape", "Teflon tape 3/4 in.", "Christy's Red Hot Glue + primer"] },
  { name: "Irrigation: Optional controller and sensors", group: IRR, description: "Optional: confirm with the client before ordering.", items: ["Rain Bird Rain/Freeze Sensor Wireless w/Controller Interface", "Rain Bird Moisture Sensor", "Rain Bird model ESP-LXIVM 2-Wire Controller, 60 Station Capacity"] },
  { name: "Lighting: Install transformer", group: LIGHT, description: "Priced by the number of transformers.", items: ["Alliance TF150 OR TF300 Transformer"] },
  { name: "Lighting: Install lights", group: LIGHT, description: "Priced by the number of lights.", items: ["12Ga Galvanized Tiewire 50Ft Roll", "Waterproof Wire Nuts", "Alliance WL400-Bluetooth"] },

  { name: "Demo: dirt to haul away", group: DEMO, description: "Length and width in feet, depth in inches. Gives cubic yards of dirt to dump.", items: ["Dirt to haul away (demo)"] },
];
