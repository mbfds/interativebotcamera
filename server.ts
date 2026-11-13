import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import net from 'net';
import dgram from 'dgram';
import os from 'os';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = parseInt(process.env.PORT || '3000', 10);

app.use(express.json({ limit: '10mb' }));

// ---------------------------------------------------------------------------
// Persistent User Authentication & RBAC Store (.sentinela-data/auth.json)
// ---------------------------------------------------------------------------
type UserRole = 'admin' | 'operador';

interface StoredUser {
  id: string;
  name: string;
  username: string;
  email: string;
  role: UserRole;
  active: boolean;
  passwordSalt: string;
  passwordHash: string;
  createdAt: number;
  lastLoginAt?: number;
}

interface StoredSession {
  tokenHash: string;
  userId: string;
  createdAt: number;
  expiresAt: number;
}

interface AuthDatabase {
  users: StoredUser[];
  sessions: StoredSession[];
}

const DATA_DIR = path.resolve(__dirname, '.sentinela-data');
const AUTH_DB_PATH = path.join(DATA_DIR, 'auth.json');
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

function readAuthDb(): AuthDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(AUTH_DB_PATH)) {
      const initial: AuthDatabase = { users: [], sessions: [] };
      fs.writeFileSync(AUTH_DB_PATH, JSON.stringify(initial, null, 2), 'utf8');
      return initial;
    }
    const raw = fs.readFileSync(AUTH_DB_PATH, 'utf8');
    const parsed = JSON.parse(raw) as AuthDatabase;
    const now = Date.now();
    return {
      users: Array.isArray(parsed.users) ? parsed.users : [],
      sessions: Array.isArray(parsed.sessions)
        ? parsed.sessions.filter((s) => s.expiresAt > now)
        : [],
    };
  } catch {
    return { users: [], sessions: [] };
  }
}

function writeAuthDb(db: AuthDatabase): void {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${AUTH_DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, AUTH_DB_PATH);
}

function hashPassword(password: string, salt?: string): { salt: string; hash: string } {
  const actualSalt = salt || crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, actualSalt, 64).toString('hex');
  return { salt: actualSalt, hash: derived };
}

function verifyPassword(password: string, salt: string, storedHash: string): boolean {
  try {
    const derived = crypto.scryptSync(password, salt, 64);
    const storedBuf = Buffer.from(storedHash, 'hex');
    if (derived.length !== storedBuf.length) return false;
    return crypto.timingSafeEqual(derived, storedBuf);
  } catch {
    return false;
  }
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function sanitizeUser(u: StoredUser) {
  return {
    id: u.id,
    name: u.name,
    username: u.username,
    email: u.email,
    role: u.role,
    active: u.active,
    createdAt: u.createdAt,
    lastLoginAt: u.lastLoginAt,
  };
}

interface AuthedRequest extends Request {
  authUser?: StoredUser;
  authTokenHash?: string;
}

function resolveUserFromRequest(req: Request): { user: StoredUser | null; tokenHash: string | null } {
  const authHeader = req.headers.authorization || '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { user: null, tokenHash: null };

  const rawToken = match[1].trim();
  if (!rawToken) return { user: null, tokenHash: null };

  const tokenHash = hashToken(rawToken);
  const db = readAuthDb();
  const session = db.sessions.find((s) => s.tokenHash === tokenHash && s.expiresAt > Date.now());
  if (!session) return { user: null, tokenHash: null };

  const user = db.users.find((u) => u.id === session.userId && u.active);
  if (!user) return { user: null, tokenHash: null };

  return { user, tokenHash };
}

function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const { user, tokenHash } = resolveUserFromRequest(req);
  if (!user || !tokenHash) {
    res.status(401).json({ error: 'Sessão expirada ou não autenticada.' });
    return;
  }
  req.authUser = user;
  req.authTokenHash = tokenHash;
  next();
}

function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction): void {
  if (!req.authUser || req.authUser.role !== 'admin') {
    res.status(403).json({ error: 'Permissão restrita a administradores.' });
    return;
  }
  next();
}

