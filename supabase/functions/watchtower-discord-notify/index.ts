type TraceSubmission = {
  target_name: string;
  affiliation: string | null;
  status: string | null;
  trace_count: number;
  note: string | null;
  recorded_by: string;
  agent_name: string | null;
};

type TraceBatchPayload = {
  submitted_at: string;
  records: TraceSubmission[];
};

const MAX_EMBED_TEXT = 5600;
const MAX_BATCH_SIZE = 30;

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" }
  });
}

function escapeDiscordText(value: unknown, maxLength: number) {
  const clean = String(value ?? "")
    .replace(/@/g, "＠")
    .replace(/[\\`*_{}\[\]()<>#+\-.!|~]/g, "\\$&")
    .replace(/[\r\n\t]+/g, " ")
    .trim();
  if (clean.length <= maxLength) return clean;
  return `${clean.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function buildEmbeds(records: TraceSubmission[], agentName: string, submittedAt: string) {
  const timestamp = new Date(submittedAt);
  const dateLabel = Number.isNaN(timestamp.valueOf())
    ? ""
    : timestamp.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  const title = "WATCHTOWER // TRACE BATCH";
  const submitter = `Submitted by ${escapeDiscordText(agentName, 80)}${dateLabel ? ` · ${dateLabel}` : ""}`;
  const description = `${submitter}\n${records.length} trace${records.length === 1 ? "" : "s"} submitted.`;

  const fieldNames = records.map((record, index) =>
    `#${index + 1} ${escapeDiscordText(record.target_name, 220)}`
  );
  const continuedTitle = "WATCHTOWER // CONTINUED";
  const baseValueLength = "S: \nA: ".length + "\n────────────────────────".length + 4;
  const fixedTextSize = title.length + description.length
    + (records.length > 15 ? continuedTitle.length : 0)
    + fieldNames.reduce((total, value) => total + value.length, 0)
    + records.length * baseValueLength;
  const perRecordBudget = Math.max(1, Math.floor((MAX_EMBED_TEXT - fixedTextSize) / records.length));

  const fields = records.map((record, index) => {
    const hasNote = Boolean(String(record.note ?? "").trim());
    const notePrefix = hasNote ? "\nN: " : "";
    const fixedValue = "S: \nA: ".length + notePrefix.length + "\n────────────────────────".length;
    const detailsBudget = Math.max(0, perRecordBudget - fixedValue);
    const statusBudget = Math.min(40, Math.floor(detailsBudget * 0.3));
    const status = escapeDiscordText(record.status, statusBudget);
    const affiliationBudget = Math.min(60, Math.floor((detailsBudget - status.length) * 0.45));
    const affiliation = escapeDiscordText(record.affiliation, affiliationBudget);
    const noteBudget = hasNote ? Math.max(0, detailsBudget - status.length - affiliation.length) : 0;
    const note = hasNote ? escapeDiscordText(record.note, noteBudget) : "";
    const value = [
      `S: ${status}`,
      `A: ${affiliation}`,
      ...(hasNote && note ? [`N: ${note}`] : []),
      "────────────────────────"
    ].join("\n").slice(0, Math.min(perRecordBudget, 1024));
    return { name: fieldNames[index].slice(0, 256), value, inline: false };
  });

  const embeds = [];
  for (let start = 0; start < fields.length; start += 15) {
    embeds.push({
      title: start === 0 ? title : "WATCHTOWER // CONTINUED",
      description: start === 0
        ? description
        : undefined,
      color: 0x00dbe8,
      fields: fields.slice(start, start + 15)
    });
  }
  return embeds;
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const expectedSecret = Deno.env.get("WATCHTOWER_NOTIFY_SECRET");
  const suppliedSecret = request.headers.get("x-watchtower-notify-secret");
  if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const discordWebhookUrl = Deno.env.get("DISCORD_WEBHOOK_URL");
  if (!discordWebhookUrl) return jsonResponse({ error: "Discord webhook is not configured" }, 500);

  let payload: TraceBatchPayload;
  try {
    payload = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON payload" }, 400);
  }

  if (!payload || !Array.isArray(payload.records) || payload.records.length < 1 || payload.records.length > MAX_BATCH_SIZE) {
    return jsonResponse({ error: "Expected between 1 and 30 trace records" }, 400);
  }
  if (payload.records.some((record) => !record || typeof record !== "object")) {
    return jsonResponse({ error: "Trace records are malformed" }, 400);
  }

  const submitterIds = new Set(payload.records.map((record) => record.recorded_by));
  if (submitterIds.size !== 1 || payload.records.some((record) => !String(record.target_name ?? "").trim())) {
    return jsonResponse({ error: "Batch has invalid or mixed submitters" }, 400);
  }

  const agentNames = [...new Set(payload.records.map((record) => String(record.agent_name ?? "").trim()).filter(Boolean))];
  const agentName = agentNames.length === 1 ? agentNames[0] : "Unknown Agent";
  const submittedAt = String(payload.submitted_at ?? "");
  const embeds = buildEmbeds(payload.records, agentName, submittedAt);

  try {
    const response = await fetch(discordWebhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        embeds,
        allowed_mentions: { parse: [] }
      })
    });

    if (!response.ok) {
      console.error("Discord webhook rejected a Watchtower batch", response.status);
      return jsonResponse({ error: "Discord did not accept the notification" }, 502);
    }
  } catch (error) {
    console.error("Discord notification request failed", error);
    return jsonResponse({ error: "Could not contact Discord" }, 502);
  }

  return jsonResponse({ sent: true, count: payload.records.length }, 200);
});
