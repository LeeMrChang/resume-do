export const AI_MODELS = ['deepseek-flash', 'deepseek-v4-pro'] as const;

export type AiModel = (typeof AI_MODELS)[number];

export interface AiSettings {
  enabled: boolean;
  apiKey: string;
  model: AiModel;
  sessionOnly: boolean;
}

const LOCAL_KEY = 'resume-do.ai';
const SESSION_KEY = 'resume-do.ai.session';

export const DEEPSEEK_KEY_URL = 'https://platform.deepseek.com/api_keys';

export function defaultAiSettings(): AiSettings {
  return { enabled: false, apiKey: '', model: AI_MODELS[0], sessionOnly: false };
}

export function apiKeyLooksValid(value: string): boolean {
  return /^sk-[A-Za-z0-9_-]{16,}$/.test(value.trim());
}

export function maskApiKey(value: string): string {
  const key = value.trim();
  if (!key) return '';
  if (key.length <= 7) return '****';
  return `${key.slice(0, 3)}****${key.slice(-4)}`;
}

function parse(raw: string | null, sessionOnly: boolean): AiSettings | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<AiSettings> | null;
    if (!parsed || typeof parsed !== 'object') return null;
    const model = AI_MODELS.find((item) => item === parsed.model) ?? AI_MODELS[0];
    return {
      enabled: parsed.enabled === true,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
      model,
      sessionOnly,
    };
  } catch {
    return null;
  }
}

export function readAiSettings(): AiSettings {
  try {
    return parse(localStorage.getItem(LOCAL_KEY), false)
      ?? parse(sessionStorage.getItem(SESSION_KEY), true)
      ?? defaultAiSettings();
  } catch {
    return defaultAiSettings();
  }
}

/** Returns false when the browser refuses storage (private mode); the caller keeps settings in memory. */
export function saveAiSettings(settings: AiSettings): boolean {
  const payload = JSON.stringify(settings);
  try {
    if (settings.sessionOnly) {
      sessionStorage.setItem(SESSION_KEY, payload);
      localStorage.removeItem(LOCAL_KEY);
    } else {
      localStorage.setItem(LOCAL_KEY, payload);
      sessionStorage.removeItem(SESSION_KEY);
    }
    return true;
  } catch {
    return false;
  }
}
