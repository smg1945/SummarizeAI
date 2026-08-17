// 요약/챕터/채팅 캐시. storage.local에 저장해 브라우저를 재시작해도 유지되며,
// 오래된 항목은 자동으로 정리한다.

export const CACHE_MAX_ENTRIES = 200
const CACHE_PREFIXES = ['summary:', 'chapters:', 'chat:']

interface CacheEntry {
  t: number // 저장 시각 (정리 순서 판단용)
  v: string
}

function isCacheEntry(key: string, value: unknown): value is CacheEntry {
  return (
    CACHE_PREFIXES.some((p) => key.startsWith(p)) &&
    typeof (value as CacheEntry)?.t === 'number' &&
    typeof (value as CacheEntry)?.v === 'string'
  )
}

export async function getCache(key: string): Promise<string | undefined> {
  const stored = await chrome.storage.local.get(key)
  const entry = stored[key] as CacheEntry | undefined
  return typeof entry?.v === 'string' ? entry.v : undefined
}

export async function setCache(key: string, value: string): Promise<void> {
  const entry: CacheEntry = { t: Date.now(), v: value }
  await chrome.storage.local.set({ [key]: entry })
  await pruneCache()
}

async function pruneCache(): Promise<void> {
  const all = await chrome.storage.local.get(null)
  const entries = Object.entries(all).filter(([k, v]) => isCacheEntry(k, v)) as [string, CacheEntry][]
  if (entries.length <= CACHE_MAX_ENTRIES) return
  const oldestFirst = entries.sort((a, b) => a[1].t - b[1].t)
  const removeKeys = oldestFirst.slice(0, entries.length - CACHE_MAX_ENTRIES).map(([k]) => k)
  await chrome.storage.local.remove(removeKeys)
}
