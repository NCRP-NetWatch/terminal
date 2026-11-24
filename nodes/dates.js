const WORLD_YEAR_OFFSET = 51;

export function getWorldDatePresentation(value) {
  const sourceDate = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(sourceDate.valueOf())) return null;

  const worldDate = new Date(Date.UTC(
    sourceDate.getUTCFullYear() + WORLD_YEAR_OFFSET,
    sourceDate.getUTCMonth(),
    sourceDate.getUTCDate()
  ));

  return {
    iso: worldDate.toISOString().slice(0, 10),
    label: new Intl.DateTimeFormat(undefined, {
      dateStyle: "long",
      timeZone: "UTC"
    }).format(worldDate)
  };
}
