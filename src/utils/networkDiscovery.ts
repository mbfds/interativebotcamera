import { DiscoveredDevice, CameraConfig } from '../types/camera';
import { getAuthHeaders } from '../services/auth';

export interface LocalSubnetInfo {
  iface: string;
  ip: string;
  subnet: string;
}

export interface ScanNetworkOptions {
  subnet?: string;
  ports?: number[];
  existingCameras?: CameraConfig[];
}

export interface ScanNetworkResult {
  subnet: string;
  scannedCount: number;
  rtspVerifiedCount: number;
  durationMs: number;
  detectedLocalSubnets: LocalSubnetInfo[];
  message: string;
  devices: DiscoveredDevice[];
}

export async function fetchLocalNetworkSubnets(): Promise<LocalSubnetInfo[]> {
  try {
    const res = await fetch('/api/network/interfaces', {
      headers: getAuthHeaders(),
    });
    if (res.ok) {
      const data = await res.json();
      return data.subnets || [];
    }
  } catch {
    // Ignore when offline
  }
  return [];
}

function markExistingStatus(
  devices: DiscoveredDevice[],
  existingCameras: CameraConfig[]
): DiscoveredDevice[] {
  const existingIps = new Set(existingCameras.map((c) => c.ipHost).filter(Boolean));
  const existingDeviceIds = new Set(existingCameras.map((c) => c.deviceId).filter(Boolean));
  const existingNames = new Set(existingCameras.map((c) => c.name.toLowerCase()));

  return devices.map((device) => {
    const isAlreadyConnected =
      (device.ip && existingIps.has(device.ip)) ||
      (device.deviceId && existingDeviceIds.has(device.deviceId)) ||
      existingNames.has(device.name.toLowerCase());

    return {
      ...device,
      status: (isAlreadyConnected ? 'connected' : device.status || 'online') as
        | 'online'
        | 'connected'
        | 'needs_auth',
    };
  });
}

export async function scanLocalNetworkCameras(
  options: ScanNetworkOptions = {}
): Promise<ScanNetworkResult> {
  const { subnet = '192.168.1.0/24', ports, existingCameras = [] } = options;

  let networkDevices: DiscoveredDevice[] = [];
  let scannedCount = 254;
  let rtspVerifiedCount = 0;
  let durationMs = 0;
  let detectedLocalSubnets: LocalSubnetInfo[] = [];
  let message = '';

  // 1. Real TCP/RTSP/ONVIF network scan on server
  try {
    const response = await fetch('/api/network/scan-cameras', {
      method: 'POST',
      headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ subnet, ports }),
    });

    if (response.ok) {
      const data = await response.json();
      networkDevices = data.devices || [];
      scannedCount = data.scannedCount || 254;
      rtspVerifiedCount = data.rtspVerifiedCount || 0;
      durationMs = data.durationMs || 0;
      detectedLocalSubnets = data.detectedLocalSubnets || [];
      message = data.message || '';
    }
  } catch (err) {
    console.warn('Network scan API error, fallback to client-side hardware discovery:', err);
  }

  // 2. Discover local physical video hardware (Webcams, USB Capture)
  const localHardwareDevices: DiscoveredDevice[] = [];
  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === 'videoinput');

      videoInputs.forEach((dev, idx) => {
        const label = dev.label || `Câmera Local / USB #${idx + 1}`;
        const devId = dev.deviceId || `webcam-${idx}`;

        localHardwareDevices.push({
          id: `local-hw-${devId.slice(0, 10)}`,
          name: label,
          brand: 'webcam',
          brandLabel: 'Hardware Local / USB',
          model:
            label.includes('Integrated') || label.includes('FaceTime')
              ? 'Câmera Integrada HD'
              : 'Dispositivo de Captura de Vídeo USB',
          ip: '127.0.0.1 (Local USB)',
          port: 0,
          protocol: 'WEBCAM_USB',
          defaultUser: '-',
          defaultPass: '-',
          locationSuggestion: 'Terminal Local',
          rtspTemplate: `webcam://${devId}`,
          deviceId: devId,
          isLocalHardware: true,
          status: 'online',
          latencyMs: 1,
        });
      });
    }
  } catch (err) {
    console.warn('Could not enumerate local video hardware:', err);
  }

  // 3. Merge Local Hardware + Real Network Cameras
  const combined = [...localHardwareDevices, ...networkDevices];

  return {
    subnet,
    scannedCount,
    rtspVerifiedCount,
    durationMs,
    detectedLocalSubnets,
    message,
    devices: markExistingStatus(combined, existingCameras),
  };
}

export async function probeSingleCameraIp(
  ip: string,
  port: number = 554,
  existingCameras: CameraConfig[] = []
): Promise<{
  reachable: boolean;
  device: DiscoveredDevice | null;
  message: string;
}> {
  const response = await fetch('/api/network/probe-ip', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ ip, port }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Falha ao sondar IP.');
  }

  const device = data.device ? markExistingStatus([data.device], existingCameras)[0] : null;
  return {
    reachable: Boolean(data.reachable),
    device,
    message: data.message || '',
  };
}
