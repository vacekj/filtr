export interface Settings {
  IS_ACTIVE: boolean;
  LIKE_THRESHOLD: number | null;
  CONTENT_PROMPT: string;
  ENDPOINT_TYPE: string;
  MODEL: string;
  API_KEY: string;
  API_ENDPOINT: string;
  KEYWORDS: string;
  KEYWORDS_FILTER_ENABLED: boolean;
  LIKES_FILTER_ENABLED: boolean;
  AI_FILTER_ENABLED: boolean;
}

export const defaultSettings: Settings = {
  IS_ACTIVE: false,
  LIKE_THRESHOLD: null,
  CONTENT_PROMPT: '',
  ENDPOINT_TYPE: '',
  MODEL: '',
  API_KEY: '',
  API_ENDPOINT: '',
  KEYWORDS: '',
  KEYWORDS_FILTER_ENABLED: false,
  LIKES_FILTER_ENABLED: false,
  AI_FILTER_ENABLED: false
};

export function loadSettings(): Promise<Settings> {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'IS_ACTIVE',
      'LIKE_THRESHOLD',
      'CONTENT_PROMPT',
      'ENDPOINT_TYPE',
      'MODEL',
      'API_KEY',
      'API_ENDPOINT',
      'KEYWORDS',
      'KEYWORDS_FILTER_ENABLED',
      'LIKES_FILTER_ENABLED',
      'AI_FILTER_ENABLED'
    ], (result) => {
      resolve({ ...defaultSettings, ...result });
    });
  });
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  let timeoutId: number | undefined;

  const listener = (changes: { [key: string]: chrome.storage.StorageChange }) => {
    const newSettings: Partial<Settings> = {};
    for (const [key, { newValue }] of Object.entries(changes)) {
      if (key in defaultSettings) {
        newSettings[key as keyof Settings] = newValue;
      }
    }

    // Clear existing timeout
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    // Set new timeout
    timeoutId = window.setTimeout(() => {
      callback(newSettings as Settings);
    }, 2000);
  };

  chrome.storage.onChanged.addListener(listener);
  return () => {
    chrome.storage.onChanged.removeListener(listener);
    if (timeoutId) clearTimeout(timeoutId);
  };
} 