export const DEFAULT_FILTER = `This post is about immigration, migrants, refugees, or asylum.
This post is about Black people or their experiences.
This post is about rape or sexual violence.
This post expresses an extremely negative, hostile, or hateful attitude.
This post is about foreign political disputes or culture wars unrelated to Czechia.`;

export const DEFAULT_KEYWORDS =
  "immigra*, imigr*, migran*, refugee*, uprchlik*, uprchlic*, Black people, Black community, Black lives, černoši, černoch, černochy, černochů, černochům, znasiln*, rape, sexual violence, sexual assault, sexuální násilí, pohlavní zneužití, " +
  "Macron*, Le Pen*, LePen*, Donald Trump, MAGA, Putin*, Orban*, Netanyahu*, deport*, Afri*";
export const DEFAULT_THRESHOLD = 0.45;

export interface Settings {
  IS_ACTIVE: boolean;
  CONTENT_PROMPT: string;
  HIDE_THRESHOLD: number;
  KEYWORDS: string;
  KEYWORDS_FILTER_ENABLED: boolean;
  LIKE_THRESHOLD: number | null;
  LIKES_FILTER_ENABLED: boolean;
}

export const defaultSettings: Settings = {
  IS_ACTIVE: false,
  CONTENT_PROMPT: DEFAULT_FILTER,
  HIDE_THRESHOLD: DEFAULT_THRESHOLD,
  KEYWORDS: DEFAULT_KEYWORDS,
  KEYWORDS_FILTER_ENABLED: true,
  LIKE_THRESHOLD: null,
  LIKES_FILTER_ENABLED: false,
};

export function normalizeSettings(raw: Record<string, unknown>): Settings {
  return {
    IS_ACTIVE: raw.IS_ACTIVE === true,
    CONTENT_PROMPT:
      typeof raw.CONTENT_PROMPT === "string" && raw.CONTENT_PROMPT.trim()
        ? raw.CONTENT_PROMPT.slice(0, 2400)
        : DEFAULT_FILTER,
    HIDE_THRESHOLD:
      typeof raw.HIDE_THRESHOLD === "number" && Number.isFinite(raw.HIDE_THRESHOLD)
        ? Math.max(0.1, Math.min(0.99, raw.HIDE_THRESHOLD))
        : DEFAULT_THRESHOLD,
    KEYWORDS: typeof raw.KEYWORDS === "string" ? raw.KEYWORDS : DEFAULT_KEYWORDS,
    KEYWORDS_FILTER_ENABLED:
      typeof raw.KEYWORDS_FILTER_ENABLED === "boolean" ? raw.KEYWORDS_FILTER_ENABLED : true,
    LIKE_THRESHOLD:
      typeof raw.LIKE_THRESHOLD === "number" && Number.isFinite(raw.LIKE_THRESHOLD)
        ? Math.max(0, raw.LIKE_THRESHOLD)
        : null,
    LIKES_FILTER_ENABLED: raw.LIKES_FILTER_ENABLED === true,
  };
}

export async function loadSettings(): Promise<Settings> {
  return normalizeSettings(await chrome.storage.local.get(Object.keys(defaultSettings)));
}

export function onSettingsChanged(callback: (settings: Settings) => void): () => void {
  const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area === "local" && Object.keys(changes).some((key) => key in defaultSettings)) {
      void loadSettings().then(callback);
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
