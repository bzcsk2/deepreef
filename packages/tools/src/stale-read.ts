import { stat } from "node:fs/promises"

interface ReadRecord {
  mtimeMs: number
  size: number
}

const track = new Map<string, ReadRecord>()

export function recordRead(absPath: string, mtimeMs: number, size: number): void {
  track.set(absPath, { mtimeMs, size })
}

export function clearReadTracker(): void {
  track.clear()
}

export async function checkStale(absPath: string): Promise<{ isStale: boolean; message?: string }> {
  const record = track.get(absPath)
  if (!record) return { isStale: false }

  let st
  try {
    st = await stat(absPath)
  } catch {
    return { isStale: true, message: "File not found or inaccessible. It may have been deleted or moved." }
  }

  if (st.mtimeMs !== record.mtimeMs || st.size !== record.size) {
    return {
      isStale: true,
      message: `File has been modified since last read (mtime or size changed). Please re-read the file with read_file first.`,
    }
  }

  return { isStale: false }
}
