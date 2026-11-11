import type {
  ResumeAppearance,
  ResumeDocument,
} from '@resume-do/schema';

export interface User {
  id: number;
  email?: string;
  phone?: string;
  displayName: string;
  themePreference?: 'light' | 'dark' | 'system';
}

export type RegisterChannel = 'email' | 'phone';

export interface CaptchaChallenge {
  captchaId: string;
  question: string;
  image: string;
  expiresInSeconds: number;
}

export interface CaptchaPoint { x: number; y: number; }

export interface VerificationCodeSent {
  retryAfterSeconds: number;
  expiresInSeconds: number;
  devCode?: string;
}

export interface RegisterPayload {
  channel: RegisterChannel;
  target: string;
  code: string;
  password: string;
  displayName: string;
}

export interface OriginalSource { filename: string; mime: string; bytes: number; pages: number | null; }
export interface ResumeSummary {
  kind?: 'structured' | 'original';
  source?: OriginalSource;
  id: string;
  title: string;
  revision: number;
  templateId: string;
  updatedAt: string;
  deletedAt?: string | null;
}

export interface ResumeResponse {
  kind?: 'structured' | 'original';
  source?: OriginalSource;
  id: string;
  title: string;
  revision: number;
  document: ResumeDocument;
  appearance: ResumeAppearance;
  createdAt: string;
  updatedAt: string;
}

export interface SaveResumeRequest {
  baseRevision: number;
  clientMutationId: string;
  title: string;
  document: ResumeDocument;
  appearance: ResumeAppearance;
}

export type ExportStatus = 'queued' | 'rendering' | 'ready' | 'expired' | 'failed';

export interface ExportJob {
  id: string;
  status: ExportStatus;
  filename: string;
  downloadUrl?: string;
  errorCode?: string;
  errorMessage?: string;
  expiresAt?: string;
  createdAt?: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: {
      ...(init.body && !(init.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
  });

  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.code ?? 'REQUEST_FAILED',
      data?.message ?? '请求失败，请稍后重试',
      data?.details ?? {},
    );
  }
  return data as T;
}

function json(body: unknown): RequestInit {
  return { method: 'POST', body: JSON.stringify(body) };
}

