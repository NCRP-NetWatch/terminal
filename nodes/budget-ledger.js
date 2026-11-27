import { getWorldDateSortValue } from "./dates.js";

const ENTRY_TYPES = new Set(["INITIAL_DEPOSIT", "ACTUAL", "DEPOSIT", "ENCUMBRANCE", "LIQUIDATION", "PURCHASE", "CREDIT"]);
const cents = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100);
const dollars = (amount) => amount / 100;
const amountCents = (row) => Number.isFinite(Number(row.amount)) ? cents(row.amount) : 0;
const textCompare = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
const INITIAL_DEPOSIT_MARKER = "[INITIAL DEPOSIT]";

export function isInitialDeposit(row) {
  return row.entry_type === "APPROPRIATION"
    && String(row.memo ?? "").trim().toUpperCase().startsWith(INITIAL_DEPOSIT_MARKER);
}

const commitmentKey = (row) => [
  String(row.fund_code ?? "").trim().toUpperCase(),
  String(row.division ?? "").trim(),
  String(row.object_code ?? "").trim(),
  String(row.ref_id ?? "").trim()
].join("::");

export function getOpenCommitments(rows) {
  const commitments = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!["ENCUMBRANCE", "LIQUIDATION"].includes(row.entry_type) || !row.ref_id) continue;
    const key = commitmentKey(row);
    const commitment = commitments.get(key) || { ...row, amountCents: 0 };
    commitment.amountCents += row.entry_type === "ENCUMBRANCE" ? amountCents(row) : -amountCents(row);
    commitments.set(key, commitment);
  }
  return [...commitments.values()]
    .filter((item) => item.amountCents > 0)
    .map(({ amountCents: value, ...item }) => ({ ...item, open_amount: dollars(value) }));
}

function rowTime(row, index) {
  const value = getWorldDateSortValue(row.created_at);
  return value ?? Number.MAX_SAFE_INTEGER + index;
}

function getFundHistory(rows, fundCode) {
  return rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => String(row.fund_code ?? "").trim().toUpperCase() === fundCode)
    .sort((a, b) => rowTime(a.row, a.index) - rowTime(b.row, b.index))
    .map(({ row }) => row);
}

