import test from "node:test";
import assert from "node:assert/strict";
import { createBadgeSection } from "../nodes/library/badge-section.js";
import * as badges from "../nodes/badges.js";
import * as budgetLedger from "../nodes/command/budget-ledger.js";
import { createCommandNode } from "../nodes/command/index.js";
import { createAccessManager } from "../nodes/command/access-manager.js";
import { createPurchaseForm } from "../nodes/command/purchase-form.js";
import { createPurchaseRequests } from "../nodes/command/purchase-requests.js";
import * as dates from "../nodes/dates.js";
import { createLibraryNode } from "../nodes/library/index.js";
import { renderNavButtons } from "../nodes/navigation.js";
import * as ranks from "../nodes/ranks.js";
import { createSchoolhouseNode } from "../nodes/schoolhouse/index.js";
import { createWatchtowerNode } from "../nodes/watchtower/index.js";

test("all browser feature modules and their shared dependencies import", () => {
  for (const value of [
    createBadgeSection,
    badges.loadBadge,
    budgetLedger.aggregateBudgetRows,
    createCommandNode,
    createAccessManager,
    createPurchaseForm,
    createPurchaseRequests,
    dates.getWorldDatePresentation,
    createLibraryNode,
    renderNavButtons,
    ranks.normalizeRank,
    createSchoolhouseNode,
    createWatchtowerNode
  ]) {
    assert.equal(typeof value, "function");
  }
});
