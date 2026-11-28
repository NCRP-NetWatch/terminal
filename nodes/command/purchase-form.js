import { getWorldFiscalYear } from "../dates.js";
import { isInitialDeposit } from "./budget-ledger.js";

export function createPurchaseForm({
  budgetFormContentEl,
  entryContentEl,
  activeNodeNames,
  getSupabaseClient,
  getCurrentProfile,
  isReadOnly,
  isFinanceUser,
  canSubmitRequest,
  getLedgerRows,
  getBudgetSummary,
  getOpenCommitments,
  getFundSummary,
  postLedgerEntries,
  sendBudgetNotification,
  reloadLedger,
  reloadPurchaseRequests,
  formatAmount
}) {
  const form = budgetFormContentEl.querySelector("[data-budget-form]");
  const actionInput = form.querySelector("[data-purchase-action]");
  const newPurchaseFields = form.querySelector("[data-new-purchase-fields]");
  const existingPurchaseField = form.querySelector("[data-existing-purchase-field]");
  const fundInput = form.querySelector("[data-purchase-fund]");
  const nodeInput = form.querySelector("[data-purchase-node]");
  const objectInput = form.querySelector("[data-purchase-object]");
  const openPurchaseInput = form.querySelector("[data-purchase-open]");
  const amountInput = form.querySelector("[data-purchase-amount]");
  const reasonInput = form.querySelector("[data-purchase-reason]");
  const summary = form.querySelector("[data-purchase-summary]");
  const message = form.querySelector("[data-purchase-message]");
  const submitButton = form.querySelector("[data-purchase-submit]");
  const fundSuggestions = form.querySelector("#purchaseFundSuggestions");
  const requestsBody = budgetFormContentEl.querySelector("[data-purchase-requests]");
  const lists = {
    fund_code: entryContentEl.querySelector("#budgetFundSuggestions"),
    object_code: form.querySelector("#budgetObjectSuggestions")
  };

  function getOpenPurchase(rowId) {
    return getOpenCommitments().find((purchase) => purchase.id === rowId);
  }

  function getPurchaseNodeForFund(fundCode) {
    return getLedgerRows().find((row) => isInitialDeposit(row)
      && String(row.fund_code).trim().toUpperCase() === String(fundCode ?? "").trim().toUpperCase())?.division || "";
  }

  function updateSummary() {
    if (!isFinanceUser()) {
      summary.textContent = canSubmitRequest()
        ? "This budget request will be sent to a FINANCE reviewer for approval."
        : "This rank cannot submit budget requests.";
      return;
    }

    const action = actionInput.value;
    const amount = Number(amountInput.value);
    if (["pay", "cancel"].includes(action)) {
      const purchase = getOpenPurchase(openPurchaseInput.value);
      const fund = purchase && getFundSummary(purchase.fund_code);
      const exceeds = purchase && Number.isFinite(amount)
        && (amount > purchase.open_amount || (action === "pay" && amount > (fund?.actuals || 0)));
      summary.textContent = purchase
        ? `Purchase ID ${purchase.ref_id} · Open ${formatAmount(purchase.open_amount)} · Cash ${formatAmount(fund?.actuals || 0)}${exceeds ? " · Amount exceeds balance" : ""}`
        : "Select an open purchase.";
      return;
    }

    const fund = getFundSummary(fundInput.value);
    if (!fund) {
      summary.textContent = "Select a Fund with an initial deposit.";
      return;
    }
    const addsCash = action === "addMoney";
    const balanceLabel = addsCash ? "Cash" : "Available";
    const balance = addsCash ? fund.actuals : fund.available;
    const exceeds = ["commit", "payNow", "credit"].includes(action)
      && Number.isFinite(amount) && amount > fund.available;
    summary.textContent = `${balanceLabel} ${formatAmount(balance || 0)}${exceeds ? " · Amount exceeds balance" : ""}`;
  }

  function updateFields() {
    const finance = isFinanceUser();
    for (const option of actionInput.options) {
      option.hidden = !finance && !["commit", "payNow"].includes(option.value);
    }
    if (!finance && !["commit", "payNow"].includes(actionInput.value)) actionInput.value = "commit";

    const action = actionInput.value;
    const usesOpenPurchase = ["pay", "cancel"].includes(action);
    const needsPurchaseDetails = ["commit", "payNow", "credit"].includes(action);
    newPurchaseFields.hidden = usesOpenPurchase;
    existingPurchaseField.hidden = !usesOpenPurchase;
    fundInput.disabled = usesOpenPurchase;
    fundInput.required = !usesOpenPurchase;
    nodeInput.disabled = usesOpenPurchase || !needsPurchaseDetails;
    nodeInput.required = needsPurchaseDetails;
    objectInput.disabled = usesOpenPurchase || !needsPurchaseDetails;
    objectInput.required = needsPurchaseDetails;
    form.querySelector("[data-purchase-node-field]").hidden = !needsPurchaseDetails;
    form.querySelector("[data-purchase-object-field]").hidden = !needsPurchaseDetails;
    openPurchaseInput.disabled = !usesOpenPurchase;
    openPurchaseInput.required = usesOpenPurchase;
    submitButton.textContent = finance
      ? actionInput.options[actionInput.selectedIndex].textContent
      : "Submit for approval";
    submitButton.disabled = usesOpenPurchase && !openPurchaseInput.value;
    updateSummary();
  }

  function renderSuggestions() {
    const values = { fund_code: new Set(), object_code: new Set() };
    for (const row of getLedgerRows()) {
      if (row.fund_code) values.fund_code.add(row.fund_code);
      if (row.object_code) values.object_code.add(row.object_code);
    }
    for (const [key, list] of Object.entries(lists)) {
      list.replaceChildren(...[...values[key]].sort().map((value) => {
        const option = document.createElement("option");
        option.value = value;
        return option;
      }));
    }

    const previousFund = fundInput.value;
    const funds = getBudgetSummary().rows.filter((row) => row.status !== "NO INITIAL DEPOSIT");
    fundSuggestions.replaceChildren(...funds.map((fund) => new Option(
      `${fund.fund_code} · ${fund.node || "NODE unassigned"}`,
      fund.fund_code
    )));
    fundInput.value = previousFund;

    const selectedNode = nodeInput.value;
    nodeInput.replaceChildren(new Option("Choose NODE", ""), ...activeNodeNames.map((node) => new Option(node, node)));
    if (activeNodeNames.includes(selectedNode)) nodeInput.value = selectedNode;

    const selectedPurchaseId = openPurchaseInput.value;
    const openPurchases = getOpenCommitments();
    openPurchaseInput.replaceChildren(new Option("Choose Purchase ID", ""), ...openPurchases.map((purchase) => new Option(
      `${purchase.ref_id} · ${purchase.fund_code} · ${purchase.division || "NODE"} / ${purchase.object_code || "OBJCODE"} · Open ${formatAmount(purchase.open_amount)}`,
      purchase.id
    )));
    if (openPurchases.some((purchase) => purchase.id === selectedPurchaseId)) {
      openPurchaseInput.value = selectedPurchaseId;
    }
    updateFields();
  }

  function createPurchaseId(prefix = "P") {
    return `${prefix}-${getWorldFiscalYear()}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8).toUpperCase()}`;
  }

  async function submit(event) {
    event.preventDefault();
    if (isReadOnly()) return;

    const action = actionInput.value;
    const amount = Number(amountInput.value);
    const reason = reasonInput.value.trim();
    const fiscalYear = getWorldFiscalYear();
    if (!Number.isFinite(amount) || amount <= 0) {
      message.textContent = "Enter an amount greater than zero.";
      return;
    }
    if (!reason) {
      message.textContent = "Enter a reason.";
      return;
    }

    if (["commit", "payNow"].includes(action)) {
      if (!isFinanceUser() && !canSubmitRequest()) {
        message.textContent = "This rank cannot submit budget requests.";
        return;
      }
      const fundCode = fundInput.value.trim().toUpperCase();
      const node = nodeInput.value;
      const objectCode = objectInput.value.trim();
      if (!fundCode) {
        message.textContent = "Enter a Fund.";
        return;
      }
      if (!activeNodeNames.includes(node)) {
        message.textContent = "Choose an active NODE.";
        return;
      }
      if (!objectCode) {
        message.textContent = "Enter an OBJCODE.";
        return;
      }
      if (isFinanceUser()) {
        const fund = getFundSummary(fundCode);
        if (!fund) {
          message.textContent = "Choose a Fund with an initial deposit.";
          return;
        }
        if (amount > fund.available) {
          message.textContent = "Amount exceeds the Fund's available balance.";
          return;
        }
      }

      const purchaseId = createPurchaseId();
      const entryType = action === "commit" ? "ENCUMBRANCE" : "PURCHASE";
      submitButton.disabled = true;
      message.textContent = "Submitting purchase…";
      try {
        const { data, error } = await getSupabaseClient().rpc("submit_command_purchase_request", {
          p_purchase_id: purchaseId,
          p_fiscal_year: fiscalYear,
          p_fund_code: fundCode,
          p_division: node,
          p_object_code: objectCode,
          p_entry_type: entryType,
          p_amount: amount,
          p_memo: reason
        });
        if (error) throw error;

        const result = Array.isArray(data) ? data[0] : data;
        let notificationFailed = false;
        if (result?.final_status === "APPROVED" && result.posted_ledger_entry_id) {
          try {
            await sendBudgetNotification([result.posted_ledger_entry_id]);
          } catch {
            notificationFailed = true;
          }
          await reloadLedger();
        }
        await reloadPurchaseRequests();
        form.reset();
        actionInput.value = "commit";
        renderSuggestions();
        message.textContent = result?.final_status === "APPROVED"
          ? `Purchase ${purchaseId} approved and posted automatically.${notificationFailed ? " Discord notification could not be sent." : ""}`
          : `Purchase ${purchaseId} submitted for FINANCE approval.`;
      } catch (error) {
        message.textContent = `Could not submit the purchase. ${error.message || "Try again."}`;
      } finally {
        submitButton.disabled = false;
      }
      return;
    }

    if (!isFinanceUser()) {
      message.textContent = "FINANCE access is required for this budget action.";
      return;
    }

    let entries = [];
    let successText = "";
    if (["pay", "cancel"].includes(action)) {
      const purchase = getOpenPurchase(openPurchaseInput.value);
      const fund = purchase && getFundSummary(purchase.fund_code);
      if (!purchase || !fund) {
        message.textContent = "Choose an open Purchase ID.";
        return;
      }
      if (amount > purchase.open_amount) {
        message.textContent = "Amount exceeds the open purchase balance.";
        return;
      }
      const purchaseEntry = {
        fiscal_year: fiscalYear,
        fund_code: purchase.fund_code,
        division: purchase.division,
        object_code: purchase.object_code,
        ref_id: purchase.ref_id,
        entry_type: action === "pay" ? "PURCHASE" : "LIQUIDATION",
        amount,
        memo: reason
      };
      if (action === "pay") {
        if (amount > fund.actuals) {
          message.textContent = "Amount exceeds the Fund's cash balance.";
          return;
        }
        entries = [purchaseEntry];
        successText = `Payment recorded for Purchase ID ${purchase.ref_id}.`;
      } else {
        entries = [purchaseEntry];
        successText = `Commitment released for Purchase ID ${purchase.ref_id}.`;
      }
    } else if (action === "addMoney") {
      const fund = getFundSummary(fundInput.value);
      if (!fund) {
        message.textContent = "Choose a Fund with an initial deposit.";
        return;
      }
      entries = [{
        fiscal_year: fiscalYear,
        fund_code: fund.fund_code,
        division: getPurchaseNodeForFund(fund.fund_code),
        object_code: "",
        ref_id: null,
        entry_type: "DEPOSIT",
        amount,
        memo: reason
      }];
      successText = `Money added to ${fund.fund_code}.`;
    } else {
      const fund = getFundSummary(fundInput.value.trim().toUpperCase());
      const node = nodeInput.value;
      const objectCode = objectInput.value.trim();
      if (!fund) {
        message.textContent = "Choose a Fund with an initial deposit.";
        return;
      }
      if (!node || !objectCode) {
        message.textContent = "Choose a NODE and OBJCODE.";
        return;
      }
      if (["commit", "payNow", "credit"].includes(action) && amount > fund.available) {
        message.textContent = action === "credit"
          ? "Withdrawal exceeds the Fund's available balance."
          : "Amount exceeds the Fund's available balance.";
        return;
      }
      const purchaseId = createPurchaseId(action === "credit" ? "R" : "P");
      const entry = {
        id: crypto.randomUUID(),
        fiscal_year: fiscalYear,
        fund_code: fund.fund_code,
        division: node,
        object_code: objectCode,
        ref_id: purchaseId,
        amount,
        memo: reason,
        entry_type: { commit: "ENCUMBRANCE", payNow: "PURCHASE", credit: "CREDIT" }[action]
      };
      entries = [entry];
      successText = `${action === "commit" ? "Purchase held" : action === "payNow" ? "Purchase paid" : "Money withdrawn"} · ${action === "credit" ? "Withdrawal ID " : "Purchase ID "}${purchaseId}.`;
    }

    await postLedgerEntries(entries, message, submitButton, successText, () => {
      form.reset();
      renderSuggestions();
    });
  }

  form.addEventListener("submit", (event) => void submit(event));
  actionInput.addEventListener("change", () => {
    amountInput.value = "";
    updateFields();
  });
  fundInput.addEventListener("change", () => {
    const node = getPurchaseNodeForFund(fundInput.value);
    if (activeNodeNames.includes(node)) nodeInput.value = node;
    updateSummary();
  });
  nodeInput.addEventListener("change", updateSummary);
  objectInput.addEventListener("input", updateSummary);
  amountInput.addEventListener("input", updateSummary);
  openPurchaseInput.addEventListener("change", () => {
    const purchase = getOpenPurchase(openPurchaseInput.value);
    amountInput.value = purchase ? String(purchase.open_amount) : "";
    updateFields();
  });

  return { renderSuggestions };
}