// Auth Status: Tells client if initial Admin setup is needed and validates active token
app.get('/api/auth/status', (req: Request, res: Response): void => {
  const db = readAuthDb();
  const { user } = resolveUserFromRequest(req);
  res.json({
    needsSetup: db.users.length === 0,
    user: user ? sanitizeUser(user) : null,
  });
});

// Initial First-Run Admin Setup (Allowed ONLY when 0 users exist)
app.post('/api/auth/setup', (req: Request, res: Response): void => {
  const db = readAuthDb();
  if (db.users.length > 0) {
    res.status(409).json({ error: 'O sistema já possui usuários configurados. Faça login.' });
    return;
  }

  const { name, username, email, password } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Informe um nome válido (mínimo 2 caracteres).' });
    return;
  }
  if (!cleanUsername && !cleanEmail) {
    res.status(400).json({ error: 'Informe um usuário ou e-mail para login.' });
    return;
  }
  if (rawPassword.length < 6) {
    res.status(400).json({ error: 'A senha deve ter pelo menos 6 caracteres.' });
    return;
  }

  const { salt, hash } = hashPassword(rawPassword);
  const now = Date.now();
  const adminUser: StoredUser = {
    id: `usr-${crypto.randomUUID()}`,
    name: cleanName,
    username: cleanUsername || cleanEmail.split('@')[0],
    email: cleanEmail,
    role: 'admin',
    active: true,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: now,
    lastLoginAt: now,
  };

  const token = crypto.randomBytes(32).toString('hex');
  db.users.push(adminUser);
  db.sessions.push({
    tokenHash: hashToken(token),
    userId: adminUser.id,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  writeAuthDb(db);

  res.status(201).json({
    token,
    user: sanitizeUser(adminUser),
  });
});

// Login with username or email + password
app.post('/api/auth/login', (req: Request, res: Response): void => {
  const { identifier, password } = req.body || {};
  const cleanId = String(identifier || '').trim().toLowerCase();
  const rawPassword = String(password || '');

  if (!cleanId || !rawPassword) {
    res.status(400).json({ error: 'Informe usuário/e-mail e senha.' });
    return;
  }

  const db = readAuthDb();
  const user = db.users.find(
    (u) => u.username.toLowerCase() === cleanId || (u.email && u.email.toLowerCase() === cleanId)
  );

  if (!user || !verifyPassword(rawPassword, user.passwordSalt, user.passwordHash)) {
    res.status(401).json({ error: 'Credenciais inválidas.' });
    return;
  }

  if (!user.active) {
    res.status(403).json({ error: 'Esta conta de usuário está desativada. Contate o administrador.' });
    return;
  }

  const now = Date.now();
  user.lastLoginAt = now;
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions.push({
    tokenHash: hashToken(token),
    userId: user.id,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  });
  writeAuthDb(db);

  res.json({
    token,
    user: sanitizeUser(user),
  });
});

app.post('/api/auth/logout', (req: Request, res: Response): void => {
  const { tokenHash } = resolveUserFromRequest(req);
  if (tokenHash) {
    const db = readAuthDb();
    db.sessions = db.sessions.filter((s) => s.tokenHash !== tokenHash);
    writeAuthDb(db);
  }
  res.json({ ok: true });
});

app.get('/api/auth/me', requireAuth, (req: AuthedRequest, res: Response): void => {
  res.json({ user: sanitizeUser(req.authUser!) });
});

app.post('/api/auth/change-password', requireAuth, (req: AuthedRequest, res: Response): void => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword || String(newPassword).length < 6) {
    res.status(400).json({ error: 'Informe a senha atual e uma nova senha com mínimo de 6 caracteres.' });
    return;
  }

  const db = readAuthDb();
  const user = db.users.find((u) => u.id === req.authUser!.id);
  if (!user || !verifyPassword(String(currentPassword), user.passwordSalt, user.passwordHash)) {
    res.status(401).json({ error: 'Senha atual incorreta.' });
    return;
  }

  const { salt, hash } = hashPassword(String(newPassword));
  user.passwordSalt = salt;
  user.passwordHash = hash;
  writeAuthDb(db);

  res.json({ ok: true });
});

