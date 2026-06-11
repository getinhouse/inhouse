export interface Settings {
  /** Server base URL; empty means same-origin. */
  baseUrl: string;
  /** Optional bearer token. */
  token: string;
  /** RMS amplitude threshold for hands-free VAD (0..1). */
  vadThreshold: number;
  /** Whether assistant replies are played aloud. */
  playAloud: boolean;
  /** Hands-free only: speaking during a reply interrupts it (barge-in). */
  bargeIn: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  baseUrl: '',
  token: '',
  vadThreshold: 0.02,
  playAloud: true,
  bargeIn: false,
};

const STORAGE_KEY = 'inhouse.settings.v1';

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
      token: typeof parsed.token === 'string' ? parsed.token : DEFAULT_SETTINGS.token,
      vadThreshold:
        typeof parsed.vadThreshold === 'number' && Number.isFinite(parsed.vadThreshold)
          ? parsed.vadThreshold
          : DEFAULT_SETTINGS.vadThreshold,
      playAloud: typeof parsed.playAloud === 'boolean' ? parsed.playAloud : DEFAULT_SETTINGS.playAloud,
      // Settings saved before barge-in existed parse as disabled.
      bargeIn: typeof parsed.bargeIn === 'boolean' ? parsed.bargeIn : DEFAULT_SETTINGS.bargeIn,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Storage may be unavailable (private mode); settings just won't persist.
  }
}