export function aggregateBudgetRows(rows, { fundCode } = {}) {
  const entries = Array.isArray(rows) ? rows : [];
  const funds = new Set();
  for (const row of entries) {
    const fund = String(row.fund_code ?? "").trim().toUpperCase();
    if (fund) funds.add(fund);
  }
  const selectedFund = fundCode === undefined || fundCode === ""
    ? undefined
    : String(fundCode).trim().toUpperCase();
  const summary = [];

  for (const fund of funds) {
    if (selectedFund && fund !== selectedFund) continue;
    const history = getFundHistory(entries, fund);
    const initialDeposit = history.find(isInitialDeposit);
    const starter = initialDeposit ? amountCents(initialDeposit) : undefined;
    const hasInitialDeposit = Boolean(initialDeposit);
    const initialIndex = initialDeposit ? history.indexOf(initialDeposit) : -1;
    const actualEntry = initialDeposit
      ? history.slice(initialIndex + 1).filter((row) => row.entry_type === "ACTUAL").at(-1)
      : undefined;
    const balanceEntry = actualEntry || initialDeposit;
    const balanceIndex = balanceEntry ? history.indexOf(balanceEntry) : -1;
    const actualsCents = hasInitialDeposit
      ? amountCents(balanceEntry) + history.slice(balanceIndex + 1).reduce((total, row) => {
        if (row.entry_type === "PURCHASE") return total - amountCents(row);
        if (["CREDIT", "DEPOSIT"].includes(row.entry_type)) return total + amountCents(row);
        return total;
      }, 0)
      : undefined;
    const openByScope = new Map();
    const openByRef = new Map();

    for (const row of history) {
      if (row.entry_type === "ENCUMBRANCE" || row.entry_type === "LIQUIDATION") {
        const amount = amountCents(row);
        const scope = [row.division || "", row.object_code || ""].join("::");
        const ref = [scope, row.ref_id || ""].join("::");
        const delta = row.entry_type === "ENCUMBRANCE" ? amount : -amount;
        openByScope.set(scope, (openByScope.get(scope) || 0) + delta);
        openByRef.set(ref, (openByRef.get(ref) || 0) + delta);
      }
    }

    const encumberedCents = [...openByRef.values()].reduce((sum, amount) => sum + amount, 0);
    const scopes = [...openByScope.entries()].filter(([, amount]) => amount > 0);
    const ownerNode = String(initialDeposit?.division ?? "").trim();
    const nodes = ownerNode
      ? [ownerNode]
      : [...new Set(scopes.map(([scope]) => scope.split("::")[0]).filter(Boolean))].sort(textCompare);
    const objectCodes = [...new Set([
      ...scopes.map(([scope]) => scope.split("::")[1]),
      ...history.filter((row) => ["PURCHASE", "CREDIT"].includes(row.entry_type)).map((row) => row.object_code)
    ].filter(Boolean))].sort(textCompare);
    const availableCents = hasInitialDeposit ? actualsCents - encumberedCents : undefined;
    const usedRate = hasInitialDeposit && starter > 0
      ? Math.max(0, (starter - actualsCents + encumberedCents) / starter)
      : undefined;
    let status = "NO INITIAL DEPOSIT";
    if (hasInitialDeposit) {
      if (availableCents < 0) status = "OVER COMMITTED";
      else if (availableCents === 0) status = "FULLY COMMITTED";
      else if (usedRate >= 0.75) status = "NEAR LIMIT";
      else status = "AVAILABLE";
    }

    summary.push({
      fund_code: fund,
      node: nodes.join(", "),
      object_code: objectCodes.join(", "),
      starter: starter === undefined ? undefined : dollars(starter),
      encumbered: dollars(encumberedCents),
      actuals: actualsCents === undefined ? undefined : dollars(actualsCents),
      available: availableCents === undefined ? undefined : dollars(availableCents),
      usedRate,
      status
    });
  }

  summary.sort((a, b) => textCompare(a.fund_code, b.fund_code));
  const totals = summary.reduce((total, row) => {
    if (row.starter !== undefined) {
      total.totalStarter += row.starter;
      if (row.actuals !== undefined) total.totalActuals += row.actuals;
      if (row.available !== undefined) total.totalAvailable += row.available;
      if (row.status !== "NO INITIAL DEPOSIT") total.fundedEncumbered += row.encumbered;
      else total.unfundedEncumbered += row.encumbered;
    } else {
      total.unfundedEncumbered += row.encumbered;
    }
    return total;
  }, { totalStarter: 0, totalActuals: 0, totalAvailable: 0, fundedEncumbered: 0, unfundedEncumbered: 0 });
  for (const key of Object.keys(totals)) totals[key] = dollars(cents(totals[key]));
  totals.totalEncumbered = dollars(cents(totals.fundedEncumbered + totals.unfundedEncumbered));
  totals.totalUsedRate = totals.totalStarter > 0
    ? Math.max(0, (totals.totalStarter - totals.totalActuals + totals.fundedEncumbered) / totals.totalStarter)
    : undefined;

  return { rows: summary, ...totals };
}

export function getAuditTrail(rows, { fiscalYear, fundCode, division, objectCode, purchaseId } = {}) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      if (fiscalYear !== undefined && Number(row.fiscal_year) !== Number(fiscalYear)) return false;
      if (fundCode !== undefined && String(row.fund_code ?? "").toUpperCase() !== String(fundCode).toUpperCase()) return false;
      if (purchaseId !== undefined) return row.ref_id === purchaseId;
      return (division === undefined || row.division === division)
        && (objectCode === undefined || row.object_code === objectCode);
    })
    .slice()
    .sort((a, b) => (getWorldDateSortValue(a.created_at) ?? Number.MAX_SAFE_INTEGER)
      - (getWorldDateSortValue(b.created_at) ?? Number.MAX_SAFE_INTEGER)
      || String(a.id || "").localeCompare(String(b.id || "")));
}

