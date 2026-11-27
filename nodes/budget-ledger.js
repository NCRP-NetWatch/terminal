const ENTRY_TYPES = new Set(["APPROPRIATION", "AMENDMENT", "ENCUMBRANCE", "LIQUIDATION", "ACTUAL"]);
const cents = (amount) => Math.round((Number(amount) + Number.EPSILON) * 100);
const dollars = (amount) => amount / 100;
const amountCents = (row) => Number.isFinite(Number(row.amount)) ? cents(row.amount) : 0;
const lineKey = (row) => [row.fiscal_year || "", row.fund_code || "", row.division || "", row.object_code || ""].join("::");
const refKey = (row) => [lineKey(row), row.ref_id || ""].join("::");
const textCompare = (a, b) => String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });

export function prepareLedgerSubmission(entries, existingRows = []) {
  const prepared = [];
  const workingRows = Array.isArray(existingRows) ? existingRows.slice() : [];
  const errors = [];
  let unchanged = 0;

  (Array.isArray(entries) ? entries : []).forEach((rawEntry, index) => {
    const entry = {
      ...rawEntry,
      fiscal_year: Number(rawEntry.fiscal_year),
      fund_code: String(rawEntry.fund_code || "").trim(),
      division: String(rawEntry.division || "").trim(),
      object_code: String(rawEntry.object_code || "").trim(),
      ref_id: String(rawEntry.ref_id || "").trim() || null,
      entry_type: String(rawEntry.entry_type || "").trim().toUpperCase(),
      amount: Number(rawEntry.amount),
      memo: String(rawEntry.memo || "").trim() || null
    };

    if (entry.entry_type !== "SET_AVAILABLE") {
      prepared.push(entry);
      workingRows.push(entry);
      return;
    }

    const rowNumber = index + 1;
    if (!Number.isInteger(entry.fiscal_year) || entry.fiscal_year < 1900 || entry.fiscal_year > 9999) errors.push("Row " + rowNumber + ": enter a valid fiscal year.");
    for (const [field, label] of [["fund_code", "fund"], ["division", "NODE"], ["object_code", "object code"]]) {
      if (!entry[field]) errors.push("Row " + rowNumber + ": " + label + " is required.");
    }
    if (!Number.isFinite(entry.amount)) errors.push("Row " + rowNumber + ": enter a valid target available balance.");
    if (!entry.memo) errors.push("Row " + rowNumber + ": enter a reason for the audit log.");
    if (errors.length) return;

    const current = aggregateBudgetRows(workingRows, {
      fiscalYear: entry.fiscal_year,
      fundCode: entry.fund_code
    }).rows.find((row) => row.division === entry.division && row.object_code === entry.object_code)?.available || 0;
    const adjustmentCents = cents(entry.amount) - cents(current);

    if (adjustmentCents === 0) {
      unchanged += 1;
      return;
    }

    const adjustment = {
      ...entry,
      entry_type: "AMENDMENT",
      amount: dollars(adjustmentCents),
      memo: ("Set available to $" + dollars(cents(entry.amount)).toFixed(2) + (entry.memo ? "; " + entry.memo : "" )).slice(0, 500)
    };
    prepared.push(adjustment);
    workingRows.push(adjustment);
  });

  return { entries: prepared, errors, unchanged };
}

export function aggregateBudgetRows(rows, { fiscalYear, fundCode } = {}) {
  const groups = new Map();

  for (const row of (Array.isArray(rows) ? rows : [])) {
    if (fiscalYear !== undefined && fiscalYear !== "" && Number(row.fiscal_year) !== Number(fiscalYear)) continue;
    if (fundCode !== undefined && fundCode !== "" && row.fund_code !== fundCode) continue;

    const key = lineKey(row);
    let group = groups.get(key);
    if (!group) {
      group = {
        fiscal_year: Number(row.fiscal_year),
        fund_code: row.fund_code,
        division: row.division,
        object_code: row.object_code,
        revisedCents: 0,
        encumberedCents: 0,
        actualsCents: 0
      };
      groups.set(key, group);
    }

    const amount = amountCents(row);
    if (row.entry_type === "APPROPRIATION" || row.entry_type === "AMENDMENT") group.revisedCents += amount;
    else if (row.entry_type === "ENCUMBRANCE") group.encumberedCents += amount;
    else if (row.entry_type === "LIQUIDATION") group.encumberedCents -= amount;
    else if (row.entry_type === "ACTUAL") group.actualsCents += amount;
  }

  const summary = [...groups.values()].map((group) => {
    const revised = dollars(group.revisedCents);
    const encumbered = dollars(group.encumberedCents);
    const actuals = dollars(group.actualsCents);
    const available = dollars(group.revisedCents - group.encumberedCents - group.actualsCents);
    const usedRate = revised > 0 ? (encumbered + actuals) / revised : 0;
    const availableRate = revised > 0 ? available / revised : 0;
    let status;

    if (available < 0) status = "OVER BUDGET";
    else if (revised <= 0) status = "UNFUNDED";
    else if (available === 0) status = "FULLY COMMITTED";
    else if (availableRate <= 0.25) status = "NEAR LIMIT";
    else status = "AVAILABLE";

    return {
      fiscal_year: group.fiscal_year,
      fund_code: group.fund_code,
      division: group.division,
      object_code: group.object_code,
      revised,
      encumbered,
      actuals,
      available,
      usedRate,
      status
    };
  }).sort((a, b) => a.fiscal_year - b.fiscal_year
    || textCompare(a.fund_code, b.fund_code)
    || textCompare(a.division, b.division)
    || textCompare(a.object_code, b.object_code));

  const totals = summary.reduce((total, row) => {
    total.totalRevised += row.revised;
    total.totalEncumbered += row.encumbered;
    total.totalActuals += row.actuals;
    total.totalAvailable += row.available;
    return total;
  }, { totalRevised: 0, totalEncumbered: 0, totalActuals: 0, totalAvailable: 0 });

  for (const key of Object.keys(totals)) totals[key] = dollars(cents(totals[key]));
  return { rows: summary, ...totals };
}