export const api = {
  me: () => request<User>('/api/auth/me'),
  login: (account: string, password: string) =>
    request<User>('/api/auth/login', json({ account, password })),
  register: (payload: RegisterPayload) =>
    request<User>('/api/auth/register', json(payload)),
  requestCaptcha: () => request<CaptchaChallenge>('/api/auth/captcha'),
  verifyCaptcha: (captchaId: string, points: CaptchaPoint[]) =>
    request<{ ticket: string; expiresInSeconds: number }>(
      `/api/auth/captcha/${encodeURIComponent(captchaId)}/verify`,
      json({ points }),
    ),
  sendVerificationCode: (channel: RegisterChannel, target: string, captchaTicket: string) =>
    request<VerificationCodeSent>('/api/auth/verification-codes', json({ channel, target, captchaTicket })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),
  updateThemePreference: (themePreference: 'light' | 'dark' | 'system') =>
    request<User>('/api/auth/me', {
      method: 'PATCH',
      body: JSON.stringify({ themePreference }),
    }),

  getTemplateFavorites: (signal?: AbortSignal) => request<string[]>('/api/template-favorites', { signal }),
  addTemplateFavorite: (templateId: string) => request<void>(`/api/template-favorites/${encodeURIComponent(templateId)}`, { method: 'PUT' }),
  removeTemplateFavorite: (templateId: string) => request<void>(`/api/template-favorites/${encodeURIComponent(templateId)}`, { method: 'DELETE' }),

  openLegacyEditor: (id: string) => request<ResumeResponse>(`/api/imports/from-original/${id}`, { method: 'POST' }),
  importEditable: (file: File) => {
    const body = new FormData(); body.append('file', file);
    return request<ResumeResponse>('/api/imports/direct', { method: 'POST', body });
  },
  importEditableInto: (resumeId: string, file: File) => {
    const body = new FormData(); body.append('file', file);
    return request<ResumeResponse>(`/api/imports/direct/${resumeId}`, { method: 'POST', body });
  },
  downloadSource: async (id: string, filename: string) => {
    const response = await fetch(`/api/resumes/${id}/source?download=1`, { credentials: 'include' });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      throw new ApiError(response.status, body?.code ?? 'SOURCE_FAILED', body?.message ?? '原件下载失败');
    }
    const url = URL.createObjectURL(await response.blob());
    const encoded = response.headers.get('Content-Disposition')?.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
    let name = filename;
    if (encoded) { try { name = decodeURIComponent(encoded); } catch { /* Use the suggested name. */ } }
    const link = document.createElement('a'); link.href = url; link.download = name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_');
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  },
  uploadOriginal: (file: File) => {
    const body = new FormData(); body.append('file', file);
    return request<ResumeResponse>('/api/resumes/originals', { method: 'POST', body });
  },
  deleteResume: (id: string) => request<void>(`/api/resumes/${id}`, { method: 'DELETE' }),
  purgeResume: (id: string) => request<void>(`/api/resumes/${id}?purge=1`, { method: 'DELETE' }),
  restoreResume: (id: string) => request<ResumeResponse>(`/api/resumes/${id}/restore`, { method: 'POST' }),
  listResumes: (deleted = false) => request<ResumeSummary[]>(`/api/resumes${deleted ? '?deleted=1' : ''}`),
  renameResume: (id: string, baseRevision: number, title: string) =>
    request<ResumeResponse>(`/api/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ baseRevision, clientMutationId: crypto.randomUUID(), title }),
    }),
  getResume: (id: string) => request<ResumeResponse>(`/api/resumes/${id}`),
  createResume: (payload: {
    title: string;
    document: ResumeDocument;
    appearance: ResumeAppearance;
  }) => request<ResumeResponse>('/api/resumes', json(payload)),
  saveResume: (id: string, payload: SaveResumeRequest) =>
    request<ResumeResponse>(`/api/resumes/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  createExport: (
    resumeId: string,
    payload: { revision: number; idempotencyKey: string; filename?: string },
  ) => request<ExportJob>(`/api/resumes/${resumeId}/exports`, json(payload)),
  getExport: (id: string, signal?: AbortSignal) => request<ExportJob>(`/api/exports/${id}`, { signal }),
  downloadExport: async (id: string, filename: string) => {
    const response = await fetch(`/api/exports/${id}/file`, { credentials: 'include' });
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiError(
        response.status,
        data?.code ?? 'DOWNLOAD_FAILED',
        data?.message ?? '下载失败，请重试',
      );
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2_000);
  },
};

export interface ImportDraft {
  title: string;
  document: ResumeDocument;
  appearance: ResumeAppearance;
}
export interface ImportJob {
  id: string;
  filename: string;
  status: 'processing' | 'ready' | 'failed' | 'confirmed' | 'cancelled' | 'expired';
  sourceText?: string;
  draft?: ImportDraft;
  version: number;
  errorCode?: string;
  message?: string;
  resumeId?: string;
  expiresAt: string;
}
export const importApi = {
  list: () => request<ImportJob[]>('/api/imports'),
  get: (id: string) => request<ImportJob>(`/api/imports/${id}`),
  upload: (file: File) => {
    const body = new FormData(); body.append('file', file);
    return request<ImportJob>('/api/imports', { method: 'POST', body });
  },
  save: (id: string, version: number, draft: ImportDraft) =>
    request<ImportJob>(`/api/imports/${id}`, { method: 'PATCH', body: JSON.stringify({ version, draft }) }),
  retry: (id: string) => request<ImportJob>(`/api/imports/${id}/retry`, { method: 'POST' }),
  confirm: (id: string, version: number) => request<ResumeResponse>(`/api/imports/${id}/confirm`, json({ version })),
  cancel: (id: string) => request<void>(`/api/imports/${id}`, { method: 'DELETE' }),
};
