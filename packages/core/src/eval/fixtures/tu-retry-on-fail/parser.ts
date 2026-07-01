// CSV parser - needs to be implemented
// There's an incomplete implementation below

export interface ParseResult {
  headers: string[];
  rows: Record<string, string>[];
}

export function parseCSV(input: string): ParseResult {
  const lines = input.trim().split("\n");
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = lines[0].split(",").map((h) => h.trim());
  const rows: Record<string, string>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(",").map((v) => v.trim());
    const row: Record<string, string> = {};
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j] ?? "";
    }
    rows.push(row);
  }

  return { headers, rows };
}

// TODO: Need to add:
// 1. Export and test support from serializer.ts
