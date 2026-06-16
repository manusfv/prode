import { describe, expect, it } from "vitest";
import { resolveTeamId } from "./tla";

const known = new Set(["arg", "mex", "rsa"]);

describe("resolveTeamId", () => {
  it("lowercases a TLA into our team id", () => {
    expect(resolveTeamId("MEX", known)).toBe("mex");
  });

  it("returns null when the resolved id is not a known team", () => {
    expect(resolveTeamId("ZZZ", known)).toBeNull();
  });
});
