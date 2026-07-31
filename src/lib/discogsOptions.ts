// Known value sets for a handful of /database/search params whose Discogs
// vocabulary is small and fixed. These are suggestions, not a whitelist —
// Discogs doesn't publish a strict enum for any of these fields, and search
// still accepts arbitrary text, so callers should render them as a
// datalist-backed input rather than a closed <select>.

// Discogs' top-level genre taxonomy (release.genres). Fixed and short enough
// to enumerate confidently.
export const DISCOGS_GENRES = [
  "Blues",
  "Brass & Military",
  "Children's",
  "Classical",
  "Electronic",
  "Folk, World, & Country",
  "Funk / Soul",
  "Hip Hop",
  "Jazz",
  "Latin",
  "Non-Music",
  "Pop",
  "Reggae",
  "Rock",
  "Stage & Screen",
];

// Common release.formats[].name values. Not exhaustive — Discogs' format
// list has long-tail entries (e.g. specific tape/optical formats) that
// aren't worth enumerating here.
export const DISCOGS_FORMATS = [
  "Vinyl",
  "CD",
  "Cassette",
  "CDr",
  "File",
  "DVD",
  "Box Set",
  "Blu-ray",
  "SACD",
  "HDCD",
  "Minidisc",
  "DAT",
  "VHS",
  "Laserdisc",
  "Reel-To-Reel",
  "8-Track Cartridge",
  "Flexi-disc",
  "Lathe Cut",
  "Shellac",
  "Acetate",
  "All Media",
];
