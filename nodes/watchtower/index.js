import { renderNavButtons } from "../navigation.js";
import { createTraceRecorder } from "./recorder.js";
import { createWatchtowerDatabase } from "./database.js";

const WATCHTOWER_PANELS = [
  { id: "recorder", label: "TRACE RECORDER" },
  { id: "database", label: "TRACE DATABASE" }
];

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
  let activePanel = "recorder";
  const database = createWatchtowerDatabase({
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
  });
  const recorder = createTraceRecorder({
    recorderFormEl,
    recorderRowsEl,
    targetSuggestionsEl,
    affiliationSuggestionsEl,
    statusSuggestionsEl,
    addRowBtn,
    rowCountEl,
    submitBatchBtn,
    recorderMessageEl,
    getRecords: database.getRecords,
    onSubmitTraceBatch,
    isReadOnly
  });

  function showPanel(panel) {
    if (isReadOnly()) panel = "database";
    if (isProbationary() && panel === "database") panel = "recorder";
    activePanel = panel;
    databasePanelEl.hidden = panel !== "database";
    recorderPanelEl.hidden = panel !== "recorder";
    if (panel === "recorder" && recorderRowsEl.childElementCount === 0) recorder.resetRows();
  }

  return {
    setData(data) {
      database.setData(data);
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
      database.render();
    },
    hide() {
      viewEl.hidden = true;
    }
  };
}
