import test from "node:test";
import assert from "node:assert/strict";
import {
  WORLD_YEAR_OFFSET,
  getWorldDatePresentation,
  getWorldDateSortValue,
  getWorldDateTimePresentation,
  getWorldFiscalYear
} from "../nodes/dates.js";

test("world dates preserve the source month/day and apply the configured year offset", () => {
  assert.equal(getWorldDatePresentation("2025-02-03").iso, `${2025 + WORLD_YEAR_OFFSET}-02-03`);
  assert.equal(getWorldFiscalYear(new Date("2025-07-01T12:00:00Z")), 2025 + WORLD_YEAR_OFFSET);
});

test("date parsing is deterministic for date-only input and rejects invalid values", () => {
  assert.equal(getWorldDateSortValue("2025-02-03"), Date.parse("2025-02-03T12:00:00Z"));
  assert.equal(getWorldDateSortValue("not a date"), null);
  assert.equal(getWorldDatePresentation("not a date"), null);
  assert.equal(getWorldFiscalYear("not a date"), null);
});

test("datetime presentation returns the shifted ISO value", () => {
  assert.equal(
    getWorldDateTimePresentation("2025-02-03T04:05:06Z").iso,
    `${2025 + WORLD_YEAR_OFFSET}-02-03T04:05:06.000Z`
  );
});
