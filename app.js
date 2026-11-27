import { createWatchtowerNode } from "./nodes/watchtower.js";
import { createLibraryNode } from "./nodes/library.js";
import { createSchoolhouseNode } from "./nodes/schoolhouse.js";
import { createBadgeSection } from "./nodes/badge-section.js";
import { createCommandNode } from "./nodes/command.js";
import { loadBadge, loadBadgeEntries, namespaceBadgeSvgIds, renderBadgeSvg } from "./nodes/badges.js";
import { formatRank, getBadgeIdForRank, isAuthorizedRank } from "./nodes/ranks.js";
import { renderNavButtons } from "./nodes/navigation.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const NODES = [
  { id: "command", label: "NODE-0X-COMMAND", title: "Command", description: "NCFO administration, standing directives, and cross-NODE coordination." },
  { id: "watchtower", label: "NODE-01-WATCHTOWER", title: "Watchtower", description: "Authoritative record of successful traces and high-priority investigations." },
  { id: "library", label: "NODE-02-LIBRARY", title: "Library", description: "Administrative records, personnel records, access tokens, equipment logs, fines, and acting designations." },
  { id: "schoolhouse", label: "NODE-03-SCHOOLHOUSE", title: "Schoolhouse", description: "Isolated training simulations and compliance exercises." }
];

const authGateEl = document.getElementById("authGate");
const authMessageEl = document.getElementById("authMessage");
const signInBtn = document.getElementById("discordSignIn");
const authSignOutBtn = document.getElementById("authSignOut");
const agentNameFormEl = document.getElementById("agentNameForm");
const agentNameInputEl = document.getElementById("agentNameInput");
const saveAgentNameBtn = document.getElementById("saveAgentName");
const terminalAppEl = document.getElementById("terminalApp");
const homeViewEl = document.getElementById("homeView");
const homeTitleEl = document.getElementById("homeTitle");
const homeBadgeEl = document.getElementById("homeBadge");
const homeNodeGridEl = document.getElementById("homeNodeGrid");
const nodeNavEl = document.getElementById("nodeNav");
const subNavEl = document.getElementById("subNav");
const signOutBtn = document.getElementById("signOutBtn");
const libraryContentEl = document.getElementById("libraryContent");

const watchtower = createWatchtowerNode({
  viewEl: document.getElementById("watchtowerView"),
  titleEl: document.getElementById("watchtowerTitle"),
  subNavEl,
  searchEl: document.getElementById("dbSearch"),
  sortEl: document.getElementById("dbSort"),
  bodyEl: document.getElementById("dbBody"),
  notesDialogEl: document.getElementById("notesDialog"),
  notesTitleEl: document.getElementById("notesTitle"),
  notesListEl: document.getElementById("notesList"),
  closeNotesEl: document.getElementById("closeNotes"),
  databasePanelEl: document.getElementById("watchtowerDatabasePanel"),
  recorderPanelEl: document.getElementById("watchtowerRecorderPanel"),
  recorderFormEl: document.getElementById("traceRecorderForm"),
  recorderRowsEl: document.getElementById("traceRecorderRows"),
  targetSuggestionsEl: document.getElementById("watchtowerTargetSuggestions"),
  affiliationSuggestionsEl: document.getElementById("watchtowerAffiliationSuggestions"),
  statusSuggestionsEl: document.getElementById("watchtowerStatusSuggestions"),
  addRowBtn: document.getElementById("addTraceRow"),
  rowCountEl: document.getElementById("traceRowCount"),
  submitBatchBtn: document.getElementById("submitTraceBatch"),
  recorderMessageEl: document.getElementById("traceRecorderMessage"),
  onSubmitTraceBatch: submitTraceBatch
});

const badges = createBadgeSection({
  viewEl: document.getElementById("libraryBadgesView"),
  badgeNavEl: document.getElementById("libraryBadgeNav"),
  badgePromptEl: document.getElementById("badgePrompt"),
  badgeWorkspaceEl: document.getElementById("badgeWorkspace"),
  previewEl: document.getElementById("preview"),
  placeholderFieldsEl: document.getElementById("placeholderFields"),
  downloadBtn: document.getElementById("downloadBadge")
});

const library = createLibraryNode({
  viewEl: document.getElementById("libraryView"),
  contentEl: libraryContentEl,
  subNavEl,
  badgeNavEl: document.getElementById("libraryBadgeNav"),
  badges
});

