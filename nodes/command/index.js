import { renderNavButtons } from "../navigation.js";
import { normalizeRank } from "../ranks.js";
import { getWorldDatePresentation, getWorldFiscalYear } from "../dates.js";
import { aggregateBudgetRows, filterBudgetSummary, getAuditTrail, getOpenCommitments, isInitialDeposit, validateLedgerBatch } from "./budget-ledger.js";
import { createAccessManager } from "./access-manager.js";
import { createPurchaseRequests } from "./purchase-requests.js";
import { createPurchaseForm } from "./purchase-form.js";

export function createCommandNode({ viewEl, subNavEl, contentEl, budgetContentEl, budgetFormContentEl, entryContentEl, notesDialogEl, notesTitleEl, notesListEl, closeNotesEl, activeNodeNames = [], getSupabaseClient, getCurrentProfile, isReadOnly = () => false, hasCommandAccess = () => false, hasFinanceAccess = () => false }) {
  let ledgerRows = [];
  let activeView = "access-manager";
  let budgetSummary = aggregateBudgetRows(ledgerRows);
  let openCommitments = getOpenCommitments(ledgerRows);
  let filteredBudgetCacheKey;
  let filteredBudgetCache;
  const budgetBody=budgetContentEl.querySelector("[data-budget-body]"),budgetStatus=budgetContentEl.querySelector("[data-budget-status]"),fundFilter=budgetContentEl.querySelector("[data-budget-fund]"),search=budgetContentEl.querySelector("[data-budget-search]"),sort=budgetContentEl.querySelector("[data-budget-sort]"),totals=budgetContentEl.querySelector("[data-budget-totals]");
  const entryRows=entryContentEl.querySelector("[data-ledger-entry-rows]"),entryMessage=entryContentEl.querySelector("[data-ledger-entry-message]"),addRow=entryContentEl.querySelector("[data-add-ledger-row]"),entryForm=entryContentEl.querySelector("[data-ledger-entry-form]");
  const purchaseRequestsBody=budgetFormContentEl.querySelector("[data-purchase-requests]");
  const purchaseMessageEl=budgetFormContentEl.querySelector("[data-purchase-message]");
  const fundSuggestionsList=entryContentEl.querySelector("#budgetFundSuggestions");
  const amountFormat=new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const formatAmount=value=>"€$"+amountFormat.format(value);
  const isFinanceUser=()=>hasFinanceAccess()&&!isReadOnly();
  const isCommandUser=()=>hasCommandAccess()&&!isReadOnly();
  const canViewPersonnel=()=>isCommandUser()||normalizeRank(getCurrentProfile()?.rank)==="ncpd command";
  const canViewBudget=()=>isFinanceUser()||isCommandUser()||normalizeRank(getCurrentProfile()?.rank)==="ncpd command";
  const canSubmitRequest=()=>Boolean(getCurrentProfile()?.rank)&&!isReadOnly()&&!isFinanceUser();
  const entryTypes=[
    {value:"INITIAL_DEPOSIT",label:"Initial deposit"},
    {value:"ACTUAL",label:"Set cash balance"}
  ];
  const entryGuidance={
    INITIAL_DEPOSIT:"Starts this Fund's budget and cash balance.",
    ACTUAL:"Set the current cash balance before open commitments are deducted."
  };
  const cell=v=>{const td=document.createElement("td");td.textContent=v;return td;};

  const accessManager = createAccessManager({
    contentEl,
    getCurrentProfile,
    isReadOnly,
    isCommandUser,
    getSupabaseClient
  });

  function replaceLedgerRows(rows) {
    ledgerRows = Array.isArray(rows) ? rows : [];
    budgetSummary = aggregateBudgetRows(ledgerRows);
    openCommitments = getOpenCommitments(ledgerRows);
    filteredBudgetCacheKey = undefined;
    filteredBudgetCache = undefined;
  }

  function getBudgetSummary(fundCode = "") {
    const selectedFund = String(fundCode).trim().toUpperCase();
    if (!selectedFund) return budgetSummary;
    if (selectedFund === filteredBudgetCacheKey) return filteredBudgetCache;
    filteredBudgetCacheKey = selectedFund;
    filteredBudgetCache = filterBudgetSummary(budgetSummary, selectedFund);
    return filteredBudgetCache;
  }

  function renderBudget() {
    const result = getBudgetSummary(fundFilter.value);
    totals.textContent = "Held Funds " + formatAmount(result.totalEncumbered)
      + " · Gross Balance " + formatAmount(result.totalActuals)
      + " · Available " + formatAmount(result.totalAvailable);
    const query = search.value.trim().toLocaleLowerCase();
    const [sortField, sortDirection] = sort.value.split("-");
    const shown = result.rows
      .filter((row) => [row.fund_code, row.node].join(" ").toLocaleLowerCase().includes(query))
      .sort((left, right) => {
        const a = left[sortField];
        const b = right[sortField];
        const comparison = typeof a === "number"
          ? a - b
          : String(a || "").localeCompare(String(b || ""), undefined, { numeric: true, sensitivity: "base" });
        return sortDirection === "desc" ? -comparison : comparison;
      });

    budgetBody.replaceChildren(...shown.map((row) => {
      const tr = document.createElement("tr");
      const availableCell = document.createElement("td");
      const statusCell = document.createElement("td");
      const badge = document.createElement("span");
      const statusClass = {
        "OVER COMMITTED": "hostile",
        "NEAR LIMIT": "monitored",
        "FULLY COMMITTED": "monitored",
        AVAILABLE: "contained",
        "NO INITIAL DEPOSIT": "neutral"
      }[row.status];
      const rowClass = {
        hostile: "row-status-hostile",
        monitored: "row-status-monitored",
        contained: "row-status-contained",
        neutral: "row-status-neutral"
      }[statusClass];
      tr.classList.add(rowClass);

      const fundCell = document.createElement("td");
      const fundButton = document.createElement("button");
      fundButton.type = "button";
      fundButton.className = "person-name";
      fundButton.textContent = row.fund_code;
      fundButton.setAttribute("aria-label", `View budget history for fund ${row.fund_code}`);
      fundButton.addEventListener("click", () => openAudit({ fundCode: row.fund_code }));
      fundCell.append(fundButton);

      availableCell.textContent = row.available === undefined ? "—" : formatAmount(row.available);
      badge.className = `budget-status status-${statusClass}`;
      badge.textContent = row.status;
      statusCell.className = "budget-status-cell";
      statusCell.append(badge);
      tr.append(
        fundCell,
        cell(row.node || "—"),
        cell(row.actuals === undefined ? "—" : formatAmount(row.actuals)),
        cell(formatAmount(row.encumbered)),
        availableCell,
        statusCell
      );
      return tr;
    }));
    budgetStatus.textContent = `${shown.length} funds shown.`;
  }

  function openAudit(selection) {
    const trail = getAuditTrail(ledgerRows, selection);
    const scope = [
      selection.fiscalYear ? `FY ${selection.fiscalYear}` : "",
      selection.fundCode ? `FUND ${selection.fundCode}` : "",
      selection.division ? `NODE ${selection.division}` : "",
      selection.objectCode ? `OBJCODE ${selection.objectCode}` : "",
      selection.purchaseId ? `PURCHASE ${selection.purchaseId}` : ""
    ].filter(Boolean).join(" / ");
    notesTitleEl.textContent = `BUDGET AUDIT // ${scope || "ALL ENTRIES"}`;
    notesListEl.replaceChildren(...trail.map((row) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      const memo = document.createElement("span");
      const meta = document.createElement("time");
      const date = getWorldDatePresentation(row.created_at);
      const entryLabel = isInitialDeposit(row)
        ? "INITIAL DEPOSIT"
        : row.entry_type === "ACTUAL"
          ? "CASH BALANCE"
          : row.entry_type === "CREDIT"
            ? "WITHDRAW MONEY"
            : row.entry_type;
      title.textContent = `${entryLabel} — ${formatAmount(Number(row.amount))}`;
      memo.className = "note-meta";
      memo.textContent = (row.memo || "").replace(/^\[INITIAL DEPOSIT\]\s*/i, "") || "No reason recorded.";
      meta.className = "note-meta";
      meta.dateTime = date?.iso || "";
      const agentName = accessManager.getAgentName(row.recorded_by);
      const actor = agentName || (isInitialDeposit(row) && !row.recorded_by ? "SYSTEM" : "Unknown agent");
      const location = [row.division, row.object_code].filter(Boolean).join(" / ");
      const reference = row.ref_id
        ? ` · ${row.entry_type === "CREDIT" ? "WITHDRAWAL ID " : "PURCHASE ID "}${row.ref_id}`
        : "";
      meta.textContent = `${date?.label || "Unknown date"} · ${actor} · FY ${row.fiscal_year}`
        + (location ? ` · ${location}` : "") + reference;
      item.append(title, memo, meta);
      return item;
    }));
    if (!trail.length) {
      const empty = document.createElement("li");
      empty.textContent = "No audit entries found.";
      notesListEl.append(empty);
    }
    if (!notesDialogEl.open) notesDialogEl.showModal();
  }

  function createEntryRow(values={}) {
    const row = document.createElement("tr");
    const fields = [
      ["fiscal_year", "number", "Fiscal year"],
      ["fund_code", "text", "Fund"],
      ["entry_type", "select", "Budget action"],
      ["amount", "number", "Amount"],
      ["memo", "text", "Reason"]
    ];
    for (const [name, type, label] of fields) {
      const cellEl = document.createElement("td");
      let input;
      let guidance;
      if (type === "select") {
        input = document.createElement("select");
        input.className = "db-sort";
        const blank = document.createElement("option");
        blank.value = "";
        blank.textContent = "Choose budget action";
        input.append(blank);
        for (const item of entryTypes) {
          const option = document.createElement("option");
          option.value = item.value;
          option.textContent = item.label;
          input.append(option);
        }
        guidance = document.createElement("small");
        guidance.className = "ledger-entry-guidance";
        guidance.setAttribute("aria-live", "polite");
      } else {
        input = document.createElement("input");
        input.type = type;
        input.required = false;
        if (type === "number") {
          input.step = name === "amount" ? "0.01" : "1";
          if (name === "amount") input.inputMode = "decimal";
        }
        if (name === "fund_code") input.setAttribute("list", fundSuggestionsList.id);
      }

      input.name = name;
      input.autocomplete = "off";
      input.setAttribute("aria-label", label);
      input.value = values[name] || (name === "fiscal_year" ? String(getWorldFiscalYear()) : "");
      if (name === "memo") {
        input.required = true;
        input.maxLength = 500;
        input.placeholder = "Reason for entry";
      }
      cellEl.append(input);
      if (guidance) cellEl.append(guidance);
      row.append(cellEl);
    }

    const typeInput = row.querySelector('[name="entry_type"]');
    const amountInput = row.querySelector('[name="amount"]');
    const memoInput = row.querySelector('[name="memo"]');
    const guidance = typeInput.parentElement.querySelector(".ledger-entry-guidance");
    const updateEntryGuidance = () => {
      const isInitial = typeInput.value === "INITIAL_DEPOSIT";
      const isActual = typeInput.value === "ACTUAL";
      amountInput.setAttribute("aria-label", isActual
        ? "Raw actual cash balance (€$)"
        : isInitial ? "Initial deposit (€$)" : "Amount (€$)");
      amountInput.placeholder = isActual
        ? "Raw cash balance (€$)"
        : isInitial ? "Initial deposit (€$)" : "Amount (€$)";
      amountInput.min = "0";
      memoInput.maxLength = isInitial ? 480 : 500;
      guidance.textContent = entryGuidance[typeInput.value] || "Choose a budget action.";
    };
    typeInput.addEventListener("change", updateEntryGuidance);
    updateEntryGuidance();

    const actionCell = document.createElement("td");
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.addEventListener("click", () => {
      if (entryRows.children.length > 1) row.remove();
    });
    actionCell.append(removeButton);
    row.append(actionCell);
    return row;
  }
  async function loadLedger() {
    const { data, error } = await getSupabaseClient()
      .from("command_budget_ledger")
      .select("id, created_at, fiscal_year, fund_code, division, object_code, ref_id, entry_type, amount, memo, recorded_by")
      .order("created_at", { ascending: true })
      .order("id", { ascending: true });
    if (error) throw error;
    replaceLedgerRows(data);
    purchaseForm.renderSuggestions();
    if (activeView === "budget-ledger") renderBudget();
  }

  async function sendBudgetNotification(ledgerIds) {
    const { error } = await getSupabaseClient().functions.invoke("command-budget-discord-notify", {
      body: { ledger_ids: ledgerIds }
    });
    if (error) throw error;
  }

  const purchaseRequests = createPurchaseRequests({
    bodyEl: purchaseRequestsBody,
    messageEl: purchaseMessageEl,
    getSupabaseClient,
    getCurrentProfile,
    getAgentName: accessManager.getAgentName,
    isFinanceUser,
    formatAmount,
    sendBudgetNotification,
    reloadLedger: loadLedger
  });

  function showNotificationRetry(messageElement, ledgerIds, successText) {
    messageElement.textContent = `${successText} Discord notification could not be sent. `;
    const retry = document.createElement("button");
    retry.type = "button";
    retry.textContent = "Retry notification";
    retry.addEventListener("click", async () => {
      retry.disabled = true;
      try {
        await sendBudgetNotification(ledgerIds);
        messageElement.textContent = `${successText} Discord notification sent.`;
      } catch {
        retry.disabled = false;
        messageElement.textContent = `${successText} Discord notification could not be sent. `;
        messageElement.append(retry);
      }
    });
    messageElement.append(retry);
  }

  async function postLedgerEntries(entries, messageElement, button, successText, afterPost) {
    if (!isFinanceUser()) {
      messageElement.textContent = "FINANCE access is required to modify the budget.";
      return false;
    }
    const validation = validateLedgerBatch(entries, ledgerRows, activeNodeNames);
    if (!validation.valid) {
      messageElement.textContent = validation.errors.join(" ");
      return false;
    }
    const userId = getCurrentProfile()?.user_id;
    if (!userId) {
      messageElement.textContent = "Your authenticated profile could not be identified.";
      return false;
    }

    const batch = validation.entries.map((entry) => ({
      id: crypto.randomUUID(),
      ...entry,
      entry_type: entry.entry_type === "INITIAL_DEPOSIT" ? "APPROPRIATION" : entry.entry_type,
      memo: entry.entry_type === "INITIAL_DEPOSIT" ? `[INITIAL DEPOSIT] ${entry.memo}` : entry.memo,
      recorded_by: userId
    }));
    button.disabled = true;
    messageElement.textContent = "Posting…";
    try {
      const { error } = await getSupabaseClient().from("command_budget_ledger").insert(batch);
      if (error) throw error;
      await loadLedger();
      afterPost?.(batch);
      const ledgerIds = batch.map((entry) => entry.id);
      try {
        await sendBudgetNotification(ledgerIds);
        messageElement.textContent = `${successText} Discord notification sent.`;
      } catch {
        showNotificationRetry(messageElement, ledgerIds, successText);
      }
      return true;
    } catch (error) {
      messageElement.textContent = `Could not post. ${error.message || "Try again."}`;
      return false;
    } finally {
      button.disabled = false;
    }
  }

  const purchaseForm = createPurchaseForm({
    budgetFormContentEl,
    entryContentEl,
    activeNodeNames,
    getSupabaseClient,
    getCurrentProfile,
    isReadOnly,
    isFinanceUser,
    canSubmitRequest,
    getLedgerRows: () => ledgerRows,
    getBudgetSummary: () => budgetSummary,
    getOpenCommitments: () => openCommitments,
    getFundSummary: (fundCode) => budgetSummary.rows.find((row) => row.fund_code === String(fundCode ?? "").trim().toUpperCase()),
    postLedgerEntries,
    sendBudgetNotification,
    reloadLedger: loadLedger,
    reloadPurchaseRequests: purchaseRequests.load,
    formatAmount
  });

  async function submitBatch(event) {
    event.preventDefault();
    if (!isFinanceUser()) return;
    const entries = Array.from(entryRows.querySelectorAll("tr"))
      .map((row) => Object.fromEntries(Array.from(row.querySelectorAll("[name]"))
        .map((input) => [input.name, input.value])))
      .filter((entry) => ["fund_code", "entry_type", "amount"]
        .some((key) => String(entry[key] || "").trim()));
    if (!entries.length) {
      entryMessage.textContent = "Add at least one entry.";
      return;
    }
    const count = `${entries.length} entr${entries.length === 1 ? "y" : "ies"}`;
    await postLedgerEntries(
      entries,
      entryMessage,
      entryForm.querySelector("[type=submit]"),
      `${count} posted.`,
      () => entryRows.replaceChildren(createEntryRow())
    );
  }

  function getAvailableViews() {
    const views = [];
    if (canViewPersonnel()) views.push("access-manager");
    if (canViewBudget()) views.push("budget-ledger");
    if (canSubmitRequest() || isFinanceUser() || isCommandUser()) views.push("budget-form");
    if (isFinanceUser()) views.push("modify-budget");
    return views;
  }

  function switchView(id) {
    const available = getAvailableViews();
    if (!available.includes(id)) id = available[0];
    activeView = id;
    contentEl.hidden = id !== "access-manager";
    budgetContentEl.hidden = id !== "budget-ledger";
    budgetFormContentEl.hidden = id !== "budget-form";
    entryContentEl.hidden = id !== "modify-budget";
    if (id === "budget-ledger") renderBudget();
  }
  fundFilter.addEventListener("input", renderBudget);
  search.addEventListener("input", renderBudget);
  sort.addEventListener("change", renderBudget);
  addRow.addEventListener("click", () => entryRows.append(createEntryRow()));
  entryForm.addEventListener("submit", (event) => void submitBatch(event));
  closeNotesEl.addEventListener("click", () => notesDialogEl.close());

  return {
    async load() {
      if (canViewPersonnel() || isFinanceUser()) await accessManager.load();
      if (canViewBudget()) await loadLedger();
      else purchaseForm.renderSuggestions();
      if (isFinanceUser() && !entryRows.children.length) entryRows.append(createEntryRow());
      await purchaseRequests.load();
    },
    setData(data) {
      const profiles = Array.isArray(data) ? data : [];
      accessManager.setProfiles(profiles);
      if (profiles.length) return;
      replaceLedgerRows([]);
      purchaseRequestsBody.replaceChildren();
      subNavEl.replaceChildren();
      viewEl.hidden = true;
      contentEl.hidden = true;
      budgetContentEl.hidden = true;
      budgetFormContentEl.hidden = true;
      entryContentEl.hidden = true;
    },
    show() {
      viewEl.hidden = false;
      const labels = {
        "access-manager": "ACCESS MANAGER",
        "budget-ledger": "BUDGET LEDGER",
        "budget-form": "BUDGET FORM",
        "modify-budget": "MODIFY BUDGET"
      };
      const panels = getAvailableViews().map((id) => ({ id, label: labels[id] }));
      renderNavButtons(subNavEl, panels, { activeId: activeView, onSelect: switchView });
      switchView(activeView);
    },
    hide() {
      viewEl.hidden = true;
      subNavEl.replaceChildren();
      if (notesDialogEl.open) notesDialogEl.close();
    }
  };
}
