import { DiscoveredDevice, CameraConfig } from '../types/camera';

export interface ScanNetworkOptions {
  subnet?: string;
  existingCameras?: CameraConfig[];
}

export async function scanLocalNetworkCameras(
  options: ScanNetworkOptions = {}
): Promise<{
  subnet: string;
  scannedCount: number;
  devices: DiscoveredDevice[];
}> {
  const { subnet = '192.168.1.0/24', existingCameras = [] } = options;

  let networkDevices: DiscoveredDevice[] = [];
  let scannedCount = 254;

  // 1. Fetch Network ONVIF/RTSP discovered devices from server
  try {
    const response = await fetch('/api/network/scan-cameras', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subnet }),
    });

    if (response.ok) {
      const data = await response.json();
      networkDevices = data.devices || [];
      scannedCount = data.scannedCount || 254;
    }
  } catch (err) {
    console.warn('Network scan API error, fallback to client-side discovery:', err);
  }

  // 2. Discover local physical video hardware (Webcams, USB Capture, Virtual Cams)
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
          model: label.includes('Integrated') || label.includes('FaceTime')
            ? 'Câmera Integrada HD'
            : 'Dispositivo de Captura de Vídeo USB',
          ip: '127.0.0.1 (Local USB)',
          port: 0,
          protocol: 'WEBCAM_USB',
          defaultUser: '-',
          defaultPass: '-',
          locationSuggestion: 'Terminal Caixa / Balcão',
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

  // 3. Merge Local Hardware + Network Cameras
  const combined = [...localHardwareDevices, ...networkDevices];

  // 4. Mark devices that are already registered in the user's business
  const existingIps = new Set(existingCameras.map((c) => c.ipHost).filter(Boolean));
  const existingDeviceIds = new Set(existingCameras.map((c) => c.deviceId).filter(Boolean));
  const existingNames = new Set(existingCameras.map((c) => c.name.toLowerCase()));

  const updatedDevices = combined.map((device) => {
    const isAlreadyConnected =
      (device.ip && existingIps.has(device.ip)) ||
      (device.deviceId && existingDeviceIds.has(device.deviceId)) ||
      existingNames.has(device.name.toLowerCase());

    return {
      ...device,
      status: (isAlreadyConnected ? 'connected' : 'online') as 'online' | 'connected' | 'needs_auth',
    };
  });

  return {
    subnet,
    scannedCount,
    devices: updatedDevices,
  };
}
