interface Settings {
  IS_ACTIVE: boolean;
  LIKE_THRESHOLD: number | null;
  CONTENT_PROMPT: string;
  LLM_BYPASS: boolean;
  HIDE_VIDEOS: boolean;
  HIDE_PHOTOS: boolean;
  GENERATED_CHECKLIST: Array<{
    pattern: string;
    description: string;
  }>;
  ENDPOINT_TYPE: string;
  MODEL: string;
  API_KEY: string;
  API_ENDPOINT: string;
}

export default defineContentScript({
  matches: ["https://twitter.com/*", "https://x.com/*"],
  main() {
    let settings: Settings = {
      IS_ACTIVE: false,
      LIKE_THRESHOLD: null,
      CONTENT_PROMPT: '',
      LLM_BYPASS: false,
      HIDE_VIDEOS: false,
      HIDE_PHOTOS: false,
      GENERATED_CHECKLIST: [],
      ENDPOINT_TYPE: '',
      MODEL: '',
      API_KEY: '',
      API_ENDPOINT: ''
    };

    console.log('Content script loaded');

    // Load settings
    function loadSettings() {
      chrome.storage.local.get([
        'IS_ACTIVE',
        'LIKE_THRESHOLD',
        'CONTENT_PROMPT',
        'LLM_BYPASS',
        'HIDE_VIDEOS',
        'HIDE_PHOTOS',
        'GENERATED_CHECKLIST',
        'ENDPOINT_TYPE',
        'MODEL',
        'API_KEY',
        'API_ENDPOINT'
      ], (result) => {
        settings = { ...settings, ...result };
        console.log('Settings loaded:', settings);
      });
    }

    // Listen for settings changes
    chrome.storage.onChanged.addListener((changes) => {
      for (const [key, { newValue }] of Object.entries(changes)) {
        if (key in settings) {
          (settings as any)[key] = newValue;
        }
      }
      console.log('Settings updated:', settings);
    });

    // Initial load
    loadSettings();

    function checkTweetAgainstPatterns(text: string): boolean {
      if (!settings.GENERATED_CHECKLIST.length) return false;
      
      return settings.GENERATED_CHECKLIST.some(({ pattern }) => {
        try {
          const regex = new RegExp(pattern, 'i');
          return regex.test(text);
        } catch (e) {
          console.error('Invalid regex pattern:', pattern, e);
          return false;
        }
      });
    }

    async function checkTweetContent(text: string): Promise<boolean> {
      try {
        if (settings.ENDPOINT_TYPE === 'local') {
          const response = await fetch('http://localhost:11434/api/generate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: settings.MODEL || 'gpt-4o-mini',
              prompt: `Based on this filtering criteria: "${settings.CONTENT_PROMPT}", should this tweet be hidden? Reply with just "yes" or "no".\n\nTweet: "${text}"`,
              stream: false
            })
          });

          const data = await response.json();
          return data.response.toLowerCase().includes('yes');
        } else if (settings.ENDPOINT_TYPE === 'openai') {
          const response = await fetch('https://api.openai.com/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${settings.API_KEY}`
            },
            body: JSON.stringify({
              model: settings.MODEL || 'gpt-3.5-turbo',
              messages: [
                {
                  role: 'system',
                  content: 'You are a content filter. Reply with just "yes" or "no".'
                },
                {
                  role: 'user',
                  content: `Based on this filtering criteria: "${settings.CONTENT_PROMPT}", should this tweet be hidden?\n\nTweet: "${text}"`
                }
              ],
              temperature: 0.7,
              max_tokens: 1
            })
          });

          const data = await response.json();
          return data.choices[0].message.content.toLowerCase().includes('yes');
        } else {
          // Custom endpoint
          const response = await fetch(settings.API_ENDPOINT, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(settings.API_KEY && { 'Authorization': `Bearer ${settings.API_KEY}` })
            },
            body: JSON.stringify({
              model: settings.MODEL || 'gpt-4o-mini',
              messages: [
                {
                  role: 'system',
                  content: 'You are a content filter. Reply with just "yes" or "no".'
                },
                {
                  role: 'user',
                  content: `Based on this filtering criteria: "${settings.CONTENT_PROMPT}", should this tweet be hidden?\n\nTweet: "${text}"`
                }
              ]
            })
          });

          const data = await response.json();
          return data.choices?.[0]?.message?.content?.toLowerCase().includes('yes') || false;
        }
      } catch (e) {
        console.error('Failed to check tweet content:', e);
        return false;
      }
    }

    function shouldHideTweet(tweet: HTMLElement): Promise<{ should: boolean; reason: string }> {
      // Get tweet text and metadata
      const tweetText = tweet.querySelector('[data-testid="tweetText"]')?.textContent || '';
      const likeButton = tweet.querySelector('[data-testid="like"]');
      const likeCount = parseInt(likeButton?.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0', 10);
      const hasVideo = tweet.querySelector('video, [data-testid="videoPlayer"]') !== null;
      const hasPhoto = tweet.querySelector('img[alt="Image"], [data-testid="image-container"]') !== null;
      const photoCaption = hasPhoto ? tweet.querySelector('img[alt="Image"]')?.getAttribute('alt') || '' : '';

      console.log('Checking tweet:', {
        text: tweetText,
        likeCount,
        hasVideo,
        hasPhoto,
        photoCaption,
        settings
      });

      // Quick checks first
      if (settings.HIDE_VIDEOS && hasVideo) {
        return Promise.resolve({ should: true, reason: 'Contains video' });
      }

      if (settings.HIDE_PHOTOS && hasPhoto && photoCaption) {
        return Promise.resolve({ should: true, reason: 'Contains photo with caption' });
      }

      if (settings.LIKE_THRESHOLD && likeCount > settings.LIKE_THRESHOLD) {
        return Promise.resolve({ should: true, reason: `Like count (${likeCount}) exceeds threshold` });
      }

      // Check against regex patterns first
      if (checkTweetAgainstPatterns(tweetText)) {
        return Promise.resolve({ should: true, reason: 'Matched regex pattern' });
      }

      // If not bypassing LLM and content prompt exists, check with AI
      if (!settings.LLM_BYPASS && settings.CONTENT_PROMPT) {
        return checkTweetContent(tweetText)
          .then(should => ({ should, reason: 'AI content filter' }));
      }

      return Promise.resolve({ should: false, reason: '' });
    }

    function processTweet(tweet: Element) {
      if (!settings.IS_ACTIVE || !(tweet instanceof HTMLElement)) {
        console.log('Skipping tweet processing:', { isActive: settings.IS_ACTIVE, isHtmlElement: tweet instanceof HTMLElement });
        return;
      }

      const tweetId = tweet.getAttribute('data-tweet-id') || tweet.querySelector('time')?.parentElement?.getAttribute('href')?.split('/').pop() || '';
      
      if (!tweetId) {
        console.log('No tweet ID found');
        return;
      }

      console.log('Processing tweet:', { id: tweetId });
      
      shouldHideTweet(tweet).then(({ should, reason }) => {
        if (should) {
          console.log('Hiding tweet:', { id: tweetId, reason });
          tweet.style.display = 'none';
          
          // Notify background script
          chrome.runtime.sendMessage({
            type: 'TWEET_BLOCKED',
            tweet: {
              id: tweetId,
              text: tweet.textContent || '',
            },
            reason
          }, (response) => {
            if (chrome.runtime.lastError) {
              console.error('Error saving blocked tweet:', chrome.runtime.lastError);
            } else if (!response?.success) {
              console.error('Failed to save blocked tweet');
            } else {
              console.log('Successfully saved blocked tweet');
            }
          });
        } else {
          console.log('Tweet passed filters:', { id: tweetId });
        }
      });
    }

    function processExistingTweets() {
      console.log('Processing existing tweets');
      const tweets = document.querySelectorAll('article[data-testid="tweet"], div[data-testid="cellInnerDiv"] article');
      console.log('Found tweets:', tweets.length);
      tweets.forEach(processTweet);
    }

    function setupObserver() {
      console.log('Setting up observer');
      const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node instanceof Element) {
              if (node.matches('article[data-testid="tweet"], div[data-testid="cellInnerDiv"] article')) {
                processTweet(node);
              }
              // Check for tweets within added node
              const tweets = node.querySelectorAll('article[data-testid="tweet"], div[data-testid="cellInnerDiv"] article');
              tweets.forEach(processTweet);
            }
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });
      console.log('Observer started');
    }

    // Wait for document to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded');
        processExistingTweets();
        setupObserver();
      });
    } else {
      console.log('DOM already loaded');
      processExistingTweets();
      setupObserver();
    }
  }
});