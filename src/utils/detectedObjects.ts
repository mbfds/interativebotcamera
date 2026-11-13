import { DetectedObjectTag, RecordingItem } from '../types/camera';

export interface ObjectTagMeta {
  id: DetectedObjectTag;
  label: string;
  pluralLabel: string;
}

export const DETECTED_OBJECT_CATALOG: ObjectTagMeta[] = [
  { id: 'person', label: 'Pessoa', pluralLabel: 'Pessoas' },
  { id: 'vehicle', label: 'Veículo', pluralLabel: 'Veículos' },
  { id: 'pet', label: 'Pet / Animal', pluralLabel: 'Pets / Animais' },
  { id: 'package', label: 'Pacote / Entrega', pluralLabel: 'Pacotes' },
];

const KEYWORD_RULES: { tag: DetectedObjectTag; patterns: RegExp[] }[] = [
  {
    tag: 'person',
    patterns: [
      /\bperson\b/i,
      /\bpeople\b/i,
      /\bhuman\b/i,
      /\bpessoa(s)?\b/i,
      /\bindiv[ií]duo(s)?\b/i,
      /\bcliente(s)?\b/i,
      /\bfuncion[aá]rio(s)?\b/i,
      /\boperador\b/i,
      /\bvisitante\b/i,
      /\bintruso\b/i,
      /\bsuspeito\b/i,
      /\bhomem\b/i,
      /\bmulher\b/i,
      /\bocupante(s)?\b/i,
    ],
  },
  {
    tag: 'vehicle',
    patterns: [
      /\bvehicle(s)?\b/i,
      /\bcar(s)?\b/i,
      /\btruck(s)?\b/i,
      /\bmotorcycle(s)?\b/i,
      /\bvan\b/i,
      /\bve[ií]culo(s)?\b/i,
      /\bcarro(s)?\b/i,
      /\bmoto(cicleta)?(s)?\b/i,
      /\bcaminh[aã]o\b/i,
      /\bestacionamento\b/i,
      /\bautom[oó]vel\b/i,
    ],
  },
  {
    tag: 'pet',
    patterns: [
      /\bpet(s)?\b/i,
      /\banimal(is)?\b/i,
      /\bdog(s)?\b/i,
      /\bcat(s)?\b/i,
      /\bcachorro(s)?\b/i,
      /\bc[aã]o\b/i,
      /\bgato(s)?\b/i,
      /\bbicho\b/i,
    ],
  },
  {
    tag: 'package',
    patterns: [
      /\bpackage(s)?\b/i,
      /\bparcel(s)?\b/i,
      /\bdelivery\b/i,
      /\bbox(es)?\b/i,
      /\bpacote(s)?\b/i,
      /\bencomenda(s)?\b/i,
      /\bentrega(s)?\b/i,
      /\bmercadoria(s)?\b/i,
    ],
  },
];

export function extractDetectedObjectTags(params: {
  explicitTags?: string[];
  detectedElements?: string[];
  texts?: (string | undefined)[];
}): DetectedObjectTag[] {
  const found = new Set<DetectedObjectTag>();
  const validSet = new Set<DetectedObjectTag>(['person', 'vehicle', 'pet', 'package']);

  if (Array.isArray(params.explicitTags)) {
    for (const raw of params.explicitTags) {
      const normalized = raw.trim().toLowerCase() as DetectedObjectTag;
      if (validSet.has(normalized)) {
        found.add(normalized);
      }
    }
  }

  const allStrings: string[] = [
    ...(params.detectedElements || []),
    ...((params.texts || []).filter(Boolean) as string[]),
  ];

  for (const text of allStrings) {
    for (const rule of KEYWORD_RULES) {
      if (rule.patterns.some((re) => re.test(text))) {
        found.add(rule.tag);
      }
    }
  }

  return Array.from(found);
}

export function getRecordingDetectedObjects(rec: RecordingItem): DetectedObjectTag[] {
  return extractDetectedObjectTags({
    explicitTags: rec.detectedObjects,
    detectedElements: rec.detectedElements,
    texts: [rec.aiThreatReason, rec.aiAnalysisSummary, rec.notes],
  });
}

export function getObjectTagLabel(tag: DetectedObjectTag): string {
  return DETECTED_OBJECT_CATALOG.find((item) => item.id === tag)?.label || tag;
}
