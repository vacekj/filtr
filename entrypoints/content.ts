import { loadSettings, onSettingsChanged } from '@/src/lib/settings';
import { setupTweetObserver, processExistingTweets } from '@/src/lib/tweetProcessor';

export default defineContentScript({
  matches: ["https://twitter.com/*", "https://x.com/*"],
  async main() {
    console.log('Content script loaded');

    // Load initial settings
    const settings = await loadSettings();
    console.log('Settings loaded:', settings);

    // Set up settings change listener
    const cleanup = onSettingsChanged((newSettings) => {
      Object.assign(settings, newSettings);
      console.log('Settings updated:', settings);
    });

    // Set up tweet observer
    const observer = setupTweetObserver(settings);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    console.log('Observer started');

    // Process existing tweets
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        console.log('DOM loaded');
        processExistingTweets(settings);
      });
    } else {
      console.log('DOM already loaded');
      processExistingTweets(settings);
    }

    // Cleanup when script is unloaded
    return () => {
      cleanup();
      observer.disconnect();
    };
  }
});