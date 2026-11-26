import { renderNavButtons } from "./navigation.js";
import { getRankLevel, normalizeRank, RANK_LABELS } from "./ranks.js";

export function createCommandNode({ viewEl, subNavEl, contentEl, getSupabaseClient, getCurrentProfile }) {
  let profiles = [];

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
    },
    setData(data) {
      profiles = Array.isArray(data) ? data : [];
      renderProfiles();
    },
    show() {
      viewEl.hidden = false;
      renderNavButtons(subNavEl, [{ id: "access-manager", label: "ACCESS MANAGER" }], {
        activeId: "access-manager",
        onSelect: () => {}
      });
    },
    hide() {
      viewEl.hidden = true;
    }
  };
}
