export async function getCache(key: string): Promise<string | undefined> {
  const stored = await chrome.storage.session.get(key)
  return stored[key] as string | undefined
}

export async function setCache(key: string, value: string): Promise<void> {
  await chrome.storage.session.set({ [key]: value })
}
