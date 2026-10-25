import { CameraConfig, RecordingItem, MotionEvent, ClientBusiness } from '../types/camera';

const DB_NAME = 'sentinela_nvr_db';
const DB_VERSION = 2; // Incremented for businesses support

const STORES = {
  BUSINESSES: 'businesses',
  CAMERAS: 'cameras',
  RECORDINGS: 'recordings',
  EVENTS: 'events',
} as const;

export const DEFAULT_BUSINESS_ID = 'biz-demo-1';

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

// Businesses (Multi-tenant)
export async function getStoredBusinesses(): Promise<ClientBusiness[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.BUSINESSES, 'readonly');
    const store = tx.objectStore(STORES.BUSINESSES);
    const request = store.getAll();

    request.onsuccess = () => {
      let businesses = request.result as ClientBusiness[];
      if (!businesses || businesses.length === 0) {
        const defaultBusinesses: ClientBusiness[] = [
          {
            id: DEFAULT_BUSINESS_ID,
            name: 'Mercado & Mercearia Central',
            ownerEmail: 'cebolao1302@gmail.com',
            businessType: 'retail',
            address: 'Av. Principal, 120 - Centro',
            dateCreated: Date.now() - 86400000,
          },
          {
            id: 'biz-demo-2',
            name: 'Farmácia São José (Filial 2)',
            ownerEmail: 'farmacia.saojose@gmail.com',
            businessType: 'pharmacy',
            address: 'Rua do Comércio, 450',
            dateCreated: Date.now() - 43200000,
          },
        ];

        const writeTx = db.transaction(STORES.BUSINESSES, 'readwrite');
        const writeStore = writeTx.objectStore(STORES.BUSINESSES);
        defaultBusinesses.forEach((b) => writeStore.put(b));
        businesses = defaultBusinesses;
      }
      resolve(businesses);
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

// Camera Operations (Filtered by tenant)
export async function getStoredCameras(tenantId?: string): Promise<CameraConfig[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CAMERAS, 'readonly');
    const store = tx.objectStore(STORES.CAMERAS);
    const request = store.getAll();

    request.onsuccess = () => {
      let cameras = (request.result as CameraConfig[]) || [];
      
      // Filter out any legacy demonstrative/mock cameras that are not real
      const realOnly = cameras.filter((c) => {
        const isLegacyDemo =
          c.id === 'cam-intelbras-1' ||
          c.id === 'cam-tapo-2' ||
          c.id.startsWith('net-disc-') ||
          (c.ipHost === '192.168.1.108' && c.name.includes('Intelbras Mibo iMX')) ||
          (c.ipHost === '192.168.1.120' && c.name.includes('TP-Link Tapo C200'));
        return !isLegacyDemo;
      });

      // If legacy demo cameras were present in DB, purge them in background
      if (realOnly.length !== cameras.length) {
        const writeTx = db.transaction(STORES.CAMERAS, 'readwrite');
        const writeStore = writeTx.objectStore(STORES.CAMERAS);
        cameras.forEach((c) => {
          if (!realOnly.find((r) => r.id === c.id)) {
            writeStore.delete(c.id);
          }
        });
        cameras = realOnly;
      }

      // Filter by tenantId if provided
      if (tenantId) {
        cameras = cameras.filter((c) => !c.tenantId || c.tenantId === tenantId);
      }
      resolve(cameras);
    };
    request.onerror = () => reject(request.error);
  });
}

// Purge any demonstrative cameras manually
export async function purgeDemonstrativeCameras(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CAMERAS, 'readwrite');
    const store = tx.objectStore(STORES.CAMERAS);
    const getAllReq = store.getAll();

    getAllReq.onsuccess = () => {
      const allCams = (getAllReq.result as CameraConfig[]) || [];
      allCams.forEach((c) => {
        const isDemo =
          c.id === 'cam-intelbras-1' ||
          c.id === 'cam-tapo-2' ||
          c.id.startsWith('net-disc-') ||
          (c.ipHost === '192.168.1.108' && c.name.includes('Intelbras Mibo iMX')) ||
          (c.ipHost === '192.168.1.120' && c.name.includes('TP-Link Tapo C200'));
        if (isDemo) {
          store.delete(c.id);
        }
      });
      resolve();
    };
    getAllReq.onerror = () => reject(getAllReq.error);
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

