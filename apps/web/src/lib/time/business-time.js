export const BUSINESS_TIME_ZONE = "America/Sao_Paulo";

/** @param {string | number | Date} instant */
export function toBusinessDate(instant) {
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) throw new RangeError("Invalid instant");

  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
