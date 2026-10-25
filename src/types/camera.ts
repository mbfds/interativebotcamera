import { CameraBrand } from '../utils/commercialCameras';

export type CameraSourceType = 'webcam' | 'ip_stream' | 'commercial_ip' | 'simulated';

export type SimulationPreset = 'entrance' | 'parking' | 'hallway' | 'perimeter';

export type CloudStorageDestination = 'local' | 'google_drive';

export type UserRole = 'admin' | 'operador';

export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedBusinessId?: string;
}

export interface ClientBusiness {
  id: string;
  name: string;
  ownerEmail: string;
  businessType: 'retail' | 'food' | 'pharmacy' | 'warehouse' | 'office' | 'general';
  address: string;
  driveFolderId?: string;
  dateCreated: number;
}

export interface CameraConfig {
  id: string;
  tenantId: string; // Business/Customer Isolation ID
  name: string;
  location: string;
  type: CameraSourceType;
  brand?: CameraBrand;
  ipHost?: string;
  ipPort?: number;
  ipUser?: string;
  ipPass?: string;
  ipChannel?: number;
  deviceId?: string; // For real webcam
  streamUrl?: string; // For HLS / MJPEG / MP4 stream
  simulationPreset?: SimulationPreset;
  resolution?: '1080p' | '720p' | '480p';
  fps?: number;
  enableAudio: boolean;
  soundAlarmEnabled?: boolean; // Configurable per-camera sound alert
  aiThreatAlertEnabled?: boolean; // Activate alarm on high AI threat
  nightVision: boolean;
  motionDetectionEnabled: boolean;
  motionSensitivity: number; // 1 to 100
  autoRecordOnMotion: boolean;
  autoRecordDuration: number; // seconds
  digitalZoom: number; // 1.0 to 3.0
  pan: number; // -50 to 50
  tilt: number; // -50 to 50
  dateAdded: number;
}

export interface RecordingItem {
  id: string;
  tenantId: string; // Business/Customer Isolation ID
  cameraId: string;
  cameraName: string;
  cameraLocation: string;
  timestamp: number;
  durationSeconds: number;
  fileSizeBytes: number;
  triggerType: 'manual' | 'motion' | 'continuous';
  blob: Blob;
  thumbnailDataUrl: string;
  notes?: string;
  mimeType: string;
  driveFileId?: string;
  driveViewLink?: string;
  syncStatus?: 'local' | 'syncing' | 'synced' | 'failed';
  aiAnalysisSummary?: string;
  isCritical?: boolean;
  aiThreatLevel?: 'baixo' | 'medio' | 'alto';
  aiThreatScore?: number;
  aiThreatReason?: string;
}

export interface MotionEvent {
  id: string;
  tenantId: string; // Business/Customer Isolation ID
  cameraId: string;
  cameraName: string;
  timestamp: number;
  intensity: number; // 0 to 100
  recordingId?: string;
  snapshotUrl?: string;
}

export interface AISecurityAnalysis {
  threatLevel: 'baixo' | 'medio' | 'alto';
  threatScore: number;
  summary: string;
  detectedElements: string[];
  securityConcerns: string[];
  recommendations: string[];
  occupancyEstimate: number;
  timestamp: number;
  cameraName: string;
}

export interface AIDailyReport {
  reportTitle: string;
  executiveSummary: string;
  busiestHour: string;
  securityScore: number;
  keyHighlights: string[];
  actionItems: string[];
}

export type GridViewMode = '1x1' | '2x2' | '3x3' | 'list';

export interface DiscoveredDevice {
  id: string;
  name: string;
  brand: CameraBrand | 'webcam' | 'generic_onvif';
  brandLabel: string;
  model: string;
  ip: string;
  port: number;
  macAddress?: string;
  protocol: 'ONVIF' | 'RTSP' | 'WEBCAM_USB';
  defaultUser: string;
  defaultPass: string;
  locationSuggestion: string;
  rtspTemplate: string;
  simulationPreset?: SimulationPreset;
  deviceId?: string; // For physical hardware webcams
  isLocalHardware?: boolean;
  status: 'online' | 'needs_auth' | 'connected';
  latencyMs?: number;
}

export interface CameraStreamTelemetry {
  cameraId: string;
  cameraName: string;
  location: string;
  latencyMs: number;
  cpuPercent: number;
  ramMb: number;
  bitrateKbps: number;
  fps: number;
  targetFps: number;
  packetLossPercent: number;
  jitterMs: number;
  status: 'optimal' | 'moderate' | 'bottleneck';
  bottleneckType: 'none' | 'network_latency' | 'cpu_overload' | 'memory_pressure' | 'packet_loss';
  bottleneckMessage?: string;
  pingHistory: number[];
  lastUpdated: number;
}

export interface SystemBottleneckAlert {
  id: string;
  cameraId: string;
  cameraName: string;
  severity: 'warning' | 'critical';
  title: string;
  description: string;
  metric: 'latency' | 'cpu' | 'ram' | 'packets';
  value: string;
  recommendation: string;
  timestamp: number;
}

