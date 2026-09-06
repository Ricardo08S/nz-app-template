import { describe, expect, it } from "vitest";
import { mergePermissions, oidcPicture } from "../../src/common.js";

describe("mergePermissions", () => {
  it("merges user and role permissions, deduped", () => {
    expect(mergePermissions(["a", "b"], ["b", "c"])).toEqual(["a", "b", "c"]);
  });

  it("handles one side empty", () => {
    expect(mergePermissions([], ["x"])).toEqual(["x"]);
    expect(mergePermissions(["x"], [])).toEqual(["x"]);
  });

  it("never splits a permission string into characters", () => {
    // Regression: `new Set(...a, ...b)` treated the first permission string
    // as a single-arg iterable and iterated its characters.
    const result = mergePermissions(["read:users"], ["write:posts"]);
    expect(result).toEqual(["read:users", "write:posts"]);
    expect(result).not.toContain("r");
  });
});

describe("oidcPicture", () => {
  it("returns the picture field when present", () => {
    expect(oidcPicture({ picture: "https://example.com/avatar.png" })).toBe(
      "https://example.com/avatar.png",
    );
  });

  it("returns undefined for null, non-objects, or missing/non-string picture", () => {
    expect(oidcPicture(null)).toBeUndefined();
    expect(oidcPicture("not-an-object")).toBeUndefined();
    expect(oidcPicture({})).toBeUndefined();
    expect(oidcPicture({ picture: 123 })).toBeUndefined();
  });
});
