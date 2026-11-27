export const WORLD_YEAR_OFFSET = 51;
const WORLD_DATE_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeZone: "UTC"
});
const WORLD_DATETIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC"
});

function parseSourceDate(value) {
  const dateValue = String(value ?? "").trim();
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(dateValue)
    ? `${dateValue}T12:00:00Z`
    : dateValue);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function getWorldFiscalYear(realDate = new Date()) {
  const date = realDate instanceof Date ? realDate : new Date(realDate);
  if (Number.isNaN(date.valueOf())) return null;
  return date.getFullYear() + WORLD_YEAR_OFFSET;
}

export function getWorldDatePresentation(value) {
  const sourceDate = parseSourceDate(value);
  if (!sourceDate) return null;

  const worldDate = toWorldDate(sourceDate);

  return {
    iso: worldDate.toISOString().slice(0, 10),
    label: WORLD_DATE_FORMATTER.format(worldDate)
  };
}

export function getWorldDateSortValue(value) {
  return parseSourceDate(value)?.valueOf() ?? null;
}

export function getWorldDateTimePresentation(value) {
  const sourceDate = parseSourceDate(value);
  if (!sourceDate) return null;
  const worldDateTime = toWorldDate(sourceDate);
  return {
    iso: worldDateTime.toISOString(),
    label: WORLD_DATETIME_FORMATTER.format(worldDateTime)
  };
}

function toWorldDate(date) {
  return new Date(Date.UTC(
    date.getUTCFullYear() + WORLD_YEAR_OFFSET,
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
    date.getUTCMilliseconds()
  ));
}
