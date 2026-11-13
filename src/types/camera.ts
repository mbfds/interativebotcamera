import { CameraBrand } from '../utils/commercialCameras';

export type CameraSourceType = 'webcam' | 'ip_stream' | 'commercial_ip';

export type CloudStorageDestination = 'local' | 'google_drive';

export type UserRole = 'admin' | 'operador';

export interface AuthUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  active: boolean;
  createdAt: number;
  lastLoginAt?: number;
}

export interface ClientBusiness {
  id: string;
  name: string;
  ownerEmail: string;
  businessType: 'residence' | 'office' | 'warehouse' | 'facility' | 'retail' | 'general';
  address: string;
  driveFolderId?: string;
  dateCreated: number;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface RecordingSchedule {
  enabled: boolean;
  mode: 'allow_window' | 'pause_window';
  days: DayOfWeek[];
  startTime: string; // "HH:mm"
  endTime: string;   // "HH:mm"
}

export type DetectedObjectTag = 'person' | 'vehicle' | 'pet' | 'package';

export interface CameraConfig {
  id: string;
  tenantId: string; // Unit / Location Isolation ID
  name: string;
  location: string;
  type: CameraSourceType;
  brand?: CameraBrand;
  ipHost?: string;
  ipPort?: number;
  ipUser?: string;
  ipPass?: string;
  ipChannel?: number;
  deviceId?: string; // For local hardware webcam
  streamUrl?: string; // For HLS / MJPEG / MP4 / RTSP stream
  resolution?: '1080p' | '720p' | '480p';
  fps?: number;
  enableAudio: boolean;
  soundAlarmEnabled?: boolean;
  aiThreatAlertEnabled?: boolean;
  nightVision: boolean;
  motionDetectionEnabled: boolean;
  motionSensitivity: number; // 1 to 100
  autoRecordOnMotion: boolean;
  autoRecordDuration: number; // seconds
  recordingSchedule?: RecordingSchedule;
  digitalZoom: number; // 1.0 to 3.0
  pan: number; // -50 to 50
  tilt: number; // -50 to 50
  dateAdded: number;
}

export interface RecordingMotionMarker {
  id: string;
  offsetSeconds: number;
  timestamp: number;
  intensity: number; // 0 to 100
  label?: string;
  isCritical?: boolean;
}

export interface RecordingItem {
  id: string;
  tenantId: string;
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
  detectedObjects?: DetectedObjectTag[];
  detectedElements?: string[];
  motionMarkers?: RecordingMotionMarker[];
}

export interface MotionEvent {
  id: string;
  tenantId: string;
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
  detectedObjects?: DetectedObjectTag[];
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
  deviceId?: string; // For physical hardware webcams
  isLocalHardware?: boolean;
  status: 'online' | 'needs_auth' | 'connected';
  latencyMs?: number;
  rtspVerified?: boolean;
  serverBanner?: string;
  openPorts?: number[];
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
