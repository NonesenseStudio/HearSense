export type OfflineEventType = "intake" | "review";

export interface OfflineEvent {
  id: string;
  type: OfflineEventType;
  endpoint: "/api/intake" | "/api/review/events";
  payload: Record<string, unknown>;
  createdAt: string;
  lastError: string | null;
}

const DB_NAME = "hearsense-offline-v1";
const STORE_NAME = "events";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME))
        request.result.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readAll(): Promise<OfflineEvent[]> {
  const database = await openDatabase();
  return await new Promise((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readonly")
      .objectStore(STORE_NAME)
      .getAll();
    request.onsuccess = () =>
      resolve(
        (request.result as OfflineEvent[]).sort((a, b) =>
          a.createdAt.localeCompare(b.createdAt),
        ),
      );
    request.onerror = () => reject(request.error);
  });
}

async function put(item: OfflineEvent): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .put(item);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function remove(id: string): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = database
      .transaction(STORE_NAME, "readwrite")
      .objectStore(STORE_NAME)
      .delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export function useOfflineQueue() {
  const online = useState("network-online", () => true);
  const queue = useState<OfflineEvent[]>("offline-event-queue", () => []);
  const syncing = useState("offline-event-syncing", () => false);
  const lastSyncAt = useState<string | null>("offline-last-sync", () => null);
  const initialized = useState("offline-queue-initialized", () => false);

  async function initialize() {
    if (!import.meta.client) return;
    online.value = navigator.onLine;
    if (!initialized.value) {
      try {
        queue.value = await readAll();
      } finally {
        initialized.value = true;
      }
    }
  }

  async function enqueue(
    type: OfflineEventType,
    endpoint: OfflineEvent["endpoint"],
    payload: Record<string, unknown>,
  ) {
    const id =
      typeof payload.clientEventId === "string"
        ? payload.clientEventId
        : crypto.randomUUID();
    const item: OfflineEvent = {
      id,
      type,
      endpoint,
      payload: { ...payload, clientEventId: id },
      createdAt: new Date().toISOString(),
      lastError: null,
    };
    await put(item);
    queue.value = [
      ...queue.value.filter((entry) => entry.id !== id),
      item,
    ].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    return item;
  }

  async function flush() {
    if (
      !import.meta.client ||
      !navigator.onLine ||
      syncing.value ||
      queue.value.length === 0
    )
      return;
    syncing.value = true;
    try {
      for (const item of [...queue.value]) {
        try {
          await $fetch(item.endpoint, {
            method: "POST",
            body: item.payload,
            headers: { "x-hearsense-offline-event": "1" },
          });
          await remove(item.id);
          queue.value = queue.value.filter((entry) => entry.id !== item.id);
          lastSyncAt.value = new Date().toISOString();
        } catch (cause) {
          const message = cause instanceof Error ? cause.message : "同步失败";
          const failed = { ...item, lastError: message };
          await put(failed);
          queue.value = queue.value.map((entry) =>
            entry.id === item.id ? failed : entry,
          );
          break;
        }
      }
    } finally {
      syncing.value = false;
    }
  }

  const status = computed(() => {
    if (!online.value)
      return {
        label: queue.value.length
          ? `离线 · ${queue.value.length} 条待同步`
          : "离线 · 只读缓存",
        kind: "offline" as const,
      };
    if (syncing.value) return { label: "同步中…", kind: "syncing" as const };
    if (queue.value.length)
      return {
        label: `${queue.value.length} 条待同步`,
        kind: "pending" as const,
      };
    return { label: "已同步", kind: "synced" as const };
  });

  onMounted(initialize);
  return {
    online,
    queue,
    syncing,
    lastSyncAt,
    status,
    initialize,
    enqueue,
    flush,
  };
}
