// CSV serializer - needs parseCSV to work correctly

import { parseCSV } from "./parser";

export interface SerializeOptions {
  delimiter?: string;
  includeHeaders?: boolean;
}

export function serializeToJSON(input: string): string {
  const result = parseCSV(input);
  return JSON.stringify(result.rows, null, 2);
}

export function countRows(input: string): number {
  const result = parseCSV(input);
  return result.rows.length;
}