const schoolhouse = createSchoolhouseNode({
  viewEl: document.getElementById("schoolhouseView"),
  subNavEl
});

const command = createCommandNode({
  viewEl: document.getElementById("commandView"),
  subNavEl,
  activeNodeNames: NODES.map((node) => node.label),
  contentEl: document.getElementById("commandAccessContent"),
  budgetContentEl: document.getElementById("commandBudgetContent"),
  entryContentEl: document.getElementById("commandBudgetEntryContent"),
  notesDialogEl: document.getElementById("notesDialog"),
  notesTitleEl: document.getElementById("notesTitle"),
  notesListEl: document.getElementById("notesList"),
  closeNotesEl: document.getElementById("closeNotes"),
  getSupabaseClient: () => supabaseClient,
  getCurrentProfile: () => currentProfile
});

const nodeControllers = { watchtower, library, schoolhouse, command };
const loadedNodes = new Set();
let supabaseClient;
let currentProfile;
let activeUserId;
let activeNodeId = "home";
let sessionRequestId = 0;
let nodeRenderRequestId = 0;
let homeBadgeRequestId = 0;
let sessionGeneration = 0;

function isConfigured() {
  return (
    SUPABASE_URL.startsWith("https://") &&
    !SUPABASE_URL.includes("YOUR_PROJECT_REF") &&
    SUPABASE_PUBLISHABLE_KEY.length > 20 &&
    !SUPABASE_PUBLISHABLE_KEY.includes("YOUR_SUPABASE_PUBLISHABLE_KEY")
  );
}

function showAuthGate(message, { allowSignIn = false, allowSignOut = false, allowAgentNameForm = false } = {}) {
  terminalAppEl.hidden = true;
  authGateEl.hidden = false;
  authMessageEl.textContent = message;
  signInBtn.hidden = !allowSignIn;
  authSignOutBtn.hidden = !allowSignOut;
  agentNameFormEl.hidden = !allowAgentNameForm;
}

function clearTerminalData() {
  sessionGeneration += 1;
  nodeRenderRequestId += 1;
  homeBadgeRequestId += 1;
  currentProfile = undefined;
  loadedNodes.clear();
  homeViewEl.hidden = true;
  watchtower.setData([]);
  library.setDocuments([]);
  badges.setData([]);
  command.setData([]);
  nodeNavEl.replaceChildren();
  subNavEl.replaceChildren();
}

function getAllowedNodes(profile) {
  if (!isAuthorizedRank(profile.rank)) return [];
  const flags = Array.isArray(profile.flags) ? profile.flags : [];
  return NODES.filter((node) => node.id !== "command" || flags.includes("COMMAND"));
}

function renderNodeNav(profile, activeId = activeNodeId) {
  const accessibleNodes = getAllowedNodes(profile);
  renderNavButtons(nodeNavEl, [{ id: "home", label: "HOME" }, ...accessibleNodes], {
    activeId,
    onSelect: (nodeId) => nodeId === "home" ? showHome() : void renderNode(nodeId)
  });
  return accessibleNodes;
}

function showHome() {
  if (!currentProfile) return;
  nodeRenderRequestId += 1;
  activeNodeId = "home";
  const rank = formatRank(currentProfile.rank);
  const name = currentProfile.agent_name?.trim() || "Agent";
  const accessibleNodes = getAllowedNodes(currentProfile);
  homeTitleEl.textContent = `Welcome, ${rank} ${name}`;
  void renderHomeBadge(currentProfile);
  homeNodeGridEl.replaceChildren(...accessibleNodes.map((node) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "home-node-card";
    const label = document.createElement("span");
    label.className = "home-node-label";
    label.textContent = node.label;
    const title = document.createElement("strong");
    title.className = "home-node-title";
    title.textContent = node.title;
    const description = document.createElement("span");
    description.className = "home-node-description";
    description.textContent = node.description;
    card.append(label, title, description);
    card.addEventListener("click", () => void renderNode(node.id));
    return card;
  }));
  for (const controller of Object.values(nodeControllers)) controller.hide();
  homeViewEl.hidden = false;
  subNavEl.replaceChildren();
  renderNodeNav(currentProfile, "home");
}

