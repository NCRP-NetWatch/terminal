import test from "node:test";
import assert from "node:assert/strict";
import {
  formatRank,
  getBadgeIdForRank,
  getRankLevel,
  hasProfileFlag,
  isAuthorizedRank,
  isProbationaryRank,
  isReadOnlyRank,
  isTraceOnlyRank,
  normalizeRank
} from "../nodes/ranks.js";

test("rank normalization accepts case, whitespace, and underscore variants", () => {
  assert.equal(normalizeRank("  Senior__Agent "), "senior agent");
  assert.equal(formatRank("ncpd_command"), "NCPD Command");
});

test("rank access, levels, and badge mapping remain explicit", () => {
  assert.equal(isAuthorizedRank("NCRP Staff"), true);
  assert.equal(isAuthorizedRank("administrator"), false);
  assert.equal(getRankLevel("section chief"), 6);
  assert.equal(getRankLevel("unknown"), -1);
  assert.equal(getBadgeIdForRank("senior agent"), "senior-agent");
  assert.equal(getBadgeIdForRank("ncpd command"), null);
  assert.equal(isReadOnlyRank("NCPD Detective"), true);
  assert.equal(isTraceOnlyRank("NCPD Detective"), true);
  assert.equal(isProbationaryRank("probationary agent"), true);
  assert.equal(hasProfileFlag({ flags: ["FINANCE"] }, "FINANCE"), true);
  assert.equal(hasProfileFlag({ flags: "FINANCE" }, "FINANCE"), false);
});