// Admin User Management Routes
app.get('/api/users', requireAuth, requireAdmin, (_req: AuthedRequest, res: Response): void => {
  const db = readAuthDb();
  res.json({
    users: db.users.map(sanitizeUser).sort((a, b) => a.createdAt - b.createdAt),
  });
});

app.post('/api/users', requireAuth, requireAdmin, (req: AuthedRequest, res: Response): void => {
  const { name, username, email, password, role } = req.body || {};
  const cleanName = String(name || '').trim();
  const cleanUsername = String(username || '').trim().toLowerCase();
  const cleanEmail = String(email || '').trim().toLowerCase();
  const rawPassword = String(password || '');
  const assignedRole: UserRole = role === 'admin' ? 'admin' : 'operador';

  if (cleanName.length < 2) {
    res.status(400).json({ error: 'Nome deve ter pelo menos 2 caracteres.' });
    return;
  }
  if (!cleanUsername || cleanUsername.length < 3) {
    res.status(400).json({ error: 'Nome de usuário deve ter pelo menos 3 caracteres.' });
    return;
  }
  if (rawPassword.length < 6) {
    res.status(400).json({ error: 'A senha inicial deve ter pelo menos 6 caracteres.' });
    return;
  }

  const db = readAuthDb();
  const duplicate = db.users.find(
    (u) =>
      u.username.toLowerCase() === cleanUsername ||
      (cleanEmail && u.email && u.email.toLowerCase() === cleanEmail)
  );
  if (duplicate) {
    res.status(409).json({ error: 'Já existe um usuário com este login ou e-mail.' });
    return;
  }

  const { salt, hash } = hashPassword(rawPassword);
  const newUser: StoredUser = {
    id: `usr-${crypto.randomUUID()}`,
    name: cleanName,
    username: cleanUsername,
    email: cleanEmail,
    role: assignedRole,
    active: true,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: Date.now(),
  };

  db.users.push(newUser);
  writeAuthDb(db);

  res.status(201).json({ user: sanitizeUser(newUser) });
});

app.patch('/api/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response): void => {
  const targetId = req.params.id;
  const { name, email, role, active, password } = req.body || {};
  const db = readAuthDb();
  const target = db.users.find((u) => u.id === targetId);
  if (!target) {
    res.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }

  const activeAdmins = db.users.filter((u) => u.role === 'admin' && u.active);
  const wouldRemoveLastAdmin =
    target.role === 'admin' &&
    target.active &&
    activeAdmins.length <= 1 &&
    (role === 'operador' || active === false);

  if (wouldRemoveLastAdmin) {
    res.status(400).json({ error: 'Não é possível remover ou desativar o único administrador ativo.' });
    return;
  }

  if (typeof name === 'string' && name.trim().length >= 2) target.name = name.trim();
  if (typeof email === 'string') target.email = email.trim().toLowerCase();
  if (role === 'admin' || role === 'operador') target.role = role;
  if (typeof active === 'boolean') {
    target.active = active;
    if (!active) {
      db.sessions = db.sessions.filter((s) => s.userId !== target.id);
    }
  }
  if (typeof password === 'string' && password.length > 0) {
    if (password.length < 6) {
      res.status(400).json({ error: 'A nova senha deve ter pelo menos 6 caracteres.' });
      return;
    }
    const { salt, hash } = hashPassword(password);
    target.passwordSalt = salt;
    target.passwordHash = hash;
  }

  writeAuthDb(db);
  res.json({ user: sanitizeUser(target) });
});

app.delete('/api/users/:id', requireAuth, requireAdmin, (req: AuthedRequest, res: Response): void => {
  const targetId = req.params.id;
  if (targetId === req.authUser!.id) {
    res.status(400).json({ error: 'Você não pode excluir sua própria conta conectada.' });
    return;
  }

  const db = readAuthDb();
  const target = db.users.find((u) => u.id === targetId);
  if (!target) {
    res.status(404).json({ error: 'Usuário não encontrado.' });
    return;
  }

  const activeAdmins = db.users.filter((u) => u.role === 'admin' && u.active);
  if (target.role === 'admin' && target.active && activeAdmins.length <= 1) {
    res.status(400).json({ error: 'Não é possível excluir o único administrador ativo.' });
    return;
  }

  db.users = db.users.filter((u) => u.id !== targetId);
  db.sessions = db.sessions.filter((s) => s.userId !== targetId);
  writeAuthDb(db);

  res.json({ ok: true });
});