function createCCTVThumbnailSvg(camName: string, isAlert: boolean, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360">
    <rect width="640" height="360" fill="#0b0f17" />
    <defs>
      <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
        <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#172033" stroke-width="0.8"/>
      </pattern>
    </defs>
    <rect width="640" height="360" fill="url(#grid)" />
    <line x1="0" y1="50" x2="640" y2="50" stroke="#1e293b" stroke-width="1" opacity="0.6"/>
    <line x1="0" y1="310" x2="640" y2="310" stroke="#1e293b" stroke-width="1" opacity="0.6"/>
    ${
      isAlert
        ? `
      <rect x="180" y="70" width="280" height="200" fill="rgba(239, 68, 68, 0.16)" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="8,4" />
      <rect x="180" y="44" width="280" height="26" fill="#b91c1c" />
      <text x="320" y="62" font-family="monospace" font-size="12" font-weight="bold" fill="#ffffff" text-anchor="middle">🚨 ALERTA CRÍTICO IA (94%)</text>
      <circle cx="210" cy="140" r="22" fill="none" stroke="#ef4444" stroke-width="2" />
      <line x1="210" y1="162" x2="210" y2="230" stroke="#ef4444" stroke-width="2.5" />
      <line x1="180" y1="185" x2="240" y2="185" stroke="#ef4444" stroke-width="2" />
      <text x="320" y="180" font-family="monospace" font-size="13" font-weight="bold" fill="#fca5a5" text-anchor="middle">${label}</text>
      <text x="320" y="202" font-family="monospace" font-size="10" fill="#fecaca" text-anchor="middle">SUSPEITA DE INVASÃO / CAIXA</text>
    `
        : `
      <rect x="190" y="80" width="260" height="190" fill="rgba(59, 130, 246, 0.08)" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="5,4" />
      <text x="320" y="175" font-family="monospace" font-size="12" font-weight="bold" fill="#93c5fd" text-anchor="middle">${label}</text>
      <text x="320" y="195" font-family="monospace" font-size="10" fill="#60a5fa" text-anchor="middle">ATIVIDADE REGISTRADA COM SUCESSO</text>
    `
    }
    <circle cx="22" cy="27" r="5" fill="${isAlert ? '#ef4444' : '#22c55e'}" />
    <text x="34" y="31" font-family="monospace" font-size="13" fill="${isAlert ? '#ef4444' : '#22c55e'}" font-weight="bold">REC · ${isAlert ? 'AMEAÇA IA' : 'MONITOR'}</text>
    <text x="210" y="31" font-family="monospace" font-size="12" fill="#94a3b8">${camName}</text>
    <text x="25" y="336" font-family="monospace" font-size="11" fill="#64748b">SENTINELA NVR · VIGILÂNCIA INTELIGENTE IA</text>
  </svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// Recording Operations (Filtered by tenant)
export async function getStoredRecordings(tenantId?: string): Promise<RecordingItem[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.RECORDINGS, 'readonly');
    const store = tx.objectStore(STORES.RECORDINGS);
    const request = store.getAll();

    request.onsuccess = () => {
      let recordings = (request.result as RecordingItem[]) || [];

      if (recordings.length === 0) {
        // Seed default recordings (one critical AI detection and normal ones)
        const dummyBlob = new Blob(['sample-sentinela-footage'], { type: 'video/webm' });
        const defaultRecordings: RecordingItem[] = [
          {
            id: 'rec-demo-critical-1',
            tenantId: DEFAULT_BUSINESS_ID,
            cameraId: 'cam-intelbras-1',
            cameraName: 'Intelbras Mibo iMX - Entrada & Caixa',
            cameraLocation: 'Frente de Loja / Caixa',
            timestamp: Date.now() - 15 * 60 * 1000,
            durationSeconds: 24,
            fileSizeBytes: 1420500,
            triggerType: 'motion',
            blob: dummyBlob,
            thumbnailDataUrl: createCCTVThumbnailSvg('Intelbras Entrada & Caixa', true, 'INTRUSÃO DETECTADA NO CAIXA'),
            mimeType: 'video/webm',
            isCritical: true,
            aiThreatLevel: 'alto',
            aiThreatScore: 94,
            aiThreatReason: 'Intrusão confirmada no caixa fora do horário comercial',
            aiAnalysisSummary: 'Alerta Crítico IA: Movimentação não autorizada próxima ao caixa registrador às 02:45. Indivíduo não identificado manipulando gaveta.',
          },
          {
            id: 'rec-demo-motion-2',
            tenantId: DEFAULT_BUSINESS_ID,
            cameraId: 'cam-tapo-2',
            cameraName: 'TP-Link Tapo C200 - Corredor & Estoque',
            cameraLocation: 'Corredor de Produtos',
            timestamp: Date.now() - 2 * 3600 * 1000,
            durationSeconds: 15,
            fileSizeBytes: 890400,
            triggerType: 'motion',
            blob: dummyBlob,
            thumbnailDataUrl: createCCTVThumbnailSvg('TP-Link Corredor', false, 'MOVIMENTAÇÃO DE ROTINA'),
            mimeType: 'video/webm',
            isCritical: false,
            aiThreatLevel: 'baixo',
            aiThreatScore: 16,
            aiThreatReason: 'Fluxo rotineiro de reposição de mercadorias',
            aiAnalysisSummary: 'Atividade normal no corredor. Sem riscos ou ameaças detectadas.',
          },
          {
            id: 'rec-demo-manual-3',
            tenantId: DEFAULT_BUSINESS_ID,
            cameraId: 'cam-intelbras-1',
            cameraName: 'Intelbras Mibo iMX - Entrada & Caixa',
            cameraLocation: 'Frente de Loja / Caixa',
            timestamp: Date.now() - 6 * 3600 * 1000,
            durationSeconds: 32,
            fileSizeBytes: 1850000,
            triggerType: 'manual',
            blob: dummyBlob,
            thumbnailDataUrl: createCCTVThumbnailSvg('Intelbras Entrada & Caixa', false, 'GRAVAÇÃO MANUAL SUPERVISÃO'),
            mimeType: 'video/webm',
            isCritical: false,
          },
        ];

        const writeTx = db.transaction(STORES.RECORDINGS, 'readwrite');
        const writeStore = writeTx.objectStore(STORES.RECORDINGS);
        defaultRecordings.forEach((r) => writeStore.put(r));
        recordings = defaultRecordings;
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
