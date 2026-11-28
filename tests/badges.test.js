import test from "node:test";
import assert from "node:assert/strict";
import { getBadgeFields, namespaceBadgeSvgIds, renderBadgeSvg } from "../nodes/badges.js";

test("badge placeholders are escaped and unknown placeholders remain visible", () => {
  assert.equal(
    renderBadgeSvg("<text>[NAME]</text> [UNSET]", { "[NAME]": "A&B <Agent>" }),
    "<text>A&amp;B &lt;Agent&gt;</text> [UNSET]"
  );
});

test("badge fields are unique and omit the non-editable NCFO token", () => {
  assert.deepEqual(getBadgeFields("[NAME] [NAME] [NCFO] [UNIT]"), ["[NAME]", "[UNIT]"]);
});

test("SVG instance IDs and local references are namespaced together", () => {
  const svg = '<svg><title id="title">x</title><g aria-labelledby="title" fill="url(#paint)"/><defs><linearGradient id="paint"/></defs></svg>';
  const result = namespaceBadgeSvgIds(svg);
  const titleId = result.match(/<title id="([^"]+)"/)?.[1];
  const paintId = result.match(/id="([^"]+)"\/><\/defs>/)?.[1];
  assert.ok(titleId?.startsWith("badge-"));
  assert.ok(paintId?.startsWith("badge-"));
  assert.match(result, new RegExp(`aria-labelledby="${titleId}"`));
  assert.match(result, new RegExp(`url\\(#${paintId}\\)`));
});