// ---------------------------------------------------------------------------
// Google GenAI Security Inspector
// ---------------------------------------------------------------------------
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build',
    },
  },
});

// Endpoint: AI Security Analysis for a Camera Frame
app.post('/api/ai/analyze-frame', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { imageBase64, cameraName, location, businessName, businessType, isAfterHours } = req.body;

    if (!imageBase64) {
      res.status(400).json({ error: 'Imagem base64 não fornecida.' });
      return;
    }

    const cleanBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, '');

    const promptText = `Você é o Sentinela AI, um sistema profissional de monitoramento e auditoria de segurança eletrônica.
Analise a seguinte imagem capturada pela câmera "${cameraName}" localizada em "${location}" na unidade "${businessName || 'Ambiente Monitorado'}" (Perfil: ${businessType || 'Geral'}).
Período noturno / Fora de horário: ${isAfterHours ? 'SIM (Atenção redobrada a invasões)' : 'NÃO (Horário padrão)'}.

Realize uma auditoria detalhada de segurança e responda em formato JSON rigoroso com os seguintes campos:
{
  "threatLevel": "baixo" | "medio" | "alto",
  "threatScore": número de 0 a 100,
  "summary": "Resumo executivo de 1 a 2 frases do que está acontecendo na cena",
  "detectedElements": [
    "lista objetiva dos elementos detectados na imagem"
  ],
  "detectedObjects": [
    "lista padronizada usando APENAS as tags aplicáveis dentre: 'person', 'vehicle', 'pet', 'package'"
  ],
  "securityConcerns": [
    "lista de potenciais preocupações ou inconformidades observadas, se houver"
  ],
  "recommendations": [
    "1 a 3 recomendações práticas de segurança física para o ambiente"
  ],
  "occupancyEstimate": número estimado de pessoas visíveis
}
Seja objetivo, realista e foque na proteção do ambiente, controle de acesso e segurança física.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: {
        parts: [
          {
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanBase64,
            },
          },
          {
            text: promptText,
          },
        ],
      },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const outputText = response.text || '{}';
    let parsedResult;
    try {
      parsedResult = JSON.parse(outputText);
    } catch {
      parsedResult = {
        threatLevel: 'baixo',
        threatScore: 10,
        summary: outputText.slice(0, 150),
        detectedElements: ['Ambiente monitorado'],
        detectedObjects: [],
        securityConcerns: [],
        recommendations: ['Manter rotina padrão de vigilância'],
        occupancyEstimate: 0,
      };
    }

    res.json(parsedResult);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('AI Frame Analysis error:', error);
    res.status(500).json({
      error: 'Falha ao processar análise inteligente com IA: ' + error.message,
    });
  }
});

// Endpoint: AI Daily Security Report
app.post('/api/ai/daily-report', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  try {
    const { businessName, events, totalRecordings, cameraCount } = req.body;

    const eventsSummary = Array.isArray(events)
      ? events.slice(0, 20).map((e: { cameraName: string; timestamp: number; intensity: number }) =>
          `- Câmera: ${e.cameraName}, Horário: ${new Date(e.timestamp).toLocaleTimeString('pt-BR')}, Intensidade: ${e.intensity}%`
        ).join('\n')
      : 'Nenhum evento registrado hoje.';

    const promptText = `Você é o consultor de segurança com IA do Sentinela NVR.
Gere um Relatório Executivo Diário de Segurança para a unidade "${businessName || 'Ambiente Monitorado'}".
Dados de hoje:
- Total de câmeras ativas: ${cameraCount || 0}
- Total de gravações geradas: ${totalRecordings || 0}
- Eventos de movimento registrados:
${eventsSummary}