export function validateLedgerBatch(entries, existingRows = [], activeNodeNames = []) {
  const errors = [];
  const normalized = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    fiscal_year: Number(entry.fiscal_year),
    fund_code: String(entry.fund_code || "").trim().toUpperCase(),
    division: String(entry.division || "").trim(),
    object_code: String(entry.object_code || "").trim(),
    ref_id: String(entry.ref_id || "").trim() || null,
    entry_type: String(entry.entry_type || "").trim().toUpperCase(),
    amount: Number(entry.amount),
    memo: String(entry.memo || "").trim() || null
  }));
  const existingInitialFunds = new Set((Array.isArray(existingRows) ? existingRows : [])
    .filter(isInitialDeposit)
    .map((row) => String(row.fund_code ?? "").trim().toUpperCase()));
  const initialFunds = new Set(existingInitialFunds);
  const newInitialFunds = new Set();
  const actualFundsInBatch = new Set();

  normalized.forEach((entry, index) => {
    const number = index + 1;
    if (!Number.isInteger(entry.fiscal_year) || entry.fiscal_year < 1900 || entry.fiscal_year > 9999) errors.push("Row " + number + ": enter a valid fiscal year.");
    if (!entry.fund_code) errors.push("Row " + number + ": fund is required.");
    if (!ENTRY_TYPES.has(entry.entry_type)) errors.push("Row " + number + ": choose a valid budget action.");
    if (!Number.isFinite(entry.amount) || entry.amount < 0 || (entry.amount === 0 && !["ACTUAL", "INITIAL_DEPOSIT"].includes(entry.entry_type))) errors.push("Row " + number + ": enter a valid non-negative amount.");
    if (!entry.memo) errors.push("Row " + number + ": enter a reason for the audit log.");

    if (["ENCUMBRANCE", "LIQUIDATION", "PURCHASE", "CREDIT"].includes(entry.entry_type)) {
      if (!entry.division) errors.push("Row " + number + ": NODE is required for a purchase action.");
      if (!entry.object_code) errors.push("Row " + number + ": OBJCODE is required for a purchase action.");
      if (!entry.ref_id) errors.push("Row " + number + ": a Purchase ID is required for a purchase action.");
      if (activeNodeNames.length && !activeNodeNames.some((node) => String(node).toUpperCase() === entry.division.toUpperCase())) {
        errors.push("Row " + number + ": choose an active NODE.");
      }
    }

    if (entry.entry_type === "INITIAL_DEPOSIT") {
      if (initialFunds.has(entry.fund_code)) {
        errors.push("Row " + number + ": an initial deposit already exists for fund " + entry.fund_code + ". It cannot be changed or replaced.");
      } else if ((Array.isArray(existingRows) ? existingRows : []).some((row) => String(row.fund_code ?? "").trim().toUpperCase() === entry.fund_code)) {
        errors.push("Row " + number + ": the initial deposit must be the first ledger entry for fund " + entry.fund_code + ".");
      } else {
        initialFunds.add(entry.fund_code);
        newInitialFunds.add(entry.fund_code);
      }
    }

    if (entry.entry_type !== "INITIAL_DEPOSIT" && !existingInitialFunds.has(entry.fund_code)) {
      errors.push("Row " + number + ": post the fund's initial deposit in a separate batch before recording other activity.");
    } else if (entry.entry_type !== "INITIAL_DEPOSIT" && newInitialFunds.has(entry.fund_code)) {
      errors.push("Row " + number + ": post the fund's initial deposit in a separate batch before recording other activity.");
    }

    if (entry.entry_type === "ACTUAL") {
      if (actualFundsInBatch.has(entry.fund_code)) errors.push("Row " + number + ": set the actual balance once per fund in each batch.");
      actualFundsInBatch.add(entry.fund_code);
    }
  });

  const open = new Map(getOpenCommitments(existingRows).map((item) => [commitmentKey(item), cents(item.open_amount)]));

  normalized.forEach((entry, index) => {
    const number = index + 1;
    const key = commitmentKey(entry);
    if (entry.entry_type === "ENCUMBRANCE" && entry.amount > 0) {
      open.set(key, (open.get(key) || 0) + cents(entry.amount));
    }
    if (entry.entry_type === "LIQUIDATION" && entry.amount > 0) {
      const amountOpen = open.get(key) || 0;
      if (cents(entry.amount) > amountOpen) {
        errors.push("Row " + number + ": release exceeds the open amount for Purchase ID " + entry.ref_id + ".");
      } else {
        open.set(key, amountOpen - cents(entry.amount));
      }
    }
  });

  return { valid: errors.length === 0, errors, entries: normalized };
}
