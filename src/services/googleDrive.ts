import { initializeApp } from 'firebase/app';
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  onAuthStateChanged,
  User,
  signOut,
} from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';
import { RecordingItem } from '../types/camera';

// The SCOPES configured for Google Drive integration
export const SCOPES = ['https://www.googleapis.com/auth/drive.file'];

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
SCOPES.forEach((scope) => provider.addScope(scope));

let isSigningIn = false;
let cachedAccessToken: string | null = null;
let cachedFolderId: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      cachedFolderId = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Falha ao obter token de acesso do Google.');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logoutGoogle = async () => {
  await signOut(auth);
  cachedAccessToken = null;
  cachedFolderId = null;
};

/**
 * Gets or creates the dedicated folder "Sentinela NVR - Gravações" on Google Drive
 */
export async function getOrCreateNVRFolder(accessToken: string): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  try {
    // Search for existing folder
    const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(
      "mimeType = 'application/vnd.google-apps.folder' and name = 'Sentinela NVR - Gravações' and trashed = false"
    )}&fields=files(id,name)`;

    const searchRes = await fetch(searchUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (searchRes.ok) {
      const data = await searchRes.json();
      if (data.files && data.files.length > 0 && data.files[0].id) {
        cachedFolderId = data.files[0].id;
        return data.files[0].id as string;
      }
    }

    // Create folder if not found
    const createRes = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Sentinela NVR - Gravações',
        mimeType: 'application/vnd.google-apps.folder',
        description: 'Pasta automatizada para armazenamento de gravações de segurança do Sentinela NVR',
      }),
    });

    if (!createRes.ok) {
      throw new Error('Falha ao criar pasta de gravações no Google Drive');
    }

    const folder = await createRes.json();
    cachedFolderId = folder.id;
    return folder.id;
  } catch (err) {
    console.error('Erro ao buscar/criar pasta no Google Drive:', err);
    throw err;
  }
}

/**
 * Uploads a video recording Blob directly to Google Drive via multipart upload
 */
export async function uploadRecordingToDrive(
  recording: RecordingItem,
  accessToken: string
): Promise<{ fileId: string; webViewLink: string }> {
  try {
    const folderId = await getOrCreateNVRFolder(accessToken);

    const safeDate = new Date(recording.timestamp).toISOString().replace(/[:.]/g, '-');
    const safeName = recording.cameraName.replace(/[^a-zA-Z0-9_\-]/g, '_');
    const filename = `gravacao_${safeName}_${safeDate}.webm`;

    const metadata = {
      name: filename,
      mimeType: recording.mimeType || 'video/webm',
      description: `Gravação de câmera de segurança: ${recording.cameraName} (${recording.cameraLocation}) - Disparo: ${recording.triggerType}`,
      parents: [folderId],
    };

    const boundary = '-------sentinela_nvr_boundary_' + Date.now();
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const metadataHeader = delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata);

    const mediaHeader = delimiter +
      `Content-Type: ${recording.mimeType || 'video/webm'}\r\n\r\n`;

    const metadataBlob = new Blob([metadataHeader], { type: 'text/plain' });
    const mediaHeaderBlob = new Blob([mediaHeader], { type: 'text/plain' });
    const closeBlob = new Blob([closeDelimiter], { type: 'text/plain' });

    const multipartBlob = new Blob([
      metadataBlob,
      mediaHeaderBlob,
      recording.blob,
      closeBlob,
    ]);

    const uploadRes = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBlob,
      }
    );

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      throw new Error(`Erro na API do Google Drive (${uploadRes.status}): ${errText}`);
    }

    const result = await uploadRes.json();
    return {
      fileId: result.id,
      webViewLink: result.webViewLink || `https://drive.google.com/file/d/${result.id}/view`,
    };
  } catch (err) {
    console.error('Falha no upload para o Google Drive:', err);
    throw err;
  }
}

/**
 * Deletes a recording file from Google Drive
 */
export async function deleteRecordingFromDrive(fileId: string, accessToken: string): Promise<void> {
  const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error('Falha ao excluir arquivo do Google Drive');
  }
}
