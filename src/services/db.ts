import { CameraConfig, RecordingItem, MotionEvent, ClientBusiness } from '../types/camera';

const DB_NAME = 'sentinela_nvr_db';
const DB_VERSION = 2;

const STORES = {
  BUSINESSES: 'businesses',
  CAMERAS: 'cameras',
  RECORDINGS: 'recordings',
  EVENTS: 'events',
} as const;

export const DEFAULT_UNIT_ID = 'unit-principal';

const LEGACY_DEMO_BUSINESS_IDS = new Set(['biz-demo-1', 'biz-demo-2']);
const LEGACY_DEMO_CAMERA_IDS = new Set(['cam-intelbras-1', 'cam-tapo-2']);

function isLegacyDemoCamera(c: CameraConfig): boolean {
  return (
    LEGACY_DEMO_CAMERA_IDS.has(c.id) ||
    c.id.startsWith('net-disc-') ||
    (c.type as string) === 'simulated' ||
    (c.ipHost === '192.168.1.108' && c.name.includes('Intelbras Mibo iMX')) ||
    (c.ipHost === '192.168.1.120' && c.name.includes('TP-Link Tapo C200'))
  );
}

function isLegacyDemoRecording(r: RecordingItem): boolean {
  return (
    r.id.startsWith('rec-demo-') ||
    LEGACY_DEMO_CAMERA_IDS.has(r.cameraId) ||
    LEGACY_DEMO_BUSINESS_IDS.has(r.tenantId)
  );
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains(STORES.BUSINESSES)) {
        db.createObjectStore(STORES.BUSINESSES, { keyPath: 'id' });
      }

      if (!db.objectStoreNames.contains(STORES.CAMERAS)) {
        const camStore = db.createObjectStore(STORES.CAMERAS, { keyPath: 'id' });
        camStore.createIndex('tenantId', 'tenantId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.RECORDINGS)) {
        const recStore = db.createObjectStore(STORES.RECORDINGS, { keyPath: 'id' });
        recStore.createIndex('timestamp', 'timestamp', { unique: false });
        recStore.createIndex('cameraId', 'cameraId', { unique: false });
        recStore.createIndex('tenantId', 'tenantId', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.EVENTS)) {
        const evStore = db.createObjectStore(STORES.EVENTS, { keyPath: 'id' });
        evStore.createIndex('timestamp', 'timestamp', { unique: false });
        evStore.createIndex('tenantId', 'tenantId', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Silently purge any legacy demo data from IndexedDB on load
export async function purgeAllLegacyDemoData(): Promise<void> {
  const db = await openDB();
  await Promise.all([
    new Promise<void>((resolve) => {
      const tx = db.transaction(STORES.BUSINESSES, 'readwrite');
      const store = tx.objectStore(STORES.BUSINESSES);
      LEGACY_DEMO_BUSINESS_IDS.forEach((id) => store.delete(id));
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    }),
    new Promise<void>((resolve) => {
      const tx = db.transaction(STORES.CAMERAS, 'readwrite');
      const store = tx.objectStore(STORES.CAMERAS);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as CameraConfig[]) || [];
        all.filter(isLegacyDemoCamera).forEach((c) => store.delete(c.id));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    }),
    new Promise<void>((resolve) => {
      const tx = db.transaction(STORES.RECORDINGS, 'readwrite');
      const store = tx.objectStore(STORES.RECORDINGS);
      const req = store.getAll();
      req.onsuccess = () => {
        const all = (req.result as RecordingItem[]) || [];
        all.filter(isLegacyDemoRecording).forEach((r) => store.delete(r.id));
      };
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    }),
  ]);
}

// Units / Locations (Multi-environment isolation, zero demo seeds)
export async function getStoredBusinesses(): Promise<ClientBusiness[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUSINESSES, 'readonly');
    const store = tx.objectStore(STORES.BUSINESSES);
    const request = store.getAll();

    request.onsuccess = () => {
      const all = (request.result as ClientBusiness[]) || [];
      const clean = all.filter((b) => !LEGACY_DEMO_BUSINESS_IDS.has(b.id));

      if (clean.length !== all.length) {
        const writeTx = db.transaction(STORES.BUSINESSES, 'readwrite');
        const writeStore = writeTx.objectStore(STORES.BUSINESSES);
        LEGACY_DEMO_BUSINESS_IDS.forEach((id) => writeStore.delete(id));
      }

      resolve(clean);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveBusinessToDB(business: ClientBusiness): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUSINESSES, 'readwrite');
    const store = tx.objectStore(STORES.BUSINESSES);
    const request = store.put(business);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteBusinessFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUSINESSES, 'readwrite');
    const store = tx.objectStore(STORES.BUSINESSES);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Camera Operations (Filtered by unit/tenantId, zero fake/simulated cameras)
export async function getStoredCameras(tenantId?: string): Promise<CameraConfig[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CAMERAS, 'readonly');
    const store = tx.objectStore(STORES.CAMERAS);
    const request = store.getAll();

    request.onsuccess = () => {
      let cameras = (request.result as CameraConfig[]) || [];
      const realOnly = cameras.filter((c) => !isLegacyDemoCamera(c));

      if (realOnly.length !== cameras.length) {
        const writeTx = db.transaction(STORES.CAMERAS, 'readwrite');
        const writeStore = writeTx.objectStore(STORES.CAMERAS);
        cameras.forEach((c) => {
          if (isLegacyDemoCamera(c)) {
            writeStore.delete(c.id);
          }
        });
        cameras = realOnly;
      }

      if (tenantId) {
        cameras = cameras.filter((c) => !c.tenantId || c.tenantId === tenantId);
      }
      resolve(cameras);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveCameraToDB(camera: CameraConfig): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CAMERAS, 'readwrite');
    const store = tx.objectStore(STORES.CAMERAS);
    const request = store.put(camera);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteCameraFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CAMERAS, 'readwrite');
    const store = tx.objectStore(STORES.CAMERAS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Recording Operations (Filtered by tenantId, zero seeded/demo recordings)
export async function getStoredRecordings(tenantId?: string): Promise<RecordingItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECORDINGS, 'readonly');
    const store = tx.objectStore(STORES.RECORDINGS);
    const request = store.getAll();

    request.onsuccess = () => {
      let recordings = (request.result as RecordingItem[]) || [];
      const realOnly = recordings.filter((r) => !isLegacyDemoRecording(r));

      if (realOnly.length !== recordings.length) {
        const writeTx = db.transaction(STORES.RECORDINGS, 'readwrite');
        const writeStore = writeTx.objectStore(STORES.RECORDINGS);
        recordings.forEach((r) => {
          if (isLegacyDemoRecording(r)) {
            writeStore.delete(r.id);
          }
        });
        recordings = realOnly;
      }

      if (tenantId) {
        recordings = recordings.filter((r) => !r.tenantId || r.tenantId === tenantId);
      }
      recordings.sort((a, b) => b.timestamp - a.timestamp);
      resolve(recordings);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveRecordingToDB(recording: RecordingItem): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORES.RECORDINGS);
    const request = store.put(recording);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function deleteRecordingFromDB(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORES.RECORDINGS);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllRecordingsFromDB(tenantId?: string): Promise<void> {
  const db = await openDB();
  const all = await getStoredRecordings();
  const toDelete = tenantId ? all.filter((r) => !r.tenantId || r.tenantId === tenantId) : all;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECORDINGS, 'readwrite');
    const store = tx.objectStore(STORES.RECORDINGS);
    toDelete.forEach((r) => store.delete(r.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Event Operations (Filtered by tenant)
export async function getStoredEvents(tenantId?: string): Promise<MotionEvent[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.EVENTS, 'readonly');
    const store = tx.objectStore(STORES.EVENTS);
    const request = store.getAll();

    request.onsuccess = () => {
      let events = (request.result as MotionEvent[]) || [];
      events = events.filter((e) => !LEGACY_DEMO_BUSINESS_IDS.has(e.tenantId));
      if (tenantId) {
        events = events.filter((e) => !e.tenantId || e.tenantId === tenantId);
      }
      events.sort((a, b) => b.timestamp - a.timestamp);
      resolve(events.slice(0, 50));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function saveEventToDB(event: MotionEvent): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.EVENTS, 'readwrite');
    const store = tx.objectStore(STORES.EVENTS);
    const request = store.put(event);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllEventsFromDB(tenantId?: string): Promise<void> {
  const db = await openDB();
  const all = await getStoredEvents();
  const toDelete = tenantId ? all.filter((e) => !e.tenantId || e.tenantId === tenantId) : all;

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.EVENTS, 'readwrite');
    const store = tx.objectStore(STORES.EVENTS);
    toDelete.forEach((e) => store.delete(e.id));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Storage Stats (per tenant)
export async function getStorageStats(tenantId?: string): Promise<{
  recordingCount: number;
  totalBytes: number;
  quotaBytes?: number;
  usageBytes?: number;
}> {
  const recordings = await getStoredRecordings(tenantId);
  const totalBytes = recordings.reduce((acc, curr) => acc + (curr.fileSizeBytes || curr.blob?.size || 0), 0);

  let quotaBytes: number | undefined;
  let usageBytes: number | undefined;

  if (navigator.storage && navigator.storage.estimate) {
    try {
      const estimate = await navigator.storage.estimate();
      quotaBytes = estimate.quota;
      usageBytes = estimate.usage;
    } catch {
      // Ignore
    }
  }

  return {
    recordingCount: recordings.length,
    totalBytes,
    quotaBytes,
    usageBytes,
  };
}
