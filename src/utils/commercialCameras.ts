export type CameraBrand =
  | 'intelbras'
  | 'hikvision'
  | 'dahua'
  | 'tapo'
  | 'yoosee'
  | 'generic_onvif'
  | 'webcam'
  | 'simulated';

export interface CommercialBrandInfo {
  id: CameraBrand;
  name: string;
  popularModels: string;
  defaultPort: number;
  defaultUser: string;
  streamPathPattern: string;
  protocolDescription: string;
  instructions: string;
}

export const COMMERCIAL_BRANDS: CommercialBrandInfo[] = [
  {
    id: 'intelbras',
    name: 'Intelbras',
    popularModels: 'Mibo iC3, iC4, iC5, iMX, VIP IP, MHDX DVRs',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/cam/realmonitor?channel={channel}&subtype={subtype}',
    protocolDescription: 'RTSP / ONVIF Perfil S',
    instructions:
      'Para câmeras Intelbras Mibo, habilite a função RTSP no app Mibo Cam e use a chave de autenticação (código de verificação no adesivo) como senha.',
  },
  {
    id: 'hikvision',
    name: 'Hikvision / EZVIZ',
    popularModels: 'C6N, C3WN, C1C, DS-2CD series, HiLook DVRs',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/Streaming/Channels/{channel}0{subtype}',
    protocolDescription: 'RTSP / ONVIF',
    instructions:
      'Nas câmeras EZVIZ (Hikvision), desative a criptografia de vídeo no app EZVIZ e use o Verification Code impresso na base da câmera como senha.',
  },
  {
    id: 'dahua',
    name: 'Dahua / IMOU',
    popularModels: 'Ranger 2, Cruiser, Bullet 2C, XVR Gravadores',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/cam/realmonitor?channel={channel}&subtype={subtype}',
    protocolDescription: 'RTSP / ONVIF',
    instructions:
      'Acesse as configurações de rede da câmera no app IMOU Life ou navegador, verifique o IP local e ative o protocolo ONVIF.',
  },
  {
    id: 'tapo',
    name: 'TP-Link Tapo',
    popularModels: 'Tapo C200, C310, C100, C500, TC70',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/stream{subtype}',
    protocolDescription: 'RTSP H.264 / ONVIF',
    instructions:
      'No app Tapo, acesse Configurações da Câmera > Avançado > Conta da Câmera e crie um usuário/senha específico para acesso RTSP.',
  },
  {
    id: 'yoosee',
    name: 'Yoosee / V380 / Robô Wi-Fi',
    popularModels: 'Câmera Robô 360°, Lâmpada Espiã, Câmera Externa PTZ',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/onvif1',
    protocolDescription: 'RTSP / ONVIF Portas 554 ou 8899',
    instructions:
      'No app Yoosee ou V380, vá em Configurações > Conexões e ative as conexões RTSP/NVR, anotando a senha numérica gerada.',
  },
  {
    id: 'generic_onvif',
    name: 'Câmera IP Genérica ONVIF / RTSP',
    popularModels: 'Qualquer câmera IP compatível com padrão ONVIF ou RTSP',
    defaultPort: 554,
    defaultUser: 'admin',
    streamPathPattern: '/live/ch0',
    protocolDescription: 'RTSP / ONVIF Universal',
    instructions:
      'Informe o endereço IP da câmera na rede local (ex: 192.168.1.100) ou o domínio DDNS do comércio com a porta mapeada.',
  },
];

export function buildCommercialRTSPUrl(
  brand: CameraBrand,
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
    case 'intelbras':
    case 'dahua':
      return `rtsp://${auth}${cleanHost}:${port}/cam/realmonitor?channel=${channel}&subtype=${subtype}`;

    case 'hikvision':
      // channel 1 main: 101, sub: 102
      return `rtsp://${auth}${cleanHost}:${port}/Streaming/Channels/${channel}0${subtype + 1}`;

    case 'tapo':
      // main is /stream1, sub is /stream2
      return `rtsp://${auth}${cleanHost}:${port}/stream${subtype + 1}`;

    case 'yoosee':
      return `rtsp://${auth}${cleanHost}:${port}/onvif1`;

    case 'generic_onvif':
    default:
      return `rtsp://${auth}${cleanHost}:${port}/live/ch0`;
  }
}
