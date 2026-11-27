const ENTRY_TYPES = new Set(["APPROPRIATION", "AMENDMENT", "ENCUMBRANCE", "LIQUIDATION", "ACTUAL"]);
const cents = (n) => Math.round((Number(n) + Number.EPSILON) * 100);
const dollars = (n) => n / 100;
const amountCents = (row) => Number.isFinite(Number(row.amount)) ? cents(row.amount) : 0;
const lineKey = (row) => [row.fund_code || "", row.division || "", row.object_code || ""].join("::");
const refKey = (row) => [row.fiscal_year || "", lineKey(row), row.ref_id || ""].join("::");
const textCompare = (a,b) => String(a || "").localeCompare(String(b || ""), undefined, {numeric:true,sensitivity:"base"});
export function aggregateBudgetRows(rows, {fiscalYear, fundCode} = {}) {
 const groups = new Map();
 for (const row of (Array.isArray(rows) ? rows : [])) {
  if (fiscalYear !== undefined && fiscalYear !== "" && Number(row.fiscal_year) !== Number(fiscalYear)) continue;
  if (fundCode !== undefined && fundCode !== "" && row.fund_code !== fundCode) continue;
  const key=lineKey(row); let g=groups.get(key);
  if(!g){g={fund_code:row.fund_code,division:row.division,object_code:row.object_code,revised:0,encumbered:0,actuals:0};groups.set(key,g);}
  const amount=amountCents(row);
  if(row.entry_type==="APPROPRIATION"||row.entry_type==="AMENDMENT")g.revised+=amount;
  else if(row.entry_type==="ENCUMBRANCE")g.encumbered+=amount;
  else if(row.entry_type==="LIQUIDATION")g.encumbered-=amount;
  else if(row.entry_type==="ACTUAL")g.actuals+=amount;
 }
 const summary=[...groups.values()].map(g=>{const revised=dollars(g.revised),encumbered=dollars(g.encumbered),actuals=dollars(g.actuals);return {fund_code:g.fund_code,division:g.division,object_code:g.object_code,revised,encumbered,actuals,available:dollars(g.revised-g.encumbered-g.actuals),burnRate:revised>0?(encumbered+actuals)/revised:0};}).sort((a,b)=>textCompare(a.fund_code,b.fund_code)||textCompare(a.division,b.division)||textCompare(a.object_code,b.object_code));
 const totals=summary.reduce((t,r)=>{t.totalRevised+=r.revised;t.totalEncumbered+=r.encumbered;t.totalActuals+=r.actuals;t.totalAvailable+=r.available;return t;},{totalRevised:0,totalEncumbered:0,totalActuals:0,totalAvailable:0});
 for(const key of Object.keys(totals))totals[key]=dollars(cents(totals[key])); return {rows:summary,...totals};
}
export function getAuditTrail(rows,{fundCode,division,objectCode,refId}={}) { return (Array.isArray(rows)?rows:[]).filter(r=>refId!==undefined?r.ref_id===refId:(fundCode===undefined||r.fund_code===fundCode)&&(division===undefined||r.division===division)&&(objectCode===undefined||r.object_code===objectCode)).slice().sort((a,b)=>new Date(a.created_at||0)-new Date(b.created_at||0)||String(a.id||"").localeCompare(String(b.id||""))); }
export function validateLedgerBatch(entries,existingRows=[]) {
 const errors=[]; const normalized=(Array.isArray(entries)?entries:[]).map(e=>({...e,fiscal_year:Number(e.fiscal_year),fund_code:String(e.fund_code||"").trim(),division:String(e.division||"").trim(),object_code:String(e.object_code||"").trim(),ref_id:String(e.ref_id||"").trim()||null,entry_type:String(e.entry_type||"").trim().toUpperCase(),amount:Number(e.amount),memo:String(e.memo||"").trim()||null}));
 const open=new Map(); for(const r of existingRows){const k=refKey(r),v=open.get(k)||0;if(r.entry_type==="ENCUMBRANCE")open.set(k,v+amountCents(r));if(r.entry_type==="LIQUIDATION")open.set(k,v-amountCents(r));}
 normalized.forEach((e,i)=>{const n=i+1;if(!Number.isInteger(e.fiscal_year)||e.fiscal_year<1900||e.fiscal_year>9999)errors.push("Row "+n+": enter a valid fiscal year.");for(const [f,label] of [["fund_code","fund"],["division","division"],["object_code","object code"]])if(!e[f])errors.push("Row "+n+": "+label+" is required.");if(!ENTRY_TYPES.has(e.entry_type))errors.push("Row "+n+": choose a valid entry type.");if(!Number.isFinite(e.amount)||e.amount===0)errors.push("Row "+n+": amount must be a non-zero number.");if(e.entry_type!=="AMENDMENT"&&Number.isFinite(e.amount)&&e.amount<0)errors.push("Row "+n+": "+e.entry_type.toLowerCase()+" amounts must be positive; use a negative amendment to reduce an appropriation.");if(["ENCUMBRANCE","LIQUIDATION"].includes(e.entry_type)&&!e.ref_id)errors.push("Row "+n+": a reference ID is required for "+e.entry_type.toLowerCase()+" entries.");if(e.entry_type==="ENCUMBRANCE"&&e.amount>0){const k=refKey(e);open.set(k,(open.get(k)||0)+cents(e.amount));}if(e.entry_type==="LIQUIDATION"&&Number.isFinite(e.amount)&&e.amount>0){const k=refKey(e),v=open.get(k)||0;if(cents(e.amount)>v)errors.push("Row "+n+": liquidation ("+e.amount.toFixed(2)+") exceeds open encumbrance ("+dollars(v).toFixed(2)+") for "+e.ref_id+".");else open.set(k,v-cents(e.amount));}});
 return {valid:errors.length===0,errors,entries:normalized};
}
