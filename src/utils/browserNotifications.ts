/**
 * Browser Web Notifications API Utility for Sentinela NVR
 * Dispatches operating system level notifications even when the browser tab is in background / minimized
 */

export function isBrowserNotificationSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isBrowserNotificationSupported()) return 'unsupported';
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (!isBrowserNotificationSupported()) {
    return 'unsupported';
  }

  try {
    const permission = await Notification.requestPermission();
    return permission;
  } catch (err) {
    console.error('Error requesting browser notification permission:', err);
    return Notification.permission;
  }
}

export interface HighThreatNotificationPayload {
  cameraName: string;
  threatScore: number;
  reason?: string;
  location?: string;
  timestamp?: number;
  businessName?: string;
}

/**
 * Dispatches a native browser notification when AI detects a HIGH threat level ('alto')
 */
export function sendHighThreatBrowserNotification(payload: HighThreatNotificationPayload): boolean {
  if (!isBrowserNotificationSupported()) {
    console.warn('Browser notifications not supported in this client environment.');
    return false;
  }

  if (Notification.permission !== 'granted') {
    console.warn('Notification permission not granted by user.');
    return false;
  }

  const { cameraName, threatScore, reason, location, businessName } = payload;
  const title = `🚨 ALERTA CRÍTICO IA: ${cameraName}`;
  const bodyText = `Ameaça ALTA detectada (${threatScore}%)${location ? ` em ${location}` : ''}${businessName ? ` (${businessName})` : ''}.\nMotivo: ${reason || 'Intrusão ou risco imediato detectado no estabelecimento'}`;

  // CCTV Shield SVG as inline Data URL icon
  const iconSvg = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="%23dc2626" stroke="%23ffffff" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`;

  try {
    const notification = new Notification(title, {
      body: bodyText,
      icon: iconSvg,
      badge: iconSvg,
      tag: `ai-threat-${cameraName}-${Date.now()}`,
      requireInteraction: true, // Keep notification active until user clicks
      silent: false,
    });

    notification.onclick = () => {
      // Bring tab to front
      window.focus();
      notification.close();
    };

    // If vibration API is supported (mobile/PWA), vibrate SOS pattern
    if ('vibrate' in navigator) {
      navigator.vibrate([300, 150, 300, 150, 300]);
    }

    return true;
  } catch (err) {
    console.error('Failed to dispatch browser notification:', err);
    return false;
  }
}