async function renderHomeBadge(profile) {
  const requestId = ++homeBadgeRequestId;
  const badgeId = getBadgeIdForRank(profile.rank);
  homeBadgeEl.hidden = true;
  homeBadgeEl.replaceChildren();
  if (!badgeId) return;

  try {
    const badge = await loadBadge(badgeId);
    if (requestId !== homeBadgeRequestId || currentProfile !== profile || activeNodeId !== "home") return;
    homeBadgeEl.innerHTML = namespaceBadgeSvgIds(
      renderBadgeSvg(badge.svgText, { "[AGENT NAME]": profile.agent_name?.trim() })
    );
    homeBadgeEl.setAttribute("aria-label", `${formatRank(profile.rank)} badge for ${profile.agent_name?.trim()}`);
    homeBadgeEl.hidden = false;
  } catch (error) {
    console.error("Could not load the home badge", error);
  }
}

async function loadNodeData(nodeId, generation = sessionGeneration) {
  if (loadedNodes.has(nodeId)) return;

  if (nodeId === "watchtower") {
    const { data, error } = await supabaseClient
      .from("watchtower_traces")
      .select("name, affiliation, traces, status, notes")
      .order("name", { ascending: true });
    if (error) throw error;
    if (generation !== sessionGeneration) return;
    watchtower.setData(data ?? []);
    loadedNodes.add(nodeId);
    return;
  }

  if (nodeId === "library") {
    const [{ data, error }, badgeEntries] = await Promise.all([
      supabaseClient
        .from("library_documents")
        .select("id, title, description, body")
        .order("title", { ascending: true }),
      loadBadgeEntries()
    ]);
    if (error) throw error;
    if (generation !== sessionGeneration) return;
    library.setDocuments(data ?? []);
    badges.setData(badgeEntries);
    loadedNodes.add(nodeId);
    return;
  }

  if (nodeId === "command") {
    await command.load();
    if (generation !== sessionGeneration) return;
    loadedNodes.add(nodeId);
  }
}

async function submitTraceBatch(entries) {
  if (!activeUserId) throw new Error("Your sign-in session has expired. Sign in again and retry.");

  const rows = entries.map((entry) => ({
    target_name: entry.name,
    affiliation: entry.affiliation || null,
    status: entry.status || null,
    trace_count: 1,
    note: entry.note || null,
    recorded_by: activeUserId
  }));

  const { error } = await supabaseClient
    .from("watchtower_trace_submissions")
    .insert(rows);
  if (error) throw error;

  const count = entries.length;
  loadedNodes.delete("watchtower");
  try {
    await loadNodeData("watchtower");
    return { count, refreshed: true };
  } catch (refreshError) {
    console.error(refreshError);
    return { count, refreshed: false };
  }
}

function showNodeError(nodeId, error) {
  const message = `Unable to load this node. ${error.message ?? error}`;
  subNavEl.replaceChildren(document.createTextNode(message));

  if (nodeId === "library") {
    const errorEl = document.createElement("p");
    errorEl.className = "library-error";
    errorEl.textContent = message;
    libraryContentEl.replaceChildren(errorEl);
  }
}

async function renderNode(nodeId) {
  if (!currentProfile || !getAllowedNodes(currentProfile).some((node) => node.id === nodeId)) return;

  const requestId = ++nodeRenderRequestId;
  homeBadgeRequestId += 1;
  activeNodeId = nodeId;
  homeViewEl.hidden = true;
  for (const btn of nodeNavEl.querySelectorAll("button[data-nav-id]")) {
    const isCurrent = btn.dataset.navId === nodeId;
    btn.classList.toggle("active", isCurrent);
    btn.setAttribute("aria-current", isCurrent ? "page" : "false");
  }

  for (const [otherId, controller] of Object.entries(nodeControllers)) {
    if (otherId !== nodeId) controller.hide();
  }

  subNavEl.replaceChildren(document.createTextNode("CONNECTING TO NODE…"));
  nodeControllers[nodeId].show();

  try {
    await loadNodeData(nodeId);
    if (requestId !== nodeRenderRequestId) return;
    nodeControllers[nodeId].show();
  } catch (error) {
    if (requestId !== nodeRenderRequestId) return;
    console.error(error);
    showNodeError(nodeId, error);
  }
}