Responda em JSON com:
{
  "reportTitle": "Título do Relatório",
  "executiveSummary": "Parágrafo resumindo as atividades e ocorrências do dia",
  "busiestHour": "Horário com maior movimentação ou 'Equilibrado ao longo do dia'",
  "securityScore": número de 0 a 100 indicando o índice de segurança hoje (100 = perfeito),
  "keyHighlights": ["3 destaques do dia em tópicos"],
  "actionItems": ["2 ações preventivas sugeridas"]
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: promptText,
      config: {
        responseMimeType: 'application/json',
      },
    });

    const outputText = response.text || '{}';
    let parsedResult;
    try {
      parsedResult = JSON.parse(outputText);
    } catch {
      parsedResult = {
        reportTitle: `Relatório de Segurança - ${businessName || 'Unidade'}`,
        executiveSummary: outputText,
        busiestHour: 'Não determinado',
        securityScore: 95,
        keyHighlights: ['Monitoramento contínuo ativo'],
        actionItems: ['Revisar posicionamento das câmeras'],
      };
    }

    res.json(parsedResult);
  } catch (err: unknown) {
    const error = err as Error;
    console.error('AI Daily Report error:', error);
    res.status(500).json({
      error: 'Falha ao gerar relatório de inteligência: ' + error.message,
    });
  }
});

// ---------------------------------------------------------------------------
// Local Network TCP/RTSP/ONVIF Camera Scanner (Real probes only, zero mocks)
// ---------------------------------------------------------------------------
function getLocalNetworkSubnets(): { iface: string; ip: string; subnet: string }[] {
  const interfaces = os.networkInterfaces();
  const results: { iface: string; ip: string; subnet: string }[] = [];
  const seen = new Set<string>();

  for (const [ifaceName, addrs] of Object.entries(interfaces)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === 'IPv4' && !addr.internal) {
        const parts = addr.address.split('.');
        if (parts.length === 4) {
          const subnet = `${parts[0]}.${parts[1]}.${parts[2]}.0/24`;
          if (!seen.has(subnet)) {
            seen.add(subnet);
            results.push({ iface: ifaceName, ip: addr.address, subnet });
          }
        }
      }
    }
  }
  return results;
}

function parseTargetIps(subnetInput: string): string[] {
  const trimmed = (subnetInput || '192.168.1.0/24').trim();

  const singleIpMatch = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (singleIpMatch) {
    const octets = singleIpMatch.slice(1, 5).map(Number);
    if (octets.every((o) => o >= 0 && o <= 255)) {
      return [trimmed];
    }
  }

  const rangeMatch = trimmed.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.(\d{1,3})-(?:(\d{1,3}\.\d{1,3}\.\d{1,3})\.)?(\d{1,3})$/);
  if (rangeMatch) {
    const prefix = rangeMatch[1];
    const start = Math.max(1, Math.min(254, parseInt(rangeMatch[2], 10)));
    const end = Math.max(start, Math.min(254, parseInt(rangeMatch[4], 10)));
    const ips: string[] = [];
    for (let i = start; i <= end; i++) {
      ips.push(`${prefix}.${i}`);
    }
    return ips;
  }

  const prefixMatch = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})(?:\.(?:\d{1,3}|x)(?:\/\d{1,2})?)?$/i);
  if (prefixMatch) {
    const o1 = parseInt(prefixMatch[1], 10);
    const o2 = parseInt(prefixMatch[2], 10);
    const o3 = parseInt(prefixMatch[3], 10);
    if (o1 <= 255 && o2 <= 255 && o3 <= 255) {
      const ips: string[] = [];
      for (let i = 1; i <= 254; i++) {
        ips.push(`${o1}.${o2}.${o3}.${i}`);
      }
      return ips;
    }
  }

  return [];
}

