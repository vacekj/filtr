interface GeneratedPattern {
  pattern: string;
  description: string;
}

interface BlockedTweet {
  id: string;
  text: string;
  timestamp: number;
  reason: string;
}

export default defineBackground({
  main() {
    let blockedCount = 0;
    let blockedTweets: BlockedTweet[] = [];

    // Initialize from storage
    chrome.storage.local.get(['BLOCKED_COUNT', 'BLOCKED_TWEETS'], (result) => {
      blockedCount = result.BLOCKED_COUNT || 0;
      blockedTweets = result.BLOCKED_TWEETS || [];
      console.log('Initialized blocked tweets:', { blockedCount, tweetsLength: blockedTweets.length });
    });

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Received message:', message);

      if (message.type === 'TWEET_BLOCKED') {
        const newTweet: BlockedTweet = {
          id: message.tweet.id,
          text: message.tweet.text,
          timestamp: Date.now(),
          reason: message.reason
        };

        // Update in-memory state
        blockedCount++;
        blockedTweets = [newTweet, ...blockedTweets].slice(0, 100);

        // Update storage
        chrome.storage.local.set({
          BLOCKED_COUNT: blockedCount,
          BLOCKED_TWEETS: blockedTweets
        }, () => {
          if (chrome.runtime.lastError) {
            console.error('Error saving blocked tweet:', chrome.runtime.lastError);
          } else {
            console.log('Saved blocked tweet:', { 
              newCount: blockedCount, 
              tweetsLength: blockedTweets.length,
              lastTweet: newTweet 
            });
          }
        });

        // Send response to confirm save
        sendResponse({ success: true });
        return true;
      }
    });
  }
});
