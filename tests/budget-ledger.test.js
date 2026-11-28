import test from "node:test";
import assert from "node:assert/strict";
import {
  aggregateBudgetRows,
  filterBudgetSummary,
  getAuditTrail,
  getOpenCommitments,
  isInitialDeposit,
  validateLedgerBatch
} from "../nodes/command/budget-ledger.js";

const ledger = [
  { id: "1", created_at: "2025-01-01T00:00:00Z", fund_code: "A", division: "NODE-A", entry_type: "APPROPRIATION", amount: 1000, memo: "[INITIAL DEPOSIT] opening" },
  { id: "2", created_at: "2025-01-02T00:00:00Z", fund_code: "A", division: "NODE-A", entry_type: "ACTUAL", amount: 1000, memo: "cash balance" },
  { id: "3", created_at: "2025-01-03T00:00:00Z", fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-1", entry_type: "ENCUMBRANCE", amount: 300, memo: "hold" },
  { id: "4", created_at: "2025-01-04T00:00:00Z", fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-1", entry_type: "LIQUIDATION", amount: 100, memo: "release" },
  { id: "5", created_at: "2025-01-05T00:00:00Z", fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-1", entry_type: "PURCHASE", amount: 50, memo: "purchase" },
  { id: "6", created_at: "2025-01-06T00:00:00Z", fund_code: "B", division: "NODE-B", entry_type: "APPROPRIATION", amount: 500, memo: "[INITIAL DEPOSIT] opening" }
];

test("initial deposit detection and fund aggregation retain ledger semantics", () => {
  assert.equal(isInitialDeposit(ledger[0]), true);
  assert.deepEqual(getOpenCommitments(ledger).map(({ fund_code, open_amount }) => [fund_code, open_amount]), [["A", 150]]);
  const result = aggregateBudgetRows(ledger);
  assert.deepEqual(result.rows.map(({ fund_code, actuals, encumbered, available, status }) => [fund_code, actuals, encumbered, available, status]), [
    ["A", 950, 150, 800, "AVAILABLE"],
    ["B", 500, 0, 500, "AVAILABLE"]
  ]);
  assert.equal(result.totalActuals, 1450);
  assert.equal(aggregateBudgetRows(ledger, { fundCode: "b" }).rows.length, 1);
});

test("legacy same-time held-fund payment pairs reduce a commitment only once", () => {
  const legacyPayment = [
    { fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-2", entry_type: "ENCUMBRANCE", amount: 100 },
    { fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-2", created_at: "2025-02-01T00:00:00Z", entry_type: "LIQUIDATION", amount: 40 },
    { fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-2", created_at: "2025-02-01T00:00:00Z", entry_type: "PURCHASE", amount: 40 }
  ];

  assert.deepEqual(getOpenCommitments(legacyPayment).map(({ open_amount }) => open_amount), [60]);
});

test("audit filters preserve chronological ordering", () => {
  const trail = getAuditTrail(ledger, { fundCode: "A", purchaseId: "P-1" });
  assert.deepEqual(trail.map((row) => row.id), ["3", "4", "5"]);
});

test("filtering an aggregate summary matches aggregating the selected fund directly", () => {
  const summary = aggregateBudgetRows(ledger);
  assert.deepEqual(filterBudgetSummary(summary, "a"), aggregateBudgetRows(ledger, { fundCode: "A" }));
  assert.deepEqual(filterBudgetSummary(summary, "missing"), aggregateBudgetRows(ledger, { fundCode: "missing" }));
  assert.equal(filterBudgetSummary(summary, " "), summary);
});

test("ledger batch validation rejects posting before an initial deposit", () => {
  const result = validateLedgerBatch([
    { fiscal_year: 2076, fund_code: "C", entry_type: "DEPOSIT", amount: 10, memo: "top up" }
  ]);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /initial deposit in a separate batch/);
});

test("ledger batch validation accepts a bounded purchase against available cash", () => {
  const result = validateLedgerBatch([
    { fiscal_year: 2076, fund_code: "A", division: "NODE-A", object_code: "SUPPLIES", ref_id: "P-2", entry_type: "ENCUMBRANCE", amount: 100, memo: "approved hold" }
  ], ledger, ["NODE-A"]);
  assert.equal(result.valid, true, result.errors.join(" "));
  assert.equal(result.entries[0].fund_code, "A");
});
