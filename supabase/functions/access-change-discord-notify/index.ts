import { escapeDiscordText } from "../_shared/discord.js";
import { corsHeaders, jsonResponse } from "../_shared/http.js";

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const discordWebhookUrl = Deno.env.get("ACCESS_CHANGE_DISCORD_WEBHOOK_URL");
  if (!supabaseUrl || !anonKey || !serviceKey || !discordWebhookUrl) {
    return jsonResponse({ error: "Access notification is not configured" }, 500);
  }

  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return jsonResponse({ error: "Unauthorized" }, 401);

  let payload: { target_user_id?: unknown; old_rank?: unknown; new_rank?: unknown };
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }
  const targetId = String(payload?.target_user_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(targetId)) return jsonResponse({ error: "Invalid target" }, 400);

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: { apikey: anonKey, authorization }
  });
  if (!userResponse.ok) return jsonResponse({ error: "Unauthorized" }, 401);
  const user = await userResponse.json();

  const readProfile = async (userId: string) => {
    const query = new URLSearchParams({ user_id: `eq.${userId}`, select: "agent_name,rank,flags" });
    const response = await fetch(`${supabaseUrl}/rest/v1/profiles?${query}`, {
      headers: { apikey: serviceKey, authorization: `Bearer ${serviceKey}` }
    });
    if (!response.ok) throw new Error("Could not verify the profile");
    return (await response.json())[0];
  };

  try {
    const [actor, target] = await Promise.all([readProfile(user.id), readProfile(targetId)]);
    if (!actor?.flags?.includes("COMMAND")) return jsonResponse({ error: "COMMAND access required" }, 403);
    const newRank = String(payload.new_rank ?? "");
    if (!target || target.rank !== newRank) return jsonResponse({ error: "Rank update could not be confirmed" }, 409);

    const discordResponse = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds: [{
          title: "LIBRARY // RANK CHANGE",
          description: `**${escapeDiscordText(actor.agent_name || "Unknown agent")}** changed **${escapeDiscordText(target.agent_name || "Unnamed agent")}** from **${escapeDiscordText(payload.old_rank || "Unassigned")}** to **${escapeDiscordText(newRank)}**.`,
          color: 0x00dbe8
        }],
        allowed_mentions: { parse: [] }
      })
    });
    if (!discordResponse.ok) return jsonResponse({ error: "Discord did not accept the notification" }, 502);
  } catch (error) {
    console.error("Access change notification failed", error);
    return jsonResponse({ error: "Could not send the access notification" }, 502);
  }

  return jsonResponse({ sent: true }, 200);
});