function probeTcpPort(
  ip: string,
  port: number,
  timeoutMs: number = 280
): Promise<{ open: boolean; latencyMs: number; rtspVerified: boolean; serverBanner?: string }> {
  return new Promise((resolve) => {
    const start = Date.now();
    const socket = new net.Socket();
    let settled = false;
    let isOpen = false;
    let rtspVerified = false;
    let buffer = '';

    const finish = () => {
      if (settled) return;
      settled = true;
      socket.destroy();
      const latencyMs = Math.max(1, Date.now() - start);
      let serverBanner: string | undefined;
      if (buffer) {
        const serverMatch = buffer.match(/Server:\s*([^\r\n]+)/i);
        const authMatch = buffer.match(/WWW-Authenticate:[^\r\n]*realm="([^"]+)"/i);
        serverBanner = serverMatch?.[1]?.trim() || authMatch?.[1]?.trim();
      }
      resolve({ open: isOpen, latencyMs, rtspVerified, serverBanner });
    };

    socket.setTimeout(timeoutMs);

    socket.on('connect', () => {
      isOpen = true;
      if (port === 554 || port === 8554) {
        try {
          socket.setTimeout(380);
          socket.write(
            `OPTIONS rtsp://${ip}:${port}/ RTSP/1.0\r\nCSeq: 1\r\nUser-Agent: SentinelaNVR/1.0\r\n\r\n`
          );
        } catch {
          finish();
        }
      } else {
        finish();
      }
    });

    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      if (/RTSP\/1\.\d/i.test(buffer)) {
        rtspVerified = true;
      }
      if (buffer.includes('\r\n\r\n') || buffer.length > 512) {
        finish();
      }
    });

    socket.on('timeout', finish);
    socket.on('error', finish);

    try {
      socket.connect(port, ip);
    } catch {
      finish();
    }
  });
}

function probeOnvifWsDiscovery(timeoutMs: number = 650): Promise<Map<string, { xaddrs?: string }>> {
  return new Promise((resolve) => {
    const found = new Map<string, { xaddrs?: string }>();
    let closed = false;
    const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true });

    const done = () => {
      if (closed) return;
      closed = true;
      try {
        socket.close();
      } catch {
        // Ignore close errors
      }
      resolve(found);
    };

    const timer = setTimeout(done, timeoutMs);

    socket.on('error', () => {
      clearTimeout(timer);
      done();
    });

    socket.on('message', (msg, rinfo) => {
      const text = msg.toString('utf8');
      const xaddrsMatch = text.match(/<[^>]*XAddrs[^>]*>([^<]+)<\/[^>]*XAddrs>/i);
      found.set(rinfo.address, { xaddrs: xaddrsMatch?.[1]?.trim() });
    });

    const probeXml = `<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:${Date.now()}-sentinela-probe</w:MessageID>
    <w:To e:mustUnderstand="true">urn:schemas-xmlsoap-org:ws:2005:04/discovery</w:To>
    <w:Action a:mustUnderstand="true">http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body>
    <d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe>
  </e:Body>
</e:Envelope>`;

    try {
      socket.bind(0, () => {
        try {
          socket.setBroadcast(true);
          const message = Buffer.from(probeXml);
          socket.send(message, 0, message.length, 3702, '239.255.255.250');
        } catch {
          clearTimeout(timer);
          done();
        }
      });
    } catch {
      clearTimeout(timer);
      done();
    }
  });
}

function inferCameraFromProbe(
  ip: string,
  openPorts: number[],
  latencyMs: number,
  rtspVerified: boolean,
  serverBanner?: string,
  onvifXAddrs?: string
) {
  let profile: 'rtsp_realmonitor' | 'rtsp_channels' | 'rtsp_stream' | 'rtsp_onvif1' | 'generic_onvif' = 'generic_onvif';
  let rtspPath = '/live/ch0';

  if (openPorts.includes(37777)) {
    profile = 'rtsp_realmonitor';
    rtspPath = '/cam/realmonitor?channel=1&subtype=0';
  } else if (openPorts.includes(8000)) {
    profile = 'rtsp_channels';
    rtspPath = '/Streaming/Channels/101';
  } else if (openPorts.includes(8899)) {
    profile = 'rtsp_onvif1';
    rtspPath = '/onvif1';
  }

  const primaryRtspPort = openPorts.includes(554)
    ? 554
    : openPorts.includes(8554)
    ? 8554
    : openPorts[0] || 554;

  const rtspTemplate = `rtsp://admin:@${ip}:${primaryRtspPort}${rtspPath}`;

  return {
    id: `net-real-${ip.replace(/\./g, '-')}-${primaryRtspPort}`,
    name: serverBanner ? `${serverBanner} (${ip})` : `Câmera IP ${ip}`,
    brand: profile,
    brandLabel: rtspVerified ? 'Stream RTSP Ativo' : 'Dispositivo ONVIF / IP',
    model: serverBanner || `Portas ${openPorts.join(', ')}`,
    ip,
    port: primaryRtspPort,
    protocol: (rtspVerified ? 'RTSP' : 'ONVIF') as 'RTSP' | 'ONVIF',
    defaultUser: 'admin',
    defaultPass: '',
    locationSuggestion: 'Área Monitorada',
    rtspTemplate,
    status: (rtspVerified ? 'online' : 'needs_auth') as 'online' | 'needs_auth',
    latencyMs,
    rtspVerified,
    serverBanner: serverBanner || (onvifXAddrs ? `ONVIF: ${onvifXAddrs}` : undefined),
    openPorts,
  };
}

