import { renderNavButtons } from "./navigation.js";
import { getWorldDatePresentation } from "./dates.js";

const collator = new Intl.Collator(undefined, { sensitivity: "base", numeric: true });

const STATUS_CLASSES = {
  HOSTILE: "status-hostile",
  DANGEROUS: "status-hostile",
  MONITORED: "status-monitored",
  NEUTRAL: "status-neutral",
  CONTAINED: "status-contained"
};

const TRACE_LOG_NOTE = /^Trace Recorded \(\+1\)$/i;

const WATCHTOWER_PANELS = [
  { id: "recorder", label: "TRACE RECORDER" },
  { id: "database", label: "TRACE DATABASE" }
];
const SUGGESTION_FIELDS = ["name", "affiliation", "status"];

export function createWatchtowerNode({
  viewEl,
  titleEl,
  subNavEl,
  searchEl,
  sortEl,
  bodyEl,
  notesDialogEl,
  notesTitleEl,
  notesListEl,
  closeNotesEl,
  databasePanelEl,
  recorderPanelEl,
  recorderFormEl,
  recorderRowsEl,
  targetSuggestionsEl,
  affiliationSuggestionsEl,
  statusSuggestionsEl,
  addRowBtn,
  rowCountEl,
  submitBatchBtn,
  recorderMessageEl,
  onSubmitTraceBatch,
  isProbationary = () => false,
  isReadOnly = () => false
}) {
  let records = [];
  let activePanel = "recorder";

  const INITIAL_ROW_COUNT = 10;
  const MAX_ROW_COUNT = 30;

  function updateRowCount() {
    const count = recorderRowsEl.childElementCount;
    rowCountEl.textContent = `${count} / ${MAX_ROW_COUNT} rows`;
    addRowBtn.disabled = count >= MAX_ROW_COUNT;
  }

  function addRow() {
    if (recorderRowsEl.childElementCount >= MAX_ROW_COUNT) {
      recorderMessageEl.textContent = "A batch can contain up to 30 rows.";
      return;
    }

    const rowNumber = recorderRowsEl.childElementCount + 1;
    const row = document.createElement("tr");
    const fields = [
      { name: "name", label: `Row ${rowNumber} target name`, maxLength: 100 },
      { name: "affiliation", label: `Row ${rowNumber} affiliation`, maxLength: 120 },
      { name: "status", label: `Row ${rowNumber} status`, maxLength: 40 },
      { name: "note", label: `Row ${rowNumber} notes`, maxLength: 1000 }
    ];

    for (const field of fields) {
      const cell = document.createElement("td");
      const input = document.createElement(field.name === "note" ? "textarea" : "input");
      input.name = field.name;
      input.setAttribute("aria-label", field.label);
      input.maxLength = field.maxLength;
      const suggestionLists = {
        name: targetSuggestionsEl,
        affiliation: affiliationSuggestionsEl,
        status: statusSuggestionsEl
      };
      if (suggestionLists[field.name]) input.setAttribute("list", suggestionLists[field.name].id);
      if (field.name === "note") input.rows = 1;
      cell.append(input);
      row.append(cell);
    }

    const nameInput = row.querySelector('[name="name"]');
    const affiliationInput = row.querySelector('[name="affiliation"]');
    const statusInput = row.querySelector('[name="status"]');
    let autoFilledDetails = {};
    const fillSavedTargetDetails = () => {
      const target = records.find((record) =>
        String(record.name ?? "").trim().toLocaleLowerCase()
          === nameInput.value.trim().toLocaleLowerCase()
      );
      if (target) {
        const nextAutoFilledDetails = {};
        for (const [field, input] of Object.entries({
          affiliation: affiliationInput,
          status: statusInput
        })) {
          const wasAutoFilled = Object.prototype.hasOwnProperty.call(autoFilledDetails, field)
            && input.value === autoFilledDetails[field];
          if (!input.value.trim() || wasAutoFilled) {
            input.value = target[field] ?? "";
            nextAutoFilledDetails[field] = input.value;
          }
        }
        autoFilledDetails = nextAutoFilledDetails;
        return;
      }
      for (const [field, input] of Object.entries({
        affiliation: affiliationInput,
        status: statusInput
      })) {
        if (Object.prototype.hasOwnProperty.call(autoFilledDetails, field)
          && input.value === autoFilledDetails[field]) {
          input.value = "";
        }
      }
      autoFilledDetails = {};
    };
    nameInput.addEventListener("input", fillSavedTargetDetails);
    nameInput.addEventListener("change", fillSavedTargetDetails);

    recorderRowsEl.append(row);
    updateRowCount();
    recorderMessageEl.textContent = "";
  }

  function resetRows() {
    recorderRowsEl.replaceChildren();
    for (let index = 0; index < INITIAL_ROW_COUNT; index += 1) addRow();
  }

  function showPanel(panel) {
    if (isReadOnly()) panel = "database";
    if (isProbationary() && panel === "database") panel = "recorder";
    activePanel = panel;
    databasePanelEl.hidden = panel !== "database";
    recorderPanelEl.hidden = panel !== "recorder";
    if (panel === "recorder" && recorderRowsEl.childElementCount === 0) resetRows();
  }

  addRowBtn.addEventListener("click", addRow);
  recorderFormEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (isReadOnly()) return;
    const entries = [];
    let incompleteRow;
    for (const row of recorderRowsEl.querySelectorAll("tr")) {
      const value = (name) => row.querySelector(`[name="${name}"]`).value.trim();
      const entry = {
        name: value("name"),
        affiliation: value("affiliation"),
        status: value("status"),
        note: value("note")
      };
      if (!entry.name && (entry.affiliation || entry.status || entry.note)) {
        incompleteRow = row;
        break;
      }
      if (entry.name) entries.push(entry);
    }

    if (incompleteRow) {
      recorderMessageEl.textContent = "Add a name to every row that has other information, or clear that row.";
      incompleteRow.querySelector('[name="name"]').focus();
      return;
    }
    if (entries.length === 0) {
      recorderMessageEl.textContent = "Enter at least one target before submitting.";
      recorderRowsEl.querySelector('[name="name"]').focus();
      return;
    }

    addRowBtn.disabled = true;
    submitBatchBtn.disabled = true;
    recorderMessageEl.textContent = "Submitting trace batch…";
    try {
      const result = await onSubmitTraceBatch(entries);
      resetRows();
      recorderMessageEl.textContent = `${result.count} trace${result.count === 1 ? "" : "s"} recorded.${result.refreshed ? " Watchtower is up to date." : " Saved; the database view will refresh next time you open it."}`;
    } catch (error) {
      console.error(error);
      recorderMessageEl.textContent = `Trace batch was not submitted. ${error.message ?? "Check your connection and try again."}`;
    } finally {
      submitBatchBtn.disabled = false;
      updateRowCount();
    }
  });

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

  closeNotesEl.addEventListener("click", () => notesDialogEl.close());
  notesDialogEl.addEventListener("click", (event) => {
    if (event.target === notesDialogEl) notesDialogEl.close();
  });

  function renderRows() {
    const q = searchEl.value.trim().toLowerCase();
    const [sortField, sortDirection] = sortEl.value.split("-");
    const direction = sortDirection === "desc" ? -1 : 1;

    const rows = records
      .filter((row) =>
        [
          row.name,
          row.affiliation,
          row.traces,
          row.status,
          ...getNotes(row).map((note) => typeof note === "string" ? note : note?.text)
        ]
          .some((val) => String(val ?? "").toLowerCase().includes(q))
      )
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
      const tr = document.createElement("tr");
      const statusRaw = String(row.status ?? "").trim().toUpperCase();
      const statusClass = STATUS_CLASSES[statusRaw] ?? "";

      if (statusClass) {
        tr.classList.add(`row-${statusClass}`);
      }

      const nameTd = document.createElement("td");
      const nameButton = document.createElement("button");
      const notes = getNotes(row);
      const hasNotes = notes.some((note) => !isTraceLogNote(note));
      nameButton.type = "button";
      nameButton.className = "person-name";
      nameButton.textContent = row.name ?? "";
      nameButton.setAttribute(
        "aria-label",
        hasNotes
          ? `Open ${notes.length} notes for ${row.name}`
          : notes.length
            ? `Open trace log for ${row.name}`
            : `Open notes for ${row.name}`
      );
      if (hasNotes) {
        const marker = document.createElement("span");
        marker.className = "notes-marker";
        marker.textContent = "*";
        marker.setAttribute("aria-hidden", "true");
        nameButton.append(marker);
      }
      nameButton.addEventListener("click", () => openNotes(row));
      nameTd.append(nameButton);

      const affiliationTd = document.createElement("td");
      affiliationTd.textContent = row.affiliation ?? "";

      const tracesTd = document.createElement("td");
      tracesTd.textContent = row.traces ?? "";

      const statusTd = document.createElement("td");
      statusTd.textContent = row.status ?? "";
      if (statusClass) {
        statusTd.className = statusClass;
      }

      tr.append(nameTd, affiliationTd, statusTd, tracesTd);
      fragment.append(tr);
    }

    bodyEl.replaceChildren(fragment);
  }

  searchEl.addEventListener("input", renderRows);
  sortEl.addEventListener("change", renderRows);

  return {
    setData(data) {
      records = Array.isArray(data) ? data : [];
      titleEl.textContent = `Node-01-Watchtower (${records.length})`;
      const suggestions = Object.fromEntries(
        SUGGESTION_FIELDS.map((field) => [field, new Map()])
      );
      for (const record of records) {
        for (const field of SUGGESTION_FIELDS) {
          const values = suggestions[field];
          const value = String(record[field] ?? "").trim();
          const normalized = value.toLocaleLowerCase();
          if (value && !values.has(normalized)) values.set(normalized, value);
        }
      }
      const makeSuggestions = (field) => [...suggestions[field].values()]
          .sort(collator.compare)
          .map((value) => {
            const option = document.createElement("option");
            option.value = value;
            return option;
          });
      targetSuggestionsEl.replaceChildren(...makeSuggestions("name"));
      affiliationSuggestionsEl.replaceChildren(...makeSuggestions("affiliation"));
      statusSuggestionsEl.replaceChildren(...makeSuggestions("status"));
      renderRows();
    },
    show() {
      viewEl.hidden = false;
      if (isReadOnly()) activePanel = "database";
      renderNavButtons(subNavEl, WATCHTOWER_PANELS.filter((panel) =>
        isProbationary()
          ? panel.id === "recorder"
          : !isReadOnly() || panel.id === "database"
      ), {
        activeId: activePanel,
        onSelect: showPanel
      });
      showPanel(activePanel);
      renderRows();
    },
    hide() {
      viewEl.hidden = true;
    }
  };
}
