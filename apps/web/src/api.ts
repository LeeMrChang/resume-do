import type {
  ResumeAppearance,
  ResumeDocument,
} from '@resume-do/schema';

export interface User {
  id: number;
  email: string;
  displayName: string;
}

export interface ResumeSummary {
  id: string;
  title: string;
  revision: number;
  templateId: string;
  updatedAt: string;
}

export interface ResumeResponse {
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
  login: (email: string, password: string) =>
    request<User>('/api/auth/login', json({ email, password })),
  register: (email: string, password: string, displayName: string) =>
    request<User>('/api/auth/register', json({ email, password, displayName })),
  logout: () => request<void>('/api/auth/logout', { method: 'POST' }),

  listResumes: () => request<ResumeSummary[]>('/api/resumes'),
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