app.get('/api/network/interfaces', requireAuth, (_req: AuthedRequest, res: Response): void => {
  res.json({
    subnets: getLocalNetworkSubnets(),
    commonSubnets: ['192.168.1.0/24', '192.168.0.0/24', '192.168.15.0/24', '10.0.0.0/24'],
  });
});

app.post('/api/network/scan-cameras', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const startedAt = Date.now();
  const {
    subnet = '192.168.1.0/24',
    ports = [554, 8554, 8000, 37777, 8899],
    timeoutMs = 240,
  } = req.body || {};

  const targetSubnets = Array.isArray(subnet)
    ? subnet
    : subnet === 'all_common'
    ? ['192.168.1.0/24', '192.168.0.0/24', '192.168.15.0/24', '10.0.0.0/24']
    : [String(subnet)];

  const targetIpsSet = new Set<string>();
  for (const s of targetSubnets) {
    for (const ip of parseTargetIps(s)) {
      targetIpsSet.add(ip);
    }
  }

  const targetIps = Array.from(targetIpsSet).slice(0, 1020);
  const scanPorts: number[] = Array.isArray(ports) && ports.length > 0
    ? ports.map(Number).filter((p) => p > 0 && p <= 65535).slice(0, 6)
    : [554, 8554, 8000, 37777, 8899];

  const onvifPromise = probeOnvifWsDiscovery(650);

  const hostResults = new Map<
    string,
    { openPorts: number[]; minLatencyMs: number; rtspVerified: boolean; serverBanner?: string }
  >();

  const CONCURRENCY = 72;
  const primaryPorts = scanPorts.includes(554) ? [554] : [scanPorts[0]];
  const extraPorts = scanPorts.filter((p) => !primaryPorts.includes(p));

  const runBatch = async (tasks: (() => Promise<void>)[]) => {
    for (let i = 0; i < tasks.length; i += CONCURRENCY) {
      await Promise.all(tasks.slice(i, i + CONCURRENCY).map((fn) => fn()));
    }
  };

  const portsInFirstPass = targetIps.length <= 256 ? scanPorts : primaryPorts;
  const tasks: (() => Promise<void>)[] = [];

  for (const ip of targetIps) {
    for (const p of portsInFirstPass) {
      tasks.push(async () => {
        const result = await probeTcpPort(ip, p, timeoutMs);
        if (result.open) {
          const existing = hostResults.get(ip) || {
            openPorts: [],
            minLatencyMs: result.latencyMs,
            rtspVerified: false,
          };
          existing.openPorts.push(p);
          existing.minLatencyMs = Math.min(existing.minLatencyMs, result.latencyMs);
          if (result.rtspVerified) existing.rtspVerified = true;
          if (result.serverBanner && !existing.serverBanner) {
            existing.serverBanner = result.serverBanner;
          }
          hostResults.set(ip, existing);
        }
      });
    }
  }

  await runBatch(tasks);

  if (targetIps.length > 256 && extraPorts.length > 0 && hostResults.size > 0) {
    const extraTasks: (() => Promise<void>)[] = [];
    for (const ip of hostResults.keys()) {
      for (const p of extraPorts) {
        extraTasks.push(async () => {
          const result = await probeTcpPort(ip, p, timeoutMs);
          if (result.open) {
            const existing = hostResults.get(ip)!;
            existing.openPorts.push(p);
            if (result.rtspVerified) existing.rtspVerified = true;
            if (result.serverBanner && !existing.serverBanner) {
              existing.serverBanner = result.serverBanner;
            }
          }
        });
      }
    }
    await runBatch(extraTasks);
  }

  const onvifDiscovered = await onvifPromise;

  for (const [onvifIp, info] of onvifDiscovered.entries()) {
    if (!hostResults.has(onvifIp)) {
      const rtspCheck = await probeTcpPort(onvifIp, 554, 320);
      hostResults.set(onvifIp, {
        openPorts: rtspCheck.open ? [554] : [80],
        minLatencyMs: rtspCheck.latencyMs,
        rtspVerified: rtspCheck.rtspVerified,
        serverBanner: rtspCheck.serverBanner || (info.xaddrs ? `ONVIF (${info.xaddrs})` : 'ONVIF Responder'),
      });
    }
  }

  const realDiscoveredDevices = Array.from(hostResults.entries()).map(([ip, info]) => {
    const onvifInfo = onvifDiscovered.get(ip);
    return inferCameraFromProbe(
      ip,
      info.openPorts.sort((a, b) => a - b),
      info.minLatencyMs,
      info.rtspVerified,
      info.serverBanner,
      onvifInfo?.xaddrs
    );
  });

  const rtspVerifiedCount = realDiscoveredDevices.filter((d) => d.rtspVerified).length;
  const durationMs = Date.now() - startedAt;

  res.json({
    subnet: Array.isArray(subnet) ? subnet.join(', ') : subnet,
    detectedLocalSubnets: getLocalNetworkSubnets(),
    scannedCount: targetIps.length,
    portsScanned: scanPorts,
    reachableHostsCount: realDiscoveredDevices.length,
    rtspVerifiedCount,
    foundCount: realDiscoveredDevices.length,
    durationMs,
    devices: realDiscoveredDevices,
    timestamp: Date.now(),
    message:
      realDiscoveredDevices.length > 0
        ? `${realDiscoveredDevices.length} dispositivo(s) com portas de câmera ativas detectado(s) em ${durationMs}ms.`
        : `Varredura real de ${targetIps.length} IPs concluída em ${durationMs}ms. Nenhum stream RTSP/ONVIF ativo respondeu nesta faixa.`,
  });
});

