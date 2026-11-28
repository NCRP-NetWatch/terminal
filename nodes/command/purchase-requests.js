import { getWorldDatePresentation } from "../dates.js";

export function createPurchaseRequests({
  bodyEl,
  messageEl,
  getSupabaseClient,
  getCurrentProfile,
  getAgentName,
  isFinanceUser,
  formatAmount,
  sendBudgetNotification,
  reloadLedger
}) {
  const columns = ["Submitted", "Requester", "Purchase", "Fund / NODE", "OBJCODE", "Amount", "Reason / review", "Status / action"];

  function cell(label, value) {
    const element = document.createElement("td");
    element.dataset.label = label;
    element.textContent = value;
    return element;
  }

  function render(requests) {
    bodyEl.replaceChildren(...requests.map((request) => {
      const row = document.createElement("tr");
      const submitted = getWorldDatePresentation(request.submitted_at);
      const currentProfile = getCurrentProfile();
      const requester = getAgentName(request.requested_by)
        || (currentProfile?.user_id === request.requested_by ? currentProfile.agent_name?.trim() : "")
        || "Unnamed agent";
      const actionName = request.entry_type === "ENCUMBRANCE" ? "Hold funds" : "Record paid purchase";

      row.append(
        cell(columns[0], submitted?.label || "Unknown date"),
        cell(columns[1], requester),
        cell(columns[2], `${request.purchase_id} · ${actionName}`),
        cell(columns[3], `${request.fund_code} / ${request.division || "NODE"}`),
        cell(columns[4], request.object_code),
        cell(columns[5], formatAmount(Number(request.amount)))
      );

      const reasonCell = cell(columns[6], request.memo || "");
      if (request.review_note) {
        reasonCell.append(document.createElement("br"), document.createTextNode(`Review: ${request.review_note}`));
      }

      const statusCell = cell(columns[7], "");
      const status = document.createElement("strong");
      status.textContent = request.status;
      statusCell.append(status);
      if (isFinanceUser() && request.status === "PENDING") {
        const note = document.createElement("input");
        note.className = "db-search";
        note.name = "review_note";
        note.autocomplete = "off";
        note.maxLength = 500;
        note.placeholder = "Optional review note";
        note.setAttribute("aria-label", `Review note for ${request.purchase_id}`);

        const approve = document.createElement("button");
        approve.type = "button";
        approve.textContent = "Approve";
        approve.addEventListener("click", () => void review(request, "APPROVED", note, approve));

        const reject = document.createElement("button");
        reject.type = "button";
        reject.textContent = "Reject";
        reject.addEventListener("click", () => void review(request, "REJECTED", note, reject));

        reasonCell.append(document.createElement("br"), note);
        statusCell.append(document.createElement("br"), approve, reject);
      }

      row.append(reasonCell, statusCell);
      return row;
    }));

    if (!requests.length) {
      const row = document.createElement("tr");
      const empty = document.createElement("td");
      empty.textContent = "No budget requests.";
      empty.colSpan = columns.length;
      row.append(empty);
      bodyEl.append(row);
    }
  }

  async function load() {
    const { data, error } = await getSupabaseClient()
      .from("command_budget_purchase_requests")
      .select("id,purchase_id,fiscal_year,fund_code,division,object_code,entry_type,amount,memo,requested_by,status,submitted_at,reviewed_by,reviewed_at,review_note,ledger_entry_id")
      .order("submitted_at", { ascending: false });
    if (error) throw error;
    render(data || []);
  }

  async function review(request, decision, noteInput, button) {
    if (!isFinanceUser()) return;
    button.disabled = true;
    messageEl.textContent = decision === "APPROVED" ? "Approving budget request…" : "Rejecting budget request…";
    try {
      const { data, error } = await getSupabaseClient().rpc("review_command_purchase_request", {
        p_request_id: request.id,
        p_decision: decision,
        p_note: noteInput.value.trim() || null
      });
      if (error) throw error;

      const result = Array.isArray(data) ? data[0] : data;
      let notificationFailed = false;
      if (decision === "APPROVED" && result?.posted_ledger_entry_id) {
        try {
          await sendBudgetNotification([result.posted_ledger_entry_id]);
        } catch {
          notificationFailed = true;
        }
        await reloadLedger();
      }
      await load();
      messageEl.textContent = decision === "APPROVED"
        ? `Budget request ${request.purchase_id} approved and added to the budget ledger.${notificationFailed ? " Discord notification could not be sent." : ""}`
        : `Budget request ${request.purchase_id} rejected.`;
    } catch (error) {
      messageEl.textContent = `Could not ${decision.toLowerCase()} the request. ${error.message || "Try again."}`;
      button.disabled = false;
    }
  }

  return { load, render };
}
