import { describe, it, expect } from "vitest";
import { buildSearchBlob } from "@/lib/audit";

describe("search_blob substring matching", () => {
  it("contains last name even when first name comes first", () => {
    const blob = buildSearchBlob({
      first_name: "Scott",
      last_name: "Zimmerman",
      email: null,
      company: "",
      title: null,
      city: null,
      tags: [],
    });
    expect(blob).toBe("scott zimmerman");
    // The bug: ZeroDB's `search` parameter only prefix-matched, so
    // "zimmerman" never hit this blob. The workaround uses
    // String.prototype.includes which does substring.
    expect(blob.includes("zimmerman")).toBe(true);
    expect(blob.includes("scott")).toBe(true);
    expect(blob.includes("Zimmerman".toLowerCase())).toBe(true);
  });

  it("normalises tags into the blob so tag searches work", () => {
    const blob = buildSearchBlob({
      first_name: "A",
      last_name: null,
      email: null,
      company: "B",
      title: null,
      city: null,
      tags: ["target-list", "q1-priority"],
    });
    expect(blob.includes("target-list")).toBe(true);
    expect(blob.includes("q1-priority")).toBe(true);
  });
});
