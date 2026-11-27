const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

import { getWorldDateTimePresentation } from "../../../nodes/dates.js";

type LedgerEntry = {
  id: string;
  fiscal_year: number;
  fund_code: string;
  division: string | null;
  object_code: string | null;
  ref_id: string | null;
  entry_type: string;
  amount: number;
  memo: string | null;
  recorded_by: string;
  created_at: string;
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" }
  });
}

function escapeDiscordText(value: unknown, maxLength = 120) {
  return String(value ?? "")
    .replace(/@/g, "＠")
    .replace(/[\\`*_{}\[\]()<>#+\-.!|~]/g, "\\$&")
    .replace(/[\r\n\t]+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function money(value: unknown) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? `€$${new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount)}`
    : "amount unavailable";
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const discordWebhookUrl = Deno.env.get("COMMAND_BUDGET_DISCORD_WEBHOOK_URL");
  if (!supabaseUrl || !anonKey || !serviceKey || !discordWebhookUrl) {
    return jsonResponse({ error: "Budget notification is not configured" }, 500);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

  let payload: { ledger_ids?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }
  const ledgerIds = Array.isArray(payload?.ledger_ids)
    ? [...new Set(payload.ledger_ids.map((id) => String(id)))]
    : [];
  if (ledgerIds.length < 1 || ledgerIds.length > 30 || ledgerIds.some((id) => !/^[0-9a-f-]{36}$/i.test(id))) {
    return jsonResponse({ error: "Expected between 1 and 30 valid ledger IDs" }, 400);
  }

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, authorization }
    });
    if (!userResponse.ok) return jsonResponse({ error: "Unauthorized" }, 401);
    const user = await userResponse.json();

    const profileQuery = new URLSearchParams({ user_id: `eq.${user.id}`, select: "agent_name,flags" });
    const profileResponse = await fetch(`${supabaseUrl}/rest/v1/profiles?${profileQuery}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
    });
    if (!profileResponse.ok) throw new Error("Could not verify COMMAND access");
    const actor = (await profileResponse.json())[0];
    if (!actor?.flags?.includes("COMMAND")) return jsonResponse({ error: "COMMAND access required" }, 403);

    const idsFilter = `in.(${ledgerIds.join(",")})`;
    const ledgerQuery = new URLSearchParams({
      id: idsFilter,
      recorded_by: `eq.${user.id}`,
      select: "id,fiscal_year,fund_code,division,object_code,ref_id,entry_type,amount,memo,recorded_by,created_at",
      order: "created_at.asc"
    });
    const ledgerResponse = await fetch(`${supabaseUrl}/rest/v1/command_budget_ledger?${ledgerQuery}`, {
      headers: { apikey: anonKey, authorization }
    });
    if (!ledgerResponse.ok) {
      console.error("Could not verify posted budget entries", ledgerResponse.status);
      throw new Error("Could not verify the posted ledger entries");
    }
    const entries = await ledgerResponse.json() as LedgerEntry[];
    if (entries.length !== ledgerIds.length || entries.some((entry) => entry.recorded_by !== user.id)) {
      return jsonResponse({ error: "Posted ledger entries could not be confirmed" }, 409);
    }

    const worldDateTime = getWorldDateTimePresentation(entries[0].created_at);
    const dateLabel = worldDateTime ? `${worldDateTime.label} UTC` : "";
    const fields = entries.map((entry) => {
      const title = `${escapeDiscordText(entry.fund_code, 24)} // ${escapeDiscordText(entry.entry_type, 28)} // FY${escapeDiscordText(entry.fiscal_year, 8)}`;
      const details = [
        `Amount: ${money(entry.amount)}`,
        entry.division ? `NODE: ${escapeDiscordText(entry.division, 70)}` : "",
        entry.object_code ? `OBJCODE: ${escapeDiscordText(entry.object_code, 60)}` : "",
        entry.ref_id ? `${entry.entry_type === "CREDIT" ? "Credit ID" : "Purchase ID"}: ${escapeDiscordText(entry.ref_id, 60)}` : "",
        entry.memo ? `Memo: ${escapeDiscordText(entry.memo, 150)}` : ""
      ].filter(Boolean).join("\n");
      return { name: title.slice(0, 256), value: details.slice(0, 1024), inline: false };
    });
    const embeds = [];
    for (let start = 0; start < fields.length; start += 15) {
      embeds.push({
        title: start === 0 ? "COMMAND // BUDGET LEDGER" : "COMMAND // BUDGET LEDGER CONTINUED",
        description: start === 0
          ? `${escapeDiscordText(actor.agent_name || "Unknown agent", 80)} posted ${entries.length} budget entr${entries.length === 1 ? "y" : "ies"}${dateLabel ? ` · ${dateLabel}` : ""}.`
          : undefined,
        color: 0x00dbe8,
        fields: fields.slice(start, start + 15)
      });
    }

    const discordResponse = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ embeds, allowed_mentions: { parse: [] } })
    });
    if (!discordResponse.ok) {
      console.error("Discord webhook rejected a budget batch", discordResponse.status);
      return jsonResponse({ error: "Discord did not accept the notification" }, 502);
    }
  } catch (error) {
    console.error("Budget Discord notification failed", error);
    return jsonResponse({ error: "Could not send the budget notification" }, 502);
  }

  return jsonResponse({ sent: true, count: ledgerIds.length }, 200);
});
