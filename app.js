import { createWatchtowerNode } from "./nodes/watchtower.js";
import { createLibraryNode } from "./nodes/library.js";
import { createSchoolhouseNode } from "./nodes/schoolhouse.js";
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from "./supabase-config.js";

const NODES = [
  { id: "watchtower", label: "NODE-01-WATCHTOWER" },
  { id: "library", label: "NODE-02-LIBRARY" },
  { id: "schoolhouse", label: "NODE-03-SCHOOLHOUSE" }
];

const ACCESS_RANKS = new Set([
  "ncrp staff",
  "operations manager",
  "supervisor",
  "special agent",
  "senior agent",
  "agent",
  "probationary agent"
]);

const authGateEl = document.getElementById("authGate");
const authMessageEl = document.getElementById("authMessage");
const signInBtn = document.getElementById("discordSignIn");
const authSignOutBtn = document.getElementById("authSignOut");
const agentNameFormEl = document.getElementById("agentNameForm");
const agentNameInputEl = document.getElementById("agentNameInput");
const saveAgentNameBtn = document.getElementById("saveAgentName");
const terminalAppEl = document.getElementById("terminalApp");
const nodeNavEl = document.getElementById("nodeNav");
const subNavEl = document.getElementById("subNav");
const agentIdentityEl = document.getElementById("agentIdentity");
const agentRankEl = document.getElementById("agentRank");
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

const library = createLibraryNode({
  viewEl: document.getElementById("libraryView"),
  contentEl: libraryContentEl,
  subNavEl
});

const schoolhouse = createSchoolhouseNode({
  viewEl: document.getElementById("schoolhouseView"),
  subNavEl,
  previewEl: document.getElementById("preview"),
  placeholderFieldsEl: document.getElementById("placeholderFields"),
  downloadBtn: document.getElementById("downloadBadge")
});

const nodeControllers = { watchtower, library, schoolhouse };
const loadedNodes = new Set();
let supabaseClient;
let currentProfile;
let activeUserId;
let activeNodeId = "library";
let sessionRequestId = 0;
let nodeRenderRequestId = 0;
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
  currentProfile = undefined;
  loadedNodes.clear();
  watchtower.setData([]);
  library.setDocuments([]);
  schoolhouse.setData([]);
  nodeNavEl.replaceChildren();
  subNavEl.replaceChildren();
  agentIdentityEl.textContent = "";
  agentRankEl.textContent = "";
}

function normalizeRank(rank) {
  return String(rank ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function getAllowedNodes(profile) {
  return ACCESS_RANKS.has(normalizeRank(profile.rank)) ? NODES : [];
}

function renderNodeNav(profile) {
  const fragment = document.createDocumentFragment();
  const accessibleNodes = getAllowedNodes(profile);

  for (const node of accessibleNodes) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = node.label;
    btn.dataset.node = node.id;
    btn.addEventListener("click", () => void renderNode(node.id));
    fragment.append(btn);
  }

  nodeNavEl.replaceChildren(fragment);
  return accessibleNodes;
}

async function fetchPublicJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url} (${response.status})`);
  return response.json();
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
    const { data, error } = await supabaseClient
      .from("library_documents")
      .select("id, title, description, body")
      .order("title", { ascending: true });
    if (error) throw error;
    if (generation !== sessionGeneration) return;
    library.setDocuments(data ?? []);
    loadedNodes.add(nodeId);
    return;
  }

  if (nodeId === "schoolhouse") {
    const manifest = await fetchPublicJson("./data/badges.json");
    const badgeEntries = await Promise.all(
      manifest.map(async (item) => {
        const response = await fetch(item.file);
        if (!response.ok) throw new Error(`Could not load ${item.file} (${response.status})`);
        return { ...item, svgText: await response.text() };
      })
    );
    if (generation !== sessionGeneration) return;
    schoolhouse.setData(badgeEntries);
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
  activeNodeId = nodeId;
  for (const btn of nodeNavEl.querySelectorAll("button[data-node]")) {
    const isCurrent = btn.dataset.node === nodeId;
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

function formatRank(rank) {
  return String(rank ?? "")
    .replaceAll("_", " ")
    .trim()
    .toUpperCase();
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
    .select("user_id, agent_name, rank, assigned_node")
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
  renderNodeNav(profile);
  agentIdentityEl.textContent = profile.agent_name?.trim() || "AGENT NAME UNASSIGNED";
  agentRankEl.textContent = formatRank(profile.rank);
  authGateEl.hidden = true;
  terminalAppEl.hidden = false;

  const assignedNode = String(profile.assigned_node ?? "").trim().toLowerCase();
  const initialNode = accessibleNodes.find((node) => node.id === assignedNode)?.id
    ?? (accessibleNodes.some((node) => node.id === activeNodeId) ? activeNodeId : accessibleNodes[0]?.id);

  if (!initialNode) {
    showAuthGate("Your account has no node assignment. Contact an administrator for access.", {
      allowSignOut: true
    });
    return;
  }

  await renderNode(initialNode);
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
