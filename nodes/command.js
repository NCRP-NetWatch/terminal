import { renderNavButtons } from "./navigation.js";
import { getRankLevel, normalizeRank, RANK_LABELS } from "./ranks.js";
import { getWorldFiscalYear } from "./dates.js";
import { aggregateBudgetRows, getAuditTrail, getOpenCommitments, isInitialDeposit, validateLedgerBatch } from "./budget-ledger.js";

export function createCommandNode({ viewEl, subNavEl, contentEl, budgetContentEl, purchaseContentEl, entryContentEl, notesDialogEl, notesTitleEl, notesListEl, closeNotesEl, activeNodeNames = [], getSupabaseClient, getCurrentProfile, isReadOnly = () => false }) {
  let profiles = [];
  let ledgerRows=[]; let activeView="access-manager";
  const budgetBody=budgetContentEl.querySelector("[data-budget-body]"),budgetStatus=budgetContentEl.querySelector("[data-budget-status]"),fundFilter=budgetContentEl.querySelector("[data-budget-fund]"),search=budgetContentEl.querySelector("[data-budget-search]"),sort=budgetContentEl.querySelector("[data-budget-sort]"),totals=budgetContentEl.querySelector("[data-budget-totals]");
  const entryRows=entryContentEl.querySelector("[data-ledger-entry-rows]"),entryMessage=entryContentEl.querySelector("[data-ledger-entry-message]"),addRow=entryContentEl.querySelector("[data-add-ledger-row]"),entryForm=entryContentEl.querySelector("[data-ledger-entry-form]");
  const purchaseForm=purchaseContentEl.querySelector("[data-purchase-form]"),purchaseAction=purchaseForm.querySelector("[data-purchase-action]"),newPurchaseFields=purchaseForm.querySelector("[data-new-purchase-fields]"),existingPurchaseField=purchaseForm.querySelector("[data-existing-purchase-field]"),purchaseFund=purchaseForm.querySelector("[data-purchase-fund]"),purchaseNode=purchaseForm.querySelector("[data-purchase-node]"),purchaseObject=purchaseForm.querySelector("[data-purchase-object]"),openPurchase=purchaseForm.querySelector("[data-purchase-open]"),purchaseAmount=purchaseForm.querySelector("[data-purchase-amount]"),purchaseReason=purchaseForm.querySelector("[data-purchase-reason]"),purchaseSummary=purchaseForm.querySelector("[data-purchase-summary]"),purchaseMessage=purchaseForm.querySelector("[data-purchase-message]"),purchaseSubmit=purchaseForm.querySelector("[data-purchase-submit]");
  const lists={fund_code:entryContentEl.querySelector("#budgetFundSuggestions"),object_code:purchaseForm.querySelector("#budgetObjectSuggestions")};
  const amountFormat=new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const formatAmount=value=>"€$"+amountFormat.format(value);
  const entryTypes=[
    {value:"INITIAL_DEPOSIT",label:"Initial deposit"},
    {value:"ACTUAL",label:"Set cash balance"}
  ];
  const entryGuidance={
    INITIAL_DEPOSIT:"Starts this Fund's budget and cash balance.",
    ACTUAL:"Set the current cash balance before open commitments are deducted."
  };
  const cell=v=>{const td=document.createElement("td");td.textContent=v;return td;};

  function setStatus(message) {
    const status = contentEl.querySelector("[data-access-status]");
    status.textContent = message;
  }

  function renderProfiles() {
    const body = contentEl.querySelector("[data-access-body]");
    const actorLevel = getRankLevel(getCurrentProfile()?.rank);
    body.replaceChildren(...profiles.map((profile) => {
      const row = document.createElement("tr");
      const agentCell = document.createElement("td");
      agentCell.textContent = profile.agent_name?.trim() || "Unnamed agent";

      const rankCell = document.createElement("td");
      const rankSelect = document.createElement("select");
      rankSelect.className = "db-sort";
      const currentRank = normalizeRank(profile.rank);
      const targetLevel = getRankLevel(profile.rank);
      rankSelect.setAttribute("aria-label", `Rank for ${profile.agent_name || "unnamed agent"}`);
      if (!currentRank) {
        const unassigned = document.createElement("option");
        unassigned.value = "";
        unassigned.textContent = "Unassigned";
        unassigned.selected = true;
        rankSelect.append(unassigned);
      } else if (targetLevel < 0) {
        const unknown = document.createElement("option");
        unknown.value = profile.rank;
        unknown.textContent = profile.rank;
        unknown.selected = true;
        rankSelect.append(unknown);
      }
      for (const rank of RANK_LABELS) {
        const option = document.createElement("option");
        option.value = rank;
        option.textContent = rank;
        option.selected = currentRank === normalizeRank(rank);
        rankSelect.append(option);
      }
      rankCell.append(rankSelect);

      const actionCell = document.createElement("td");
      const canEdit = !isReadOnly() && actorLevel > targetLevel && targetLevel > 0;
      rankSelect.disabled = !canEdit;
      if (canEdit) {
        const saveButton = document.createElement("button");
        saveButton.type = "button";
        saveButton.textContent = "Save rank";
        saveButton.addEventListener("click", () => void saveRank(profile, rankSelect, saveButton));
        actionCell.append(saveButton);
      } else {
        const restriction = document.createElement("span");
        restriction.className = "library-empty";
        restriction.textContent = targetLevel < 0
          ? "Unknown rank"
          : "Equal or higher rank locked";
        actionCell.append(restriction);
      }
      row.append(agentCell, rankCell, actionCell);
      return row;
    }));
  }

  function renderBudget() {
    const result=aggregateBudgetRows(ledgerRows,{fundCode:fundFilter.value.trim()||undefined});
    totals.textContent="Starter "+formatAmount(result.totalStarter)+" · Encumbered "+formatAmount(result.totalEncumbered)+" · Actuals "+formatAmount(result.totalActuals)+" · Available "+formatAmount(result.totalAvailable);
    const q=search.value.trim().toLocaleLowerCase(), parts=sort.value.split("-");
    const shown=result.rows.filter(r=>[r.fund_code,r.node,r.object_code].join(" ").toLocaleLowerCase().includes(q));
    shown.sort((a,b)=>{const x=a[parts[0]],y=b[parts[0]],d=typeof x==="number"?x-y:String(x||"").localeCompare(String(y||""),undefined,{numeric:true,sensitivity:"base"});return parts[1]==="desc"?-d:d;});
    budgetBody.replaceChildren(...shown.map(r=>{
      const tr=document.createElement("tr"), availableCell=document.createElement("td"), amount=document.createElement("span"), badge=document.createElement("span");
      const statusClass={"OVER COMMITTED":"hostile","NEAR LIMIT":"monitored","FULLY COMMITTED":"monitored","AVAILABLE":"contained","NO INITIAL DEPOSIT":"neutral"}[r.status];
      tr.classList.add({hostile:"row-status-hostile",monitored:"row-status-monitored",contained:"row-status-contained",neutral:"row-status-neutral"}[statusClass]);
      const fundCell=document.createElement("td"),fundButton=document.createElement("button");
      fundButton.type="button";fundButton.className="person-name";fundButton.textContent=r.fund_code;fundButton.setAttribute("aria-label","View budget history for fund "+r.fund_code);
      fundButton.addEventListener("click",()=>openAudit({fundCode:r.fund_code}));fundCell.append(fundButton);
      amount.textContent=r.available===undefined?"—":formatAmount(r.available);badge.className="budget-status status-"+statusClass;badge.textContent=r.status;availableCell.className="budget-available";availableCell.append(amount,badge);
      tr.append(fundCell,cell(r.starter===undefined?"—":formatAmount(r.starter)),cell(r.node||"—"),cell(r.object_code||"—"),cell(formatAmount(r.encumbered)),cell(r.actuals===undefined?"—":formatAmount(r.actuals)),availableCell,cell(r.usedRate===undefined?"—":(r.usedRate*100).toFixed(1)+"%"));
      return tr;
    }));
    budgetStatus.textContent=shown.length+" funds shown.";
  }
  function openAudit(selection) {
    const trail=getAuditTrail(ledgerRows,selection);
    const scope=[selection.fiscalYear?"FY "+selection.fiscalYear:"",selection.fundCode?"FUND "+selection.fundCode:"",selection.division?"NODE "+selection.division:"",selection.objectCode?"OBJCODE "+selection.objectCode:"",selection.purchaseId?"PURCHASE "+selection.purchaseId:""].filter(Boolean).join(" / ");
    notesTitleEl.textContent="BUDGET AUDIT // "+(scope||"ALL ENTRIES");
    notesListEl.replaceChildren(...trail.map(r=>{const li=document.createElement("li"),title=document.createElement("strong"),memo=document.createElement("span"),meta=document.createElement("time");title.textContent=(isInitialDeposit(r)?"INITIAL DEPOSIT":r.entry_type==="ACTUAL"?"CASH BALANCE":r.entry_type==="CREDIT"?"REFUND":r.entry_type)+" — "+formatAmount(Number(r.amount));memo.className="note-meta";memo.textContent=(r.memo||"").replace(/^\[INITIAL DEPOSIT\]\s*/i,"")||"No reason recorded.";meta.className="note-meta";meta.dateTime=r.created_at||"";const p=profiles.find(x=>x.user_id===r.recorded_by),actor=p&&p.agent_name&&p.agent_name.trim()||(isInitialDeposit(r)&&!r.recorded_by?"SYSTEM":"Unknown agent");meta.textContent=(r.created_at?new Date(r.created_at).toLocaleString():"Unknown date")+" · "+actor+" · FY "+r.fiscal_year+(r.division||r.object_code?" · "+[r.division,r.object_code].filter(Boolean).join(" / "):"")+(r.ref_id?" · "+(r.entry_type==="CREDIT"?"REFUND ID ":"PURCHASE ID ")+r.ref_id:"");li.append(title,memo,meta);return li;}));
    if(!trail.length){const li=document.createElement("li");li.textContent="No audit entries found.";notesListEl.append(li);}if(!notesDialogEl.open)notesDialogEl.showModal();
  }
  function createEntryRow(values={}) {
    const tr=document.createElement("tr"), specs=[["fiscal_year","number","Fiscal year"],["fund_code","text","Fund"],["entry_type","select","Budget action"],["amount","number","Amount"],["memo","text","Reason"]];
    for(const [name,type,label] of specs){
      const td=document.createElement("td");let input;let guidance;
      if(type==="select"){
        input=document.createElement("select");input.className="db-sort";const blank=document.createElement("option");blank.value="";blank.textContent="Choose budget action";input.append(blank);
        for(const item of entryTypes){const option=document.createElement("option");option.value=item.value;option.textContent=item.label;input.append(option);}
        guidance=document.createElement("small");guidance.className="ledger-entry-guidance";guidance.setAttribute("aria-live","polite");
      }else{
        input=document.createElement("input");input.type=type;input.required=false;
        if(type==="number"){input.step=name==="amount"?"0.01":"1";if(name==="amount")input.inputMode="decimal";}
        if(name==="fund_code")input.setAttribute("list",lists.fund_code.id);
      }
      input.name=name;input.setAttribute("aria-label",label);input.value=values[name]|| (name==="fiscal_year"?String(getWorldFiscalYear()):"");
      if(name==="memo"){input.required=true;input.maxLength=500;input.placeholder="Reason for entry";}
      td.append(input);if(guidance)td.append(guidance);tr.append(td);
    }
    const typeInput=tr.querySelector('[name="entry_type"]'),amountInput=tr.querySelector('[name="amount"]'),memoInput=tr.querySelector('[name="memo"]'),guidance=typeInput.parentElement.querySelector(".ledger-entry-guidance");
    const updateEntryGuidance=()=>{
      const isInitial=typeInput.value==="INITIAL_DEPOSIT",isActual=typeInput.value==="ACTUAL";
      amountInput.setAttribute("aria-label",isActual?"Raw actual cash balance (€$)":isInitial?"Initial deposit (€$)":"Amount (€$)");amountInput.placeholder=isActual?"Raw cash balance (€$)":isInitial?"Initial deposit (€$)":"Amount (€$)";amountInput.min="0";
      memoInput.maxLength=isInitial?480:500;
      guidance.textContent=entryGuidance[typeInput.value]||"Choose a budget action.";
    };
    typeInput.addEventListener("change",updateEntryGuidance);updateEntryGuidance();
    const td=document.createElement("td"),remove=document.createElement("button");remove.type="button";remove.textContent="Remove";remove.addEventListener("click",()=>{if(entryRows.children.length>1)tr.remove();});td.append(remove);tr.append(td);return tr;
  }
  function getFundSummary(fundCode) {
    return aggregateBudgetRows(ledgerRows).rows.find((row) => row.fund_code === fundCode);
  }
  function getOpenPurchase(purchaseRowId) {
    return getOpenCommitments(ledgerRows).find((purchase) => purchase.id === purchaseRowId);
  }
  function updatePurchaseSummary() {
    const action=purchaseAction.value, amount=Number(purchaseAmount.value);
    if(["pay","cancel"].includes(action)){
      const purchase=getOpenPurchase(openPurchase.value), fund=purchase&&getFundSummary(purchase.fund_code);
      const exceeds=purchase&&Number.isFinite(amount)&&(amount>purchase.open_amount||(action==="pay"&&amount>(fund?.actuals||0)));
      purchaseSummary.textContent=purchase?"Purchase ID "+purchase.ref_id+" · Open "+formatAmount(purchase.open_amount)+" · Cash "+formatAmount(fund?.actuals||0)+(exceeds?" · Amount exceeds balance":""):"Select an open purchase.";
      return;
    }
    const fund=getFundSummary(purchaseFund.value);
    if(!fund){purchaseSummary.textContent="Select a Fund with an initial deposit.";return;}
    const addsCash=["addMoney","credit"].includes(action);
    const balanceLabel=addsCash?"Cash":"Available";
    const balance=addsCash?fund.actuals:fund.available;
    const exceeds=["commit","payNow"].includes(action)&&Number.isFinite(amount)&&amount>fund.available;
    purchaseSummary.textContent=balanceLabel+" "+formatAmount(balance||0)+(exceeds?" · Amount exceeds balance":"");
  }
  function updatePurchaseFields() {
    const action=purchaseAction.value,usesOpenPurchase=["pay","cancel"].includes(action);
    const needsPurchaseDetails=["commit","payNow","credit"].includes(action);
    newPurchaseFields.hidden=usesOpenPurchase;
    existingPurchaseField.hidden=!usesOpenPurchase;
    purchaseFund.disabled=usesOpenPurchase;purchaseFund.required=!usesOpenPurchase;
    purchaseNode.disabled=usesOpenPurchase||!needsPurchaseDetails;purchaseNode.required=needsPurchaseDetails;
    purchaseObject.disabled=usesOpenPurchase||!needsPurchaseDetails;purchaseObject.required=needsPurchaseDetails;
    purchaseForm.querySelector("[data-purchase-node-field]").hidden=!needsPurchaseDetails;
    purchaseForm.querySelector("[data-purchase-object-field]").hidden=!needsPurchaseDetails;
    openPurchase.disabled=!usesOpenPurchase;
    openPurchase.required=usesOpenPurchase;
    purchaseSubmit.textContent=purchaseAction.options[purchaseAction.selectedIndex].textContent;
    purchaseSubmit.disabled=usesOpenPurchase&&!openPurchase.value;
    updatePurchaseSummary();
  }
  function renderSuggestions() {
    const values={fund_code:new Set(),object_code:new Set()};
    for(const row of ledgerRows){
      if(row.fund_code)values.fund_code.add(row.fund_code);
      if(row.object_code)values.object_code.add(row.object_code);
    }
    for(const [key,list] of Object.entries(lists)){
      list.replaceChildren(...[...values[key]].sort().map((value)=>{
        const option=document.createElement("option");option.value=value;return option;
      }));
    }

    const previousFund=purchaseFund.value;
    const funds=aggregateBudgetRows(ledgerRows).rows.filter((row)=>row.status!=="NO INITIAL DEPOSIT");
    purchaseFund.replaceChildren(new Option("Choose Fund",""),...funds.map((fund)=>new Option(fund.fund_code+" · "+(fund.node||"NODE unassigned"),fund.fund_code)));
    if(funds.some((fund)=>fund.fund_code===previousFund))purchaseFund.value=previousFund;

    const nodes=[...new Set([...activeNodeNames,...ledgerRows.map((row)=>row.division).filter(Boolean)])].sort();
    const selectedNode=purchaseNode.value;
    purchaseNode.replaceChildren(new Option("Choose NODE",""),...nodes.map((node)=>new Option(node,node)));
    if(nodes.includes(selectedNode))purchaseNode.value=selectedNode;

    const selectedPurchaseId=openPurchase.value;
    const openPurchases=getOpenCommitments(ledgerRows);
    openPurchase.replaceChildren(new Option("Choose Purchase ID",""),...openPurchases.map((purchase)=>new Option(
      purchase.ref_id+" · "+purchase.fund_code+" · "+(purchase.division||"NODE")+" / "+(purchase.object_code||"OBJCODE")+" · Open "+formatAmount(purchase.open_amount),
      purchase.id
    )));
    if(openPurchases.some((purchase)=>purchase.id===selectedPurchaseId))openPurchase.value=selectedPurchaseId;
    updatePurchaseFields();
  }
  async function loadLedger() {
    const {data,error}=await getSupabaseClient().from("command_budget_ledger").select("id, created_at, fiscal_year, fund_code, division, object_code, ref_id, entry_type, amount, memo, recorded_by").order("created_at",{ascending:true});if(error)throw error;ledgerRows=data||[];renderSuggestions();if(activeView==="budget-ledger")renderBudget();
  }
  async function sendBudgetNotification(ledgerIds) {
    const {error}=await getSupabaseClient().functions.invoke("command-budget-discord-notify",{body:{ledger_ids:ledgerIds}});
    if(error)throw error;
  }
  function showNotificationRetry(messageElement, ledgerIds, successText) {
    messageElement.textContent=successText+" Discord notification could not be sent. ";
    const retry=document.createElement("button");retry.type="button";retry.textContent="Retry notification";
    retry.addEventListener("click",async()=>{
      retry.disabled=true;
      try{await sendBudgetNotification(ledgerIds);messageElement.textContent=successText+" Discord notification sent.";}
      catch{retry.disabled=false;messageElement.textContent=successText+" Discord notification could not be sent. ";messageElement.append(retry);}
    });
    messageElement.append(retry);
  }
  async function postLedgerEntries(entries, messageElement, button, successText, afterPost) {
    const validation=validateLedgerBatch(entries,ledgerRows,activeNodeNames);
    if(!validation.valid){messageElement.textContent=validation.errors.join(" ");return false;}
    const profile=getCurrentProfile(),userId=profile&&profile.user_id;
    if(!userId){messageElement.textContent="Your authenticated profile could not be identified.";return false;}

    const batch=validation.entries.map(entry=>({
      id:crypto.randomUUID(),
      ...entry,
      entry_type:entry.entry_type==="INITIAL_DEPOSIT"?"APPROPRIATION":entry.entry_type,
      memo:entry.entry_type==="INITIAL_DEPOSIT"?"[INITIAL DEPOSIT] "+entry.memo:entry.memo,
      recorded_by:userId
    }));
    button.disabled=true;messageElement.textContent="Posting…";
    try{
      const {error}=await getSupabaseClient().from("command_budget_ledger").insert(batch);
      if(error)throw error;
      await loadLedger();
      afterPost?.(batch);
      try{await sendBudgetNotification(batch.map(entry=>entry.id));messageElement.textContent=successText+" Discord notification sent.";}
      catch{showNotificationRetry(messageElement,batch.map(entry=>entry.id),successText);}
      return true;
    }catch(error){messageElement.textContent="Could not post. "+(error.message||"Try again.");return false;}
    finally{button.disabled=false;}
  }
  async function submitBatch(event) {
    event.preventDefault();
    if (isReadOnly()) return;
    const entries=Array.from(entryRows.querySelectorAll("tr"))
      .map(tr=>Object.fromEntries(Array.from(tr.querySelectorAll("[name]")).map(el=>[el.name,el.value])))
      .filter(entry=>["fund_code","entry_type","amount"].some(key=>String(entry[key]||"").trim()));
    if(!entries.length){entryMessage.textContent="Add at least one entry.";return;}
    const count=entries.length+" entr"+(entries.length===1?"y":"ies");
    await postLedgerEntries(entries,entryMessage,entryForm.querySelector("[type=submit]"),count+" posted.",()=>entryRows.replaceChildren(createEntryRow()));
  }
  function purchaseNodeForFund(fundCode) {
    return ledgerRows.find((row)=>isInitialDeposit(row)&&String(row.fund_code).toUpperCase()===fundCode)?.division||"";
  }
  function createPurchaseId(prefix="P") {
    return prefix+"-"+getWorldFiscalYear()+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase();
  }
  async function submitPurchase(event) {
    event.preventDefault();
    if (isReadOnly()) return;
    const action=purchaseAction.value, amount=Number(purchaseAmount.value), reason=purchaseReason.value.trim();
    const year=getWorldFiscalYear();
    if(!Number.isFinite(amount)||amount<=0){purchaseMessage.textContent="Enter an amount greater than zero.";return;}
    if(!reason){purchaseMessage.textContent="Enter a reason.";return;}
    let entries=[], successText="";
    if(["pay","cancel"].includes(action)){
      const purchase=getOpenPurchase(openPurchase.value), fund=purchase&&getFundSummary(purchase.fund_code);
      if(!purchase||!fund){purchaseMessage.textContent="Choose an open Purchase ID.";return;}
      if(amount>purchase.open_amount){purchaseMessage.textContent="Amount exceeds the open purchase balance.";return;}
      const release={fiscal_year:year,fund_code:purchase.fund_code,division:purchase.division,object_code:purchase.object_code,ref_id:purchase.ref_id,entry_type:"LIQUIDATION",amount,memo:reason};
      if(action==="pay"){
        if(amount>fund.actuals){purchaseMessage.textContent="Amount exceeds the Fund's cash balance.";return;}
        entries=[release,{...release,entry_type:"PURCHASE",memo:reason}];
        successText="Payment recorded for Purchase ID "+purchase.ref_id+".";
      }else{
        entries=[release];successText="Commitment released for Purchase ID "+purchase.ref_id+".";
      }
    }else if(action==="addMoney"){
      const fund=getFundSummary(purchaseFund.value);
      if(!fund){purchaseMessage.textContent="Choose a Fund with an initial deposit.";return;}
      entries=[{fiscal_year:year,fund_code:fund.fund_code,division:purchaseNodeForFund(fund.fund_code),object_code:"",ref_id:null,entry_type:"DEPOSIT",amount,memo:reason}];
      successText="Money added to "+fund.fund_code+".";
    }else{
      const fund=getFundSummary(purchaseFund.value),node=purchaseNode.value,objectCode=purchaseObject.value.trim();
      if(!fund){purchaseMessage.textContent="Choose a Fund with an initial deposit.";return;}
      if(!node||!objectCode){purchaseMessage.textContent="Choose a NODE and OBJCODE.";return;}
      if(["commit","payNow"].includes(action)&&amount>fund.available){purchaseMessage.textContent="Amount exceeds the Fund's available balance.";return;}
      if(action==="credit"&&amount<=0){purchaseMessage.textContent="Enter a credit greater than zero.";return;}
      const purchaseId=createPurchaseId(action==="credit"?"R":"P");
      const entry={id:crypto.randomUUID(),fiscal_year:year,fund_code:fund.fund_code,division:node,object_code:objectCode,ref_id:purchaseId,amount,memo:reason};
      entry.entry_type={commit:"ENCUMBRANCE",payNow:"PURCHASE",credit:"CREDIT"}[action];
      entries=[entry];
      successText=(action==="commit"?"Purchase held":action==="payNow"?"Purchase paid":"Refund recorded")+" · "+(action==="credit"?"Refund ID ":"Purchase ID ")+purchaseId+".";
    }
    await postLedgerEntries(entries,purchaseMessage,purchaseSubmit,successText,()=>{
      purchaseForm.reset();renderSuggestions();
    });
  }
  function switchView(id){const available=isReadOnly()?["access-manager","budget-ledger"]:["access-manager","budget-ledger","purchase-form","modify-budget"];if(!available.includes(id))id="access-manager";activeView=id;contentEl.hidden=id!=="access-manager";budgetContentEl.hidden=id!=="budget-ledger";purchaseContentEl.hidden=id!=="purchase-form";entryContentEl.hidden=id!=="modify-budget";if(id==="budget-ledger")renderBudget();}
  fundFilter.addEventListener("input",renderBudget);search.addEventListener("input",renderBudget);sort.addEventListener("change",renderBudget);addRow.addEventListener("click",()=>entryRows.append(createEntryRow()));entryForm.addEventListener("submit",event=>void submitBatch(event));purchaseForm.addEventListener("submit",event=>void submitPurchase(event));purchaseAction.addEventListener("change",()=>{purchaseAmount.value="";updatePurchaseFields();});purchaseFund.addEventListener("change",()=>{const node=purchaseNodeForFund(purchaseFund.value);if(node)purchaseNode.value=node;updatePurchaseSummary();});purchaseNode.addEventListener("change",updatePurchaseSummary);purchaseObject.addEventListener("input",updatePurchaseSummary);purchaseAmount.addEventListener("input",updatePurchaseSummary);openPurchase.addEventListener("change",()=>{const purchase=getOpenPurchase(openPurchase.value);purchaseAmount.value=purchase?String(purchase.open_amount):"";updatePurchaseFields();});closeNotesEl.addEventListener("click",()=>notesDialogEl.close());

  async function loadProfiles() {
    setStatus("Loading personnel…");
    const { data, error } = await getSupabaseClient()
      .from("profiles")
      .select("user_id, agent_name, rank")
      .order("agent_name", { ascending: true });
    if (error) throw error;
    profiles = data ?? [];
    renderProfiles();
    setStatus(`${profiles.length} personnel records loaded.`);
  }

  async function saveRank(profile, rankSelect, saveButton) {
    if (isReadOnly()) return;
    const actorLevel = getRankLevel(getCurrentProfile()?.rank);
    const targetLevel = getRankLevel(profile.rank);
    if (targetLevel < 0 || targetLevel >= actorLevel) return;
    const previousRank = profile.rank ?? "Unassigned";
    const newRank = rankSelect.value;
    if (newRank === profile.rank) {
      setStatus("No rank change to save.");
      return;
    }

    saveButton.disabled = true;
    rankSelect.disabled = true;
    setStatus(`Saving rank for ${profile.agent_name || "this agent"}…`);
    try {
      const { data, error } = await getSupabaseClient().rpc("access_manager_update_rank", {
        p_target_user_id: profile.user_id,
        p_rank: newRank
      });
      if (error) throw error;
      const change = Array.isArray(data) ? data[0] : data;
      await loadProfiles();

      const { error: notificationError } = await getSupabaseClient().functions.invoke("access-change-discord-notify", {
        body: {
          target_user_id: profile.user_id,
          old_rank: change.old_rank ?? previousRank,
          new_rank: change.new_rank ?? newRank
        }
      });
      if (notificationError) {
        console.error("Rank updated, but the Discord notification failed", notificationError);
        setStatus("Rank updated, but the Discord notification could not be sent.");
      } else {
        setStatus("Rank updated and sent to Discord.");
      }
    } catch (error) {
      console.error(error);
      setStatus(`Could not update the rank. ${error.message ?? "Try again."}`);
      saveButton.disabled = false;
      rankSelect.disabled = false;
    }
  }

  return {
    async load() {
      await loadProfiles();
      await loadLedger();
      if(!entryRows.children.length)entryRows.append(createEntryRow());
    },
    setData(data) {
      profiles = Array.isArray(data) ? data : [];
      if (!profiles.length) { ledgerRows = []; subNavEl.replaceChildren(); viewEl.hidden = true; contentEl.hidden = true; budgetContentEl.hidden = true; purchaseContentEl.hidden = true; entryContentEl.hidden = true; return; }
      renderProfiles();
    },
    show() {viewEl.hidden=false;const panels=[{id:"access-manager",label:"ACCESS MANAGER"},{id:"budget-ledger",label:"BUDGET LEDGER"},{id:"purchase-form",label:"BUDGET FORM"},{id:"modify-budget",label:"MODIFY BUDGET"}].filter((panel)=>!isReadOnly()||["access-manager","budget-ledger"].includes(panel.id));renderNavButtons(subNavEl,panels,{activeId:activeView,onSelect:switchView});switchView(activeView);},
    hide() {viewEl.hidden=true;subNavEl.replaceChildren();if(notesDialogEl.open)notesDialogEl.close();}
  };
}
