export type CameraBrand =
  | 'rtsp_realmonitor'
  | 'rtsp_channels'
  | 'rtsp_stream'
  | 'rtsp_onvif1'
  | 'generic_onvif'
  | 'webcam';

export interface RtspProfileInfo {
  id: CameraBrand;
  name: string;
  protocolDescription: string;
  defaultPort: number;
  defaultUser: string;
  streamPathPattern: string;
  instructions: string;
}

export const COMMERCIAL_BRANDS: RtspProfileInfo[] = [
  {
    id: 'generic_onvif',
    name: 'RTSP / ONVIF Padrão',
    protocolDescription: 'RTSP / ONVIF Universal',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/live/ch0',
    instructions:
      'Informe o endereço IP local da câmera na rede ou domínio DDNS com a porta RTSP mapeada.',
  },
  {
    id: 'rtsp_realmonitor',
    name: 'Perfil Realmonitor (Canal/Substream)',
    protocolDescription: 'RTSP / ONVIF Perfil S',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/cam/realmonitor?channel={channel}&subtype={subtype}',
    instructions:
      'Compatível com gravadores NVR/DVR e câmeras IP que utilizam rota /cam/realmonitor com seleção de canal.',
  },
  {
    id: 'rtsp_channels',
    name: 'Perfil Streaming/Channels',
    protocolDescription: 'RTSP H.264 / H.265',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/Streaming/Channels/{channel}0{subtype}',
    instructions:
      'Utiliza numeração de canal padrão 101 (principal) ou 102 (sub-stream). Desative criptografia de vídeo no dispositivo se necessário.',
  },
  {
    id: 'rtsp_stream',
    name: 'Perfil Stream Direto (/stream1)',
    protocolDescription: 'RTSP H.264 / ONVIF',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/stream{subtype}',
    instructions:
      'Configure usuário e senha RTSP dedicados nas configurações avançadas da câmera antes de conectar.',
  },
  {
    id: 'rtsp_onvif1',
    name: 'Perfil ONVIF Porta 554 / 8899',
    protocolDescription: 'RTSP / ONVIF (/onvif1)',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/onvif1',
    instructions:
      'Habilite o acesso NVR/RTSP nas configurações de rede do dispositivo e informe a senha de acesso.',
  },
];

export function buildCommercialRTSPUrl(
  brand: CameraBrand | string,
  host: string,
  port: number = 554,
  user: string = 'admin',
  pass: string = '',
  channel: number = 1,
  subtype: number = 0
): string {
  const cleanHost = host.trim().replace(/^https?:\/\//, '').replace(/^rtsp:\/\//, '');
  const auth = user ? `${encodeURIComponent(user)}${pass ? ':' + encodeURIComponent(pass) : ''}@` : '';

  switch (brand) {
    case 'rtsp_realmonitor':
      return `rtsp://${auth}${cleanHost}:${port}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;

    case 'rtsp_channels':
      return `rtsp://${auth}${cleanHost}:${port}/Streaming/Channels/${channel}0${subtype + 1}`;

    case 'rtsp_stream':
      return `rtsp://${auth}${cleanHost}:${port}/stream${subtype + 1}`;

    case 'rtsp_onvif1':
      return `rtsp://${auth}${cleanHost}:${port}/onvif1`;

    case 'generic_onvif':
    default:
      return `rtsp://${auth}${cleanHost}:${port}/live/ch0`;
  }
}
