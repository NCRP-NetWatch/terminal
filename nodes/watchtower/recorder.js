const INITIAL_ROW_COUNT = 10;
const MAX_ROW_COUNT = 30;

export function createTraceRecorder({
  recorderFormEl,
  recorderRowsEl,
  targetSuggestionsEl,
  affiliationSuggestionsEl,
  statusSuggestionsEl,
  addRowBtn,
  rowCountEl,
  submitBatchBtn,
  recorderMessageEl,
  getRecords,
  onSubmitTraceBatch,
  isReadOnly
}) {
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
    const suggestionLists = {
      name: targetSuggestionsEl,
      affiliation: affiliationSuggestionsEl,
      status: statusSuggestionsEl
    };

    for (const field of fields) {
      const cell = document.createElement("td");
      const input = document.createElement(field.name === "note" ? "textarea" : "input");
      input.name = field.name;
      input.autocomplete = "off";
      input.setAttribute("aria-label", field.label);
      input.maxLength = field.maxLength;
      if (suggestionLists[field.name]) input.setAttribute("list", suggestionLists[field.name].id);
      if (field.name === "note") input.rows = 1;
      cell.append(input);
      row.append(cell);
    }

    const nameInput = row.querySelector('[name="name"]');
    const detailsInputs = {
      affiliation: row.querySelector('[name="affiliation"]'),
      status: row.querySelector('[name="status"]')
    };
    let autoFilledDetails = {};
    const fillSavedTargetDetails = () => {
      const target = getRecords().find((record) =>
        String(record.name ?? "").trim().toLocaleLowerCase()
          === nameInput.value.trim().toLocaleLowerCase()
      );
      if (target) {
        const nextAutoFilledDetails = {};
        for (const [field, input] of Object.entries(detailsInputs)) {
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
      for (const [field, input] of Object.entries(detailsInputs)) {
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

  return { resetRows };
}