app.post('/api/network/probe-ip', requireAuth, async (req: AuthedRequest, res: Response): Promise<void> => {
  const { ip, port = 554 } = req.body || {};
  const cleanIp = String(ip || '').trim();
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(cleanIp)) {
    res.status(400).json({ error: 'Endereço IPv4 inválido.' });
    return;
  }

  const portsToCheck = Array.from(new Set([Number(port) || 554, 554, 8554, 8000, 37777, 8899]));
  const openPorts: number[] = [];
  let minLatencyMs = 999;
  let rtspVerified = false;
  let serverBanner: string | undefined;

  await Promise.all(
    portsToCheck.map(async (p) => {
      const r = await probeTcpPort(cleanIp, p, 600);
      if (r.open) {
        openPorts.push(p);
        minLatencyMs = Math.min(minLatencyMs, r.latencyMs);
        if (r.rtspVerified) rtspVerified = true;
        if (r.serverBanner && !serverBanner) serverBanner = r.serverBanner;
      }
    })
  );

  if (openPorts.length === 0) {
    res.json({
      reachable: false,
      ip: cleanIp,
      portsChecked: portsToCheck,
      device: null,
      message: `O IP ${cleanIp} não respondeu nas portas RTSP/ONVIF (${portsToCheck.join(', ')}).`,
    });
    return;
  }

  const device = inferCameraFromProbe(
    cleanIp,
    openPorts.sort((a, b) => a - b),
    minLatencyMs,
    rtspVerified,
    serverBanner
  );

  res.json({
    reachable: true,
    ip: cleanIp,
    portsChecked: portsToCheck,
    device,
    message: rtspVerified
      ? `Stream RTSP ativo detectado em ${cleanIp} (${minLatencyMs}ms).`
      : `Porta(s) de câmera aberta(s) em ${cleanIp}: ${openPorts.join(', ')}.`,
  });
});

// Mount Vite in development or serve static files in production
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`Sentinela NVR server listening on http://0.0.0.0:${port}`);
  });
}

startServer();
