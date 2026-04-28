// public/src/data/timezones.js
//
// Curated list of timezones for the wizard timezone picker.
//
// Why curated and not the full IANA list (~600 entries):
// - Aquaria's realistic deployments are MENA, Europe, Africa, Americas, and a
//   handful of major Asian cities. ~40 entries covers that and stays usable.
// - A future tenant in a missing timezone is fixed by adding one line to this
//   file — no schema change, no migration.
//
// Shape: { id, label, offsetLabel, region }
//   id           — IANA timezone identifier (this is what we store in Firestore)
//   label        — friendly display name (city, English)
//   offsetLabel  — STATIC display offset for grouping context.
//                  NOT used for date math. Real offsets shift with DST and are
//                  computed from `id` at use time via Intl.DateTimeFormat.
//   region       — coarse grouping for the dropdown's <optgroup>
//
// Default for Aquaria: "Asia/Beirut" — see §5 of the master prompt and
// DEFAULT_TIMEZONE_ID at the bottom of this file.

export const timezones = [
  // Middle East & Gulf
  { id: "Asia/Beirut",      label: "Beirut",      offsetLabel: "UTC+02:00", region: "Middle East" },
  { id: "Asia/Damascus",    label: "Damascus",    offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Amman",       label: "Amman",       offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Jerusalem",   label: "Jerusalem",   offsetLabel: "UTC+02:00", region: "Middle East" },
  { id: "Asia/Baghdad",     label: "Baghdad",     offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Riyadh",      label: "Riyadh",      offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Dubai",       label: "Dubai",       offsetLabel: "UTC+04:00", region: "Middle East" },
  { id: "Asia/Qatar",       label: "Doha",        offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Bahrain",     label: "Manama",      offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Kuwait",      label: "Kuwait City", offsetLabel: "UTC+03:00", region: "Middle East" },
  { id: "Asia/Muscat",      label: "Muscat",      offsetLabel: "UTC+04:00", region: "Middle East" },
  { id: "Asia/Tehran",      label: "Tehran",      offsetLabel: "UTC+03:30", region: "Middle East" },
  { id: "Europe/Istanbul",  label: "Istanbul",    offsetLabel: "UTC+03:00", region: "Middle East" },

  // Africa
  { id: "Africa/Cairo",        label: "Cairo",         offsetLabel: "UTC+03:00", region: "Africa" },
  { id: "Africa/Casablanca",   label: "Casablanca",    offsetLabel: "UTC+01:00", region: "Africa" },
  { id: "Africa/Algiers",      label: "Algiers",       offsetLabel: "UTC+01:00", region: "Africa" },
  { id: "Africa/Tunis",        label: "Tunis",         offsetLabel: "UTC+01:00", region: "Africa" },
  { id: "Africa/Lagos",        label: "Lagos",         offsetLabel: "UTC+01:00", region: "Africa" },
  { id: "Africa/Nairobi",      label: "Nairobi",       offsetLabel: "UTC+03:00", region: "Africa" },
  { id: "Africa/Johannesburg", label: "Johannesburg",  offsetLabel: "UTC+02:00", region: "Africa" },

  // Europe
  { id: "Europe/London",    label: "London",     offsetLabel: "UTC+00:00", region: "Europe" },
  { id: "Europe/Paris",     label: "Paris",      offsetLabel: "UTC+01:00", region: "Europe" },
  { id: "Europe/Berlin",    label: "Berlin",     offsetLabel: "UTC+01:00", region: "Europe" },
  { id: "Europe/Madrid",    label: "Madrid",     offsetLabel: "UTC+01:00", region: "Europe" },
  { id: "Europe/Rome",      label: "Rome",       offsetLabel: "UTC+01:00", region: "Europe" },
  { id: "Europe/Amsterdam", label: "Amsterdam",  offsetLabel: "UTC+01:00", region: "Europe" },
  { id: "Europe/Athens",    label: "Athens",     offsetLabel: "UTC+02:00", region: "Europe" },
  { id: "Europe/Moscow",    label: "Moscow",     offsetLabel: "UTC+03:00", region: "Europe" },

  // Americas
  { id: "America/New_York",    label: "New York",    offsetLabel: "UTC-05:00", region: "Americas" },
  { id: "America/Toronto",     label: "Toronto",     offsetLabel: "UTC-05:00", region: "Americas" },
  { id: "America/Chicago",     label: "Chicago",     offsetLabel: "UTC-06:00", region: "Americas" },
  { id: "America/Denver",      label: "Denver",      offsetLabel: "UTC-07:00", region: "Americas" },
  { id: "America/Los_Angeles", label: "Los Angeles", offsetLabel: "UTC-08:00", region: "Americas" },
  { id: "America/Mexico_City", label: "Mexico City", offsetLabel: "UTC-06:00", region: "Americas" },
  { id: "America/Sao_Paulo",   label: "São Paulo",   offsetLabel: "UTC-03:00", region: "Americas" },
  { id: "America/Buenos_Aires",label: "Buenos Aires",offsetLabel: "UTC-03:00", region: "Americas" },

  // Asia & Oceania
  { id: "Asia/Karachi",   label: "Karachi",   offsetLabel: "UTC+05:00", region: "Asia & Oceania" },
  { id: "Asia/Kolkata",   label: "Mumbai",    offsetLabel: "UTC+05:30", region: "Asia & Oceania" },
  { id: "Asia/Bangkok",   label: "Bangkok",   offsetLabel: "UTC+07:00", region: "Asia & Oceania" },
  { id: "Asia/Singapore", label: "Singapore", offsetLabel: "UTC+08:00", region: "Asia & Oceania" },
  { id: "Asia/Hong_Kong", label: "Hong Kong", offsetLabel: "UTC+08:00", region: "Asia & Oceania" },
  { id: "Asia/Tokyo",     label: "Tokyo",     offsetLabel: "UTC+09:00", region: "Asia & Oceania" },
  { id: "Asia/Seoul",     label: "Seoul",     offsetLabel: "UTC+09:00", region: "Asia & Oceania" },
  { id: "Australia/Sydney", label: "Sydney",  offsetLabel: "UTC+10:00", region: "Asia & Oceania" }
];

/**
 * Find a timezone entry by IANA ID. Returns undefined if not in the curated list.
 * (A stored timezone ID outside this list is still valid Firestore data — we just
 * can't render its friendly label without falling back to the raw ID.)
 */
export function getTimezoneById(id) {
  return timezones.find(t => t.id === id);
}

/**
 * Group the timezones by region for rendering as an <optgroup>-style dropdown.
 * Order is preserved within each group.
 */
export function getTimezonesByRegion() {
  const grouped = {};
  for (const tz of timezones) {
    if (!grouped[tz.region]) grouped[tz.region] = [];
    grouped[tz.region].push(tz);
  }
  return grouped;
}

/**
 * Default timezone for a fresh tenant. Matches §5 of the master prompt.
 */
export const DEFAULT_TIMEZONE_ID = "Asia/Beirut";