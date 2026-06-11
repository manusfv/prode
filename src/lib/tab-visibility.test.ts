import { describe, expect, it } from "vitest";

import { getTabVisibility } from "./tab-visibility";

describe("getTabVisibility", () => {
  it("defaults both tabs to visible when settings are empty", () => {
    expect(getTabVisibility([])).toEqual({
      standingsVisible: true,
      resultsVisible: true,
    });
  });

  it("reflects disabled settings", () => {
    expect(
      getTabVisibility([
        { key: "standings", enabled: false },
        { key: "results", enabled: true },
      ]),
    ).toEqual({ standingsVisible: false, resultsVisible: true });
  });

  it("defaults a missing key to visible", () => {
    expect(getTabVisibility([{ key: "results", enabled: false }])).toEqual({
      standingsVisible: true,
      resultsVisible: false,
    });
  });
});
