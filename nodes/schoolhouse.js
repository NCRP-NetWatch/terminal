export function createSchoolhouseNode({ viewEl, subNavEl }) {
  return {
    show() {
      viewEl.hidden = false;
      subNavEl.replaceChildren();
    },
    hide() {
      viewEl.hidden = true;
    }
  };
}
