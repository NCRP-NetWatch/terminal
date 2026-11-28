import { getWorldDatePresentation } from "../dates.js";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });
const STATUS_CLASSES = {
  HOSTILE: "status-hostile",
  DANGEROUS: "status-hostile",
  MONITORED: "status-monitored",
  NEUTRAL: "status-neutral",
  CONTAINED: "status-contained"
};
const TRACE_LOG_NOTE = /^Trace Recorded \(\+1\)$/i;
const SUGGESTION_FIELDS = ["name", "affiliation", "status"];

export function createWatchtowerDatabase({
  titleEl,
  searchEl,
  sortEl,
  bodyEl,
  notesDialogEl,
  notesTitleEl,
  notesListEl,
  closeNotesEl,
  targetSuggestionsEl,
  affiliationSuggestionsEl,
  statusSuggestionsEl
}) {
  let records = [];
  let searchableRecords = [];

  function getRawNotes(row) {
    if (Array.isArray(row.notes)) return row.notes;
    return row.notes ? [row.notes] : [];
  }

  function getNoteText(note) {
    return String(typeof note === "string" ? note : note?.text ?? "").trim();
  }

  function isTraceLogNote(note) {
    return TRACE_LOG_NOTE.test(getNoteText(note));
  }

  function getNotes(row) {
    const notes = getRawNotes(row);
    const contentNotes = notes.filter((note) => getNoteText(note) && !isTraceLogNote(note));
    return contentNotes.length ? contentNotes : notes.filter(isTraceLogNote);
  }

  function openNotes(row) {
    notesTitleEl.textContent = row.name ?? "Unknown";
    const fragment = document.createDocumentFragment();
    for (const note of getNotes(row)) {
      const item = document.createElement("li");
      item.append(document.createTextNode(getNoteText(note)));
      if (typeof note === "object" && note?.author) {
        const author = document.createElement("span");
        author.className = "note-meta";
        author.textContent = `Added by ${note.author}`;
        item.append(author);
      }
      if (typeof note === "object" && note?.addedAt) {
        const time = document.createElement("time");
        time.className = "note-meta";
        const date = getWorldDatePresentation(note.addedAt);
        time.dateTime = date?.iso ?? note.addedAt;
        time.textContent = date?.label ?? note.addedAt;
        item.append(time);
      }
      fragment.append(item);
    }
    notesListEl.replaceChildren(fragment);
    notesDialogEl.showModal();
  }

  function renderRows() {
    const query = searchEl.value.trim().toLowerCase();
    const [sortField, sortDirection] = sortEl.value.split("-");
    const direction = sortDirection === "desc" ? -1 : 1;
    const rows = searchableRecords
      .filter(({ fields }) => fields.some((value) => value.includes(query)))
      .map(({ row }) => row)
      .sort((a, b) => {
        const comparison = sortField === "traces"
          ? (Number(a.traces) || 0) - (Number(b.traces) || 0)
          : collator.compare(a[sortField] ?? "", b[sortField] ?? "");
        return comparison === 0
          ? collator.compare(a.name ?? "", b.name ?? "")
          : comparison * direction;
      });

    const fragment = document.createDocumentFragment();
    for (const row of rows) {
      const tableRow = document.createElement("tr");
      const statusRaw = String(row.status ?? "").trim().toUpperCase();
      const statusClass = STATUS_CLASSES[statusRaw] ?? "";
      if (statusClass) tableRow.classList.add(`row-${statusClass}`);

      const nameCell = document.createElement("td");
      const nameButton = document.createElement("button");
      const notes = getNotes(row);
      const hasNotes = notes.some((note) => !isTraceLogNote(note));
      nameButton.type = "button";
      nameButton.className = "person-name";
      nameButton.textContent = row.name ?? "";
      nameButton.setAttribute("aria-label", hasNotes
        ? `Open ${notes.length} notes for ${row.name}`
        : notes.length
          ? `Open trace log for ${row.name}`
          : `Open notes for ${row.name}`);
      if (hasNotes) {
        const marker = document.createElement("span");
        marker.className = "notes-marker";
        marker.textContent = "*";
        marker.setAttribute("aria-hidden", "true");
        nameButton.append(marker);
      }
      nameButton.addEventListener("click", () => openNotes(row));
      nameCell.append(nameButton);

      const affiliationCell = document.createElement("td");
      affiliationCell.textContent = row.affiliation ?? "";
      const tracesCell = document.createElement("td");
      tracesCell.textContent = row.traces ?? "";
      const statusCell = document.createElement("td");
      statusCell.textContent = row.status ?? "";
      if (statusClass) statusCell.className = statusClass;
      tableRow.append(nameCell, affiliationCell, statusCell, tracesCell);
      fragment.append(tableRow);
    }
    bodyEl.replaceChildren(fragment);
  }

  function updateSuggestions() {
    const suggestions = Object.fromEntries(SUGGESTION_FIELDS.map((field) => [field, new Map()]));
    for (const record of records) {
      for (const field of SUGGESTION_FIELDS) {
        const values = suggestions[field];
        const value = String(record[field] ?? "").trim();
        const normalized = value.toLocaleLowerCase();
        if (value && !values.has(normalized)) values.set(normalized, value);
      }
    }
    const makeOptions = (field) => [...suggestions[field].values()]
      .sort(collator.compare)
      .map((value) => {
        const option = document.createElement("option");
        option.value = value;
        return option;
      });
    targetSuggestionsEl.replaceChildren(...makeOptions("name"));
    affiliationSuggestionsEl.replaceChildren(...makeOptions("affiliation"));
    statusSuggestionsEl.replaceChildren(...makeOptions("status"));
  }

  closeNotesEl.addEventListener("click", () => notesDialogEl.close());
  notesDialogEl.addEventListener("click", (event) => {
    if (event.target === notesDialogEl) notesDialogEl.close();
  });
  searchEl.addEventListener("input", renderRows);
  sortEl.addEventListener("change", renderRows);

  return {
    getRecords: () => records,
    setData(data) {
      records = Array.isArray(data) ? data : [];
      searchableRecords = records.map((row) => ({
        row,
        fields: [
          row.name,
          row.affiliation,
          row.traces,
          row.status,
          ...getNotes(row).map((note) => typeof note === "string" ? note : note?.text)
        ].map((value) => String(value ?? "").toLowerCase())
      }));
      titleEl.textContent = `Node-01-Watchtower (${records.length})`;
      updateSuggestions();
      renderRows();
    },
    render: renderRows
  };
}
