/**
 * Tiny CSV parser supporting quoted fields, escaped quotes, CR/LF lines,
 * and a UTF-8 BOM at the start of the file (Excel adds one).
 *
 * Returns an array of row objects keyed by the header line. Header keys
 * are trimmed but otherwise preserved as-is, so the caller is responsible
 * for tolerating Arabic/English aliases.
 */

function stripBom(s: string): string {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

/** Split a CSV file into rows of cells. Handles quoted cells and "" escapes. */
export function parseCsvCells(input: string): string[][] {
  const text = stripBom(input);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let i = 0;

  while (i < text.length) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      cell += ch;
      i += 1;
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      i += 1;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      i += 1;
      continue;
    }
    if (ch === "\r") {
      // Treat CRLF as a single line ending.
      i += 1;
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i += 1;
      continue;
    }
    cell += ch;
    i += 1;
  }
  // Flush last cell/row (file may not end with a newline).
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

export interface CsvRowsResult {
  headers: string[];
  rows: Record<string, string>[];
}

/** Parse CSV text into header-keyed row objects. Empty rows are skipped. */
export function parseCsvRows(text: string): CsvRowsResult {
  const cells = parseCsvCells(text);
  if (cells.length === 0) return { headers: [], rows: [] };
  const headers = cells[0].map((h) => h.trim());
  const rows: Record<string, string>[] = [];
  for (let r = 1; r < cells.length; r += 1) {
    const row = cells[r];
    // Skip fully blank lines (Excel often appends one at EOF).
    if (row.every((c) => c.trim() === "")) continue;
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = (row[idx] ?? "").trim();
    });
    rows.push(obj);
  }
  return { headers, rows };
}

/**
 * Resolve a row's value by trying multiple column-name aliases (case-
 * insensitive, whitespace-trimmed). Returns the first non-empty match.
 */
export function pickField(
  row: Record<string, string>,
  aliases: string[],
): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = alias.trim().toLowerCase();
    const hit = keys.find((k) => k.trim().toLowerCase() === target);
    if (hit && row[hit] !== "") return row[hit];
  }
  return "";
}
