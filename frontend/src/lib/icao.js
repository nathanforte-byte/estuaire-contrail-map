// Trimmed icao label helpers, used in the marker tooltip + minimal stats line.
export const callsignToAirline = (cs) =>
  ((cs || "").trim().slice(0, 3) || "").toUpperCase();