async function activateSession(session) {
  const requestId = ++sessionRequestId;

  if (!session?.user) {
    clearTerminalData();
    activeUserId = undefined;
    showAuthGate("Authenticate with Discord to access your assigned node.", { allowSignIn: true });
    return;
  }

  if (activeUserId !== session.user.id) {
    clearTerminalData();
    activeUserId = session.user.id;
  }

  showAuthGate("Verifying personnel record…", { allowSignOut: true });

  const { data: profile, error } = await supabaseClient
    .from("profiles")
    .select("user_id, agent_name, rank, flags")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (requestId !== sessionRequestId) return;

  if (error) {
    console.error(error);
    showAuthGate("Unable to verify your personnel record. Please try again or contact an administrator.", {
      allowSignOut: true
    });
    return;
  }

  if (!profile) {
    showAuthGate("Your personnel profile was not found. Contact an administrator.", {
      allowSignOut: true
    });
    return;
  }

  if (!String(profile.agent_name ?? "").trim()) {
    agentNameInputEl.value = "";
    showAuthGate("Set your in-character agent name to request terminal access.", {
      allowSignOut: true,
      allowAgentNameForm: true
    });
    agentNameInputEl.focus();
    return;
  }

  if (!String(profile.rank ?? "").trim()) {
    showAuthGate("Your Discord account is signed in, but a rank has not been assigned yet. Contact an administrator for access.", {
      allowSignOut: true
    });
    return;
  }

  const accessibleNodes = getAllowedNodes(profile);
  if (!accessibleNodes.length) {
    showAuthGate("Your profile has a rank that is not configured for terminal access. Contact an administrator.", {
      allowSignOut: true
    });
    return;
  }

  currentProfile = profile;
  authGateEl.hidden = true;
  terminalAppEl.hidden = false;

  showHome();
}

async function saveAgentName(event) {
  event.preventDefault();
  const agentName = agentNameInputEl.value.trim();
  const userId = activeUserId;
  if (!userId) return;
  if (!agentName) {
    authMessageEl.textContent = "Enter an agent name before saving.";
    agentNameInputEl.focus();
    return;
  }

  saveAgentNameBtn.disabled = true;
  authMessageEl.textContent = "Saving your agent name…";

  let result;
  try {
    result = await supabaseClient
      .from("profiles")
      .update({ agent_name: agentName })
      .eq("user_id", userId)
      .select("user_id")
      .maybeSingle();
  } catch (error) {
    console.error(error);
    saveAgentNameBtn.disabled = false;
    authMessageEl.textContent = "Could not save your agent name. Check your connection and try again.";
    return;
  }

  saveAgentNameBtn.disabled = false;
  if (activeUserId !== userId) return;

  if (result.error) {
    console.error(result.error);
    authMessageEl.textContent = "Could not save your agent name. Please try again or contact an administrator.";
    return;
  }

  if (!result.data) {
    authMessageEl.textContent = "Your name was not saved. Check the profile update policy or contact an administrator.";
    return;
  }

  await activateSession({ user: { id: userId } });
}

async function signInWithDiscord() {
  signInBtn.disabled = true;
  authMessageEl.textContent = "Redirecting to Discord…";
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "discord",
    options: { redirectTo }
  });

  if (error) {
    authMessageEl.textContent = `Discord sign-in failed. ${error.message}`;
    signInBtn.disabled = false;
  }
}

async function signOut() {
  if (!supabaseClient) return;
  const { error } = await supabaseClient.auth.signOut();
  if (error) {
    authMessageEl.textContent = `Could not sign out. ${error.message}`;
  }
}

async function init() {
  if (!isConfigured()) {
    showAuthGate("Add your Supabase project URL and publishable key in supabase-config.js to enable sign-in.");
    return;
  }

  if (!window.supabase?.createClient) {
    showAuthGate("The Supabase client could not be loaded. Refresh the page and try again.");
    return;
  }

  supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  signInBtn.addEventListener("click", () => void signInWithDiscord());
  authSignOutBtn.addEventListener("click", () => void signOut());
  signOutBtn.addEventListener("click", () => void signOut());
  agentNameFormEl.addEventListener("submit", (event) => void saveAgentName(event));

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "TOKEN_REFRESHED") return;
    window.setTimeout(() => void activateSession(session), 0);
  });

  const { data, error } = await supabaseClient.auth.getSession();
  if (error) {
    showAuthGate(`Unable to read the sign-in session. ${error.message}`, { allowSignIn: true });
    return;
  }
  await activateSession(data.session);
}

void init();