export function getAuditTrail(rows, { fiscalYear, fundCode, division, objectCode, refId } = {}) {
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => {
      if (fiscalYear !== undefined && Number(row.fiscal_year) !== Number(fiscalYear)) return false;
      if (refId !== undefined) return row.ref_id === refId;
      return (fundCode === undefined || row.fund_code === fundCode)
        && (division === undefined || row.division === division)
        && (objectCode === undefined || row.object_code === objectCode);
    })
    .slice()
    .sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0)
      || String(a.id || "").localeCompare(String(b.id || "")));
}

export function validateLedgerBatch(entries, existingRows = []) {
  const errors = [];
  const normalized = (Array.isArray(entries) ? entries : []).map((entry) => ({
    ...entry,
    fiscal_year: Number(entry.fiscal_year),
    fund_code: String(entry.fund_code || "").trim(),
    division: String(entry.division || "").trim(),
    object_code: String(entry.object_code || "").trim(),
    ref_id: String(entry.ref_id || "").trim() || null,
    entry_type: String(entry.entry_type || "").trim().toUpperCase(),
    amount: Number(entry.amount),
    memo: String(entry.memo || "").trim() || null
  }));

  const open = new Map();
  for (const row of existingRows) {
    const key = refKey(row);
    const value = open.get(key) || 0;
    if (row.entry_type === "ENCUMBRANCE") open.set(key, value + amountCents(row));
    if (row.entry_type === "LIQUIDATION") open.set(key, value - amountCents(row));
  }

  normalized.forEach((entry, index) => {
    const number = index + 1;
    if (!Number.isInteger(entry.fiscal_year) || entry.fiscal_year < 1900 || entry.fiscal_year > 9999) errors.push("Row " + number + ": enter a valid fiscal year.");
    for (const [field, label] of [["fund_code", "fund"], ["division", "division"], ["object_code", "object code"]]) {
      if (!entry[field]) errors.push("Row " + number + ": " + label + " is required.");
    }
    if (!ENTRY_TYPES.has(entry.entry_type)) errors.push("Row " + number + ": choose a valid entry type.");
    if (!Number.isFinite(entry.amount) || entry.amount === 0) errors.push("Row " + number + ": amount must be a non-zero number.");
    if (!entry.memo) errors.push("Row " + number + ": enter a reason for the audit log.");
    if (entry.entry_type !== "AMENDMENT" && Number.isFinite(entry.amount) && entry.amount < 0) {
      errors.push("Row " + number + ": " + entry.entry_type.toLowerCase() + " amounts must be positive; use a negative amendment to reduce an appropriation.");
    }
    if (["ENCUMBRANCE", "LIQUIDATION"].includes(entry.entry_type) && !entry.ref_id) {
      errors.push("Row " + number + ": a reference ID is required for " + entry.entry_type.toLowerCase() + " entries.");
    }
    if (entry.entry_type === "ENCUMBRANCE" && entry.amount > 0) {
      const key = refKey(entry);
      open.set(key, (open.get(key) || 0) + cents(entry.amount));
    }
    if (entry.entry_type === "LIQUIDATION" && Number.isFinite(entry.amount) && entry.amount > 0) {
      const key = refKey(entry);
      const value = open.get(key) || 0;
      if (cents(entry.amount) > value) {
        errors.push("Row " + number + ": liquidation (" + entry.amount.toFixed(2) + ") exceeds open encumbrance (" + dollars(value).toFixed(2) + ") for " + entry.ref_id + ".");
      } else {
        open.set(key, value - cents(entry.amount));
      }
    }
  });

  return { valid: errors.length === 0, errors, entries: normalized };
}
