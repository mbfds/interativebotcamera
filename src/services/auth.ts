import { AuthUser, UserRole } from '../types/camera';

const SESSION_TOKEN_KEY = 'sentinela_session_token';

export function getAuthToken(): string | null {
  return localStorage.getItem(SESSION_TOKEN_KEY);
}

export function setAuthToken(token: string | null): void {
  if (token) {
    localStorage.setItem(SESSION_TOKEN_KEY, token);
  } else {
    localStorage.removeItem(SESSION_TOKEN_KEY);
  }
}

export function getAuthHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken();
  return token
    ? { ...extra, Authorization: `Bearer ${token}` }
    : extra;
}

export async function fetchAuthStatus(): Promise<{
  needsSetup: boolean;
  user: AuthUser | null;
}> {
  const res = await fetch('/api/auth/status', {
    headers: getAuthHeaders(),
  });
  if (!res.ok) {
    throw new Error('Falha ao verificar status de autenticação.');
  }
  return res.json();
}

export async function setupInitialAdmin(payload: {
  name: string;
  username: string;
  email: string;
  password: string;
}): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/setup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Falha ao criar conta administrador.');
  }
  setAuthToken(data.token);
  return data;
}

export async function loginWithCredentials(
  identifier: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifier, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Credenciais inválidas.');
  }
  setAuthToken(data.token);
  return data;
}

export async function logoutSession(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: getAuthHeaders(),
    });
  } finally {
    setAuthToken(null);
  }
}

export async function changeOwnPassword(
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch('/api/auth/change-password', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ currentPassword, newPassword }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Não foi possível alterar a senha.');
  }
}

export async function listUsers(): Promise<AuthUser[]> {
  const res = await fetch('/api/users', {
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao carregar usuários.');
  }
  return data.users || [];
}

export async function createUserAccount(payload: {
  name: string;
  username: string;
  email: string;
  password: string;
  role: UserRole;
}): Promise<AuthUser> {
  const res = await fetch('/api/users', {
    method: 'POST',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao criar usuário.');
  }
  return data.user;
}

export async function updateUserAccount(
  id: string,
  updates: {
    name?: string;
    email?: string;
    role?: UserRole;
    active?: boolean;
    password?: string;
  }
): Promise<AuthUser> {
  const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(updates),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao atualizar usuário.');
  }
  return data.user;
}

export async function deleteUserAccount(id: string): Promise<void> {
  const res = await fetch(`/api/users/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Erro ao excluir usuário.');
  }
}
