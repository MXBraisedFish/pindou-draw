const assetUrls = import.meta.glob<string>('@/assets/**/*.{json,png,gif,ttf}', {
  eager: true,
  query: '?url',
  import: 'default',
})

const preloadedJson = new Map<string, unknown>()

async function requestAsset(url: string): Promise<void> {
  const response = await fetch(url, { cache: 'force-cache' })
  if (!response.ok) throw new Error(`资源加载失败：${url}`)
  if (new URL(url, window.location.href).pathname.endsWith('.json')) {
    preloadedJson.set(url, await response.json())
  } else {
    await response.arrayBuffer()
  }
}

export function getPreloadedJson(url: string): unknown | undefined {
  return preloadedJson.get(url)
}

export async function preloadApplicationAssets(): Promise<void> {
  const results = await Promise.allSettled(Object.values(assetUrls).map((url) => requestAsset(url)))

  const failed = results.filter((result) => result.status === 'rejected')
  if (failed.length > 0) {
    console.warn(`有 ${failed.length} 个资源未能预加载，将在使用时重试。`)
  }
}
