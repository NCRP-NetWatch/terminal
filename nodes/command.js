import { renderNavButtons } from "./navigation.js";
import { getRankLevel, normalizeRank, RANK_LABELS } from "./ranks.js";
import { getWorldFiscalYear } from "./dates.js";
import { aggregateBudgetRows, getAuditTrail, isInitialDeposit, validateLedgerBatch } from "./budget-ledger.js";

export function createCommandNode({ viewEl, subNavEl, contentEl, budgetContentEl, entryContentEl, notesDialogEl, notesTitleEl, notesListEl, closeNotesEl, activeNodeNames = [], getSupabaseClient, getCurrentProfile }) {
  let profiles = [];
  let ledgerRows=[]; let activeView="access-manager";
  const budgetBody=budgetContentEl.querySelector("[data-budget-body]"),budgetStatus=budgetContentEl.querySelector("[data-budget-status]"),fundFilter=budgetContentEl.querySelector("[data-budget-fund]"),search=budgetContentEl.querySelector("[data-budget-search]"),sort=budgetContentEl.querySelector("[data-budget-sort]"),totals=budgetContentEl.querySelector("[data-budget-totals]");
  const entryRows=entryContentEl.querySelector("[data-ledger-entry-rows]"),entryMessage=entryContentEl.querySelector("[data-ledger-entry-message]"),addRow=entryContentEl.querySelector("[data-add-ledger-row]"),entryForm=entryContentEl.querySelector("[data-ledger-entry-form]");
  const lists={fund_code:entryContentEl.querySelector("#budgetFundSuggestions"),division:entryContentEl.querySelector("#budgetDivisionSuggestions"),object_code:entryContentEl.querySelector("#budgetObjectSuggestions"),ref_id:entryContentEl.querySelector("#budgetRefSuggestions")};
  const amountFormat=new Intl.NumberFormat(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
  const formatAmount=value=>"€$"+amountFormat.format(value);
  const entryTypes=[
    {value:"INITIAL_DEPOSIT",label:"Initial deposit"},
    {value:"ACTUAL",label:"Set actual cash on hand"},
    {value:"ENCUMBRANCE",label:"Record encumbrance"},
    {value:"LIQUIDATION",label:"Release encumbrance"}
  ];
  const entryGuidance={
    INITIAL_DEPOSIT:"Sets this fund's original starter budget and opening actual cash balance. Only the first initial deposit is used.",
    ACTUAL:"Sets the raw total cash currently held by this fund. Enter the balance before subtracting encumbrances.",
    ENCUMBRANCE:"Records a promised purchase amount against a NODE, object code, and reference ID.",
    LIQUIDATION:"Releases all or part of a paid or canceled commitment. Enter its reference ID."
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
      const canEdit = actorLevel > targetLevel && targetLevel >= 0;
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
    const scope=[selection.fiscalYear?"FY "+selection.fiscalYear:"",selection.fundCode?"FUND "+selection.fundCode:"",selection.division?"NODE "+selection.division:"",selection.objectCode?"OBJCODE "+selection.objectCode:"",selection.refId?"REF "+selection.refId:""].filter(Boolean).join(" / ");
    notesTitleEl.textContent="BUDGET AUDIT // "+(scope||"ALL ENTRIES");
    notesListEl.replaceChildren(...trail.map(r=>{const li=document.createElement("li"),title=document.createElement("strong"),memo=document.createElement("span"),meta=document.createElement("time");title.textContent=(isInitialDeposit(r)?"INITIAL DEPOSIT":r.entry_type==="ACTUAL"?"ACTUAL BALANCE":r.entry_type)+" — "+formatAmount(Number(r.amount));memo.className="note-meta";memo.textContent=(r.memo||"").replace(/^\[INITIAL DEPOSIT\]\s*/i,"")||"No reason recorded.";meta.className="note-meta";meta.dateTime=r.created_at||"";const p=profiles.find(x=>x.user_id===r.recorded_by),actor=p&&p.agent_name&&p.agent_name.trim()||(isInitialDeposit(r)&&!r.recorded_by?"SYSTEM":"Unknown agent");meta.textContent=(r.created_at?new Date(r.created_at).toLocaleString():"Unknown date")+" · "+actor+" · FY "+r.fiscal_year+(r.division||r.object_code?" · "+[r.division,r.object_code].filter(Boolean).join(" / "):"")+(r.ref_id?" · "+r.ref_id:"");li.append(title,memo,meta);return li;}));
    if(!trail.length){const li=document.createElement("li");li.textContent="No audit entries found.";notesListEl.append(li);}if(!notesDialogEl.open)notesDialogEl.showModal();
  }
  function createEntryRow(values={}) {
    const tr=document.createElement("tr"), specs=[["fiscal_year","number","Fiscal year"],["fund_code","text","Fund"],["division","text","NODE"],["object_code","text","OBJCODE"],["ref_id","text","Ref ID"],["entry_type","select","Budget action"],["amount","number","Amount"],["memo","text","Reason"]];
    for(const [name,type,label] of specs){
      const td=document.createElement("td");let input;let guidance;
      if(type==="select"){
        input=document.createElement("select");input.className="db-sort";const blank=document.createElement("option");blank.value="";blank.textContent="Choose budget action";input.append(blank);
        for(const item of entryTypes){const option=document.createElement("option");option.value=item.value;option.textContent=item.label;input.append(option);}
        guidance=document.createElement("small");guidance.className="ledger-entry-guidance";guidance.setAttribute("aria-live","polite");
      }else{
        input=document.createElement("input");input.type=type;input.required=false;
        if(type==="number"){input.step=name==="amount"?"0.01":"1";if(name==="amount")input.inputMode="decimal";}
        if(lists[name])input.setAttribute("list",lists[name].id);
      }
      input.name=name;input.setAttribute("aria-label",label);input.value=values[name]|| (name==="fiscal_year"?String(getWorldFiscalYear()):"");
      if(name==="memo"){input.required=true;input.maxLength=500;input.placeholder="Reason for entry";}
      td.append(input);if(guidance)td.append(guidance);tr.append(td);
    }
    const typeInput=tr.querySelector('[name="entry_type"]'),amountInput=tr.querySelector('[name="amount"]'),fundInput=tr.querySelector('[name="fund_code"]'),divisionInput=tr.querySelector('[name="division"]'),objectInput=tr.querySelector('[name="object_code"]'),refInput=tr.querySelector('[name="ref_id"]'),memoInput=tr.querySelector('[name="memo"]'),guidance=typeInput.parentElement.querySelector(".ledger-entry-guidance");
    const updateEntryGuidance=()=>{
      const isInitial=typeInput.value==="INITIAL_DEPOSIT",isActual=typeInput.value==="ACTUAL",isCommitment=["ENCUMBRANCE","LIQUIDATION"].includes(typeInput.value);
      amountInput.setAttribute("aria-label",isActual?"Raw actual cash balance (€$)":isInitial?"Initial deposit (€$)":"Amount (€$)");amountInput.placeholder=isActual?"Raw cash balance (€$)":isInitial?"Initial deposit (€$)":"Amount (€$)";amountInput.min="0";
      memoInput.maxLength=isInitial?480:500;
      for(const input of [divisionInput,objectInput,refInput]){input.disabled=!isCommitment; if(!isCommitment)input.value="";}
      guidance.textContent=entryGuidance[typeInput.value]||"Choose a budget action.";
    };
    typeInput.addEventListener("change",updateEntryGuidance);fundInput.addEventListener("input",()=>{if(typeInput.value==="INITIAL_DEPOSIT")updateEntryGuidance();});fundInput.addEventListener("change",()=>{if(typeInput.value==="INITIAL_DEPOSIT")updateEntryGuidance();});updateEntryGuidance();
    const td=document.createElement("td"),remove=document.createElement("button");remove.type="button";remove.textContent="Remove";remove.addEventListener("click",()=>{if(entryRows.children.length>1)tr.remove();});td.append(remove);tr.append(td);return tr;
  }
  function renderSuggestions() {
    const values={fund_code:new Set(),division:new Set(activeNodeNames),object_code:new Set(),ref_id:new Set()}, open=new Map();
    for(const r of ledgerRows){if(r.fund_code)values.fund_code.add(r.fund_code);if(r.division)values.division.add(r.division);if(r.object_code)values.object_code.add(r.object_code);if(r.ref_id){const k=[r.fiscal_year,r.fund_code,r.division,r.object_code,r.ref_id].join("::");open.set(k,(open.get(k)||0)+(r.entry_type==="ENCUMBRANCE"?Number(r.amount):r.entry_type==="LIQUIDATION"?-Number(r.amount):0));}}
    for(const [k,v] of open)if(v>0)values.ref_id.add(k.split("::").pop());
    for(const [key,list] of Object.entries(lists))list.replaceChildren(...Array.from(values[key]).sort().map(v=>{const option=document.createElement("option");option.value=v;return option;}));
  }
  async function loadLedger() {
    const {data,error}=await getSupabaseClient().from("command_budget_ledger").select("id, created_at, fiscal_year, fund_code, division, object_code, ref_id, entry_type, amount, memo, recorded_by").order("created_at",{ascending:true});if(error)throw error;ledgerRows=data||[];renderSuggestions();if(activeView==="budget-ledger")renderBudget();
  }
  async function sendBudgetNotification(ledgerIds) {
    const {error}=await getSupabaseClient().functions.invoke("command-budget-discord-notify",{body:{ledger_ids:ledgerIds}});
    if(error)throw error;
  }
  function showNotificationRetry(ledgerIds, count) {
    entryMessage.textContent=count+" posted. Discord notification could not be sent. ";
    const retry=document.createElement("button");retry.type="button";retry.textContent="Retry notification";
    retry.addEventListener("click",async()=>{
      retry.disabled=true;
      try{await sendBudgetNotification(ledgerIds);entryMessage.textContent=count+" posted. Discord notification sent.";}
      catch{retry.disabled=false;entryMessage.textContent=count+" posted. Discord notification could not be sent. ";entryMessage.append(retry);}
    });
    entryMessage.append(retry);
  }
  async function submitBatch(event) {
    event.preventDefault();
    const entries=Array.from(entryRows.querySelectorAll("tr"))
      .map(tr=>Object.fromEntries(Array.from(tr.querySelectorAll("[name]")).map(el=>[el.name,el.value])))
      .filter(entry=>["fund_code","division","object_code","ref_id","entry_type","amount"].some(key=>String(entry[key]||"").trim()));
    if(!entries.length){entryMessage.textContent="Add at least one budget entry before posting.";return;}

    const validation=validateLedgerBatch(entries,ledgerRows,activeNodeNames);
    if(!validation.valid){entryMessage.textContent=validation.errors.join(" ");return;}
    const profile=getCurrentProfile(),userId=profile&&profile.user_id;
    if(!userId){entryMessage.textContent="Your authenticated profile could not be identified.";return;}

    const batch=validation.entries.map(entry=>({
      id:crypto.randomUUID(),
      ...entry,
      entry_type:entry.entry_type==="INITIAL_DEPOSIT"?"APPROPRIATION":entry.entry_type,
      memo:entry.entry_type==="INITIAL_DEPOSIT"?"[INITIAL DEPOSIT] "+entry.memo:entry.memo,
      recorded_by:userId
    }));
    const button=entryForm.querySelector("[type=submit]");button.disabled=true;entryMessage.textContent="Posting ledger batch…";
    try{
      const {error}=await getSupabaseClient().from("command_budget_ledger").insert(batch);
      if(error)throw error;
      await loadLedger();entryRows.replaceChildren(createEntryRow());
      const count=batch.length+" entr"+(batch.length===1?"y":"ies");
      try{await sendBudgetNotification(batch.map(entry=>entry.id));entryMessage.textContent=count+" posted. Discord notification sent.";}
      catch{showNotificationRetry(batch.map(entry=>entry.id),count);}
    }catch(error){entryMessage.textContent="Could not post ledger batch. "+(error.message||"Try again.");}
    finally{button.disabled=false;}
  }
  function switchView(id){activeView=id;contentEl.hidden=id!=="access-manager";budgetContentEl.hidden=id!=="budget-ledger";entryContentEl.hidden=id!=="post-ledger-entry";if(id==="budget-ledger")renderBudget();}
  fundFilter.addEventListener("input",renderBudget);search.addEventListener("input",renderBudget);sort.addEventListener("change",renderBudget);addRow.addEventListener("click",()=>entryRows.append(createEntryRow()));entryForm.addEventListener("submit",event=>void submitBatch(event));closeNotesEl.addEventListener("click",()=>notesDialogEl.close());

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
      if (!profiles.length) { ledgerRows = []; subNavEl.replaceChildren(); viewEl.hidden = true; contentEl.hidden = true; budgetContentEl.hidden = true; entryContentEl.hidden = true; return; }
      renderProfiles();
    },
    show() {viewEl.hidden=false;renderNavButtons(subNavEl,[{id:"access-manager",label:"ACCESS MANAGER"},{id:"budget-ledger",label:"BUDGET LEDGER"},{id:"post-ledger-entry",label:"POST LEDGER ENTRY"}],{activeId:activeView,onSelect:switchView});switchView(activeView);},
    hide() {viewEl.hidden=true;subNavEl.replaceChildren();if(notesDialogEl.open)notesDialogEl.close();}
  };
}
