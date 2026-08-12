export type ProjectSlot = 'auto' | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9

export interface StoredProject {
  slot: ProjectSlot
  name: string
  savedAt: string
  projectType: 'single' | 'group'
  summary: string
  preview: string
  data: string
}

const DATABASE_NAME = 'pindou-draw-projects'
const DATABASE_VERSION = 1
const STORE_NAME = 'projects'

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      const database = request.result
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'slot' })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('无法打开浏览器工程存储。'))
  })
}

async function runRequest<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const database = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode)
    const request = action(transaction.objectStore(STORE_NAME))
    let result: T
    request.onsuccess = () => {
      result = request.result
    }
    request.onerror = () => reject(request.error ?? new Error('浏览器工程存储操作失败。'))
    transaction.oncomplete = () => {
      database.close()
      resolve(result)
    }
    transaction.onerror = () => {
      database.close()
      reject(transaction.error ?? new Error('浏览器工程存储事务失败。'))
    }
  })
}

export function saveStoredProject(project: StoredProject) {
  return runRequest('readwrite', (store) => store.put(project))
}

export function deleteStoredProject(slot: Exclude<ProjectSlot, 'auto'>) {
  return runRequest('readwrite', (store) => store.delete(slot))
}

export function getStoredProject(slot: ProjectSlot): Promise<StoredProject | undefined> {
  return runRequest('readonly', (store) => store.get(slot))
}

export async function listStoredProjects(): Promise<StoredProject[]> {
  const records = await runRequest<StoredProject[]>('readonly', (store) => store.getAll())
  return records.sort((a, b) => {
    if (a.slot === 'auto') return -1
    if (b.slot === 'auto') return 1
    return Number(a.slot) - Number(b.slot)
  })
}
