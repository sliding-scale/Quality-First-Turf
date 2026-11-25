import { describe, expect, it } from "vitest";
import { catalogue } from "../../convex/shared/catalogue";
import { photoIdsForLine } from "../../convex/crm/lib/linePhotos";
import type { ReadArea } from "../../convex/crm/lib/visitData";

const id = (n: string) => n as never;
const area = (over: Partial<ReadArea>): ReadArea => ({ label: "Front", length: null, width: null, quantity: null, notes: "", photoIds: [], ...over });

describe("photoIdsForLine", () => {
  const sod = catalogue.find((c) => c.addOn === null && c.installType !== null)!;
  it("gives a line the photos of the work areas for its service", () => {
    const got = photoIdsForLine(sod, [area({ service: sod.service, installType: sod.installType ?? undefined, photoIds: [id("a"), id("b")] }), area({ service: "Pavers", photoIds: [id("c")] })]);
    expect(got).toEqual(["a", "b"]);
  });
  it("skips an area for another installation type, an area with no service, and add-ons", () => {
    expect(photoIdsForLine(sod, [area({ service: sod.service, installType: "Other type", photoIds: [id("a")] }), area({ photoIds: [id("b")] })])).toEqual([]);
    const addOn = catalogue.find((c) => c.addOn !== null)!;
    expect(photoIdsForLine(addOn, [area({ service: addOn.service, photoIds: [id("a")] })])).toEqual([]);
  });
});
