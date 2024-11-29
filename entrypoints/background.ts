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

    async function generatePatternsFromPrompt(prompt: string): Promise<GeneratedPattern[]> {
      const systemPrompt = `Given this content filtering prompt, generate a list of regex patterns to help filter content. 
      Return a JSON array where each item has 'pattern' (the regex pattern) and 'description' (what it matches). 
      Make patterns precise and practical. Example format:
      [{"pattern": "\\b(hate|angry|mad)\\b", "description": "Matches negative emotions"}]`;

      try {
        const response = await fetch('http://localhost:11434/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gpt-4-mini',
            prompt: `${systemPrompt}\n\nUser's filtering prompt: ${prompt}`,
            stream: false
          })
        });

        const data = await response.json();
        try {
          const patterns = JSON.parse(data.response) as GeneratedPattern[];
          return patterns;
        } catch (e) {
          console.error('Failed to parse patterns:', e);
          return [];
        }
      } catch (e) {
        console.error('Failed to generate patterns:', e);
        return [];
      }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      console.log('Received message:', message);

      if (message.type === 'GENERATE_CHECKLIST') {
        generatePatternsFromPrompt(message.prompt)
          .then(patterns => {
            sendResponse({ checklist: patterns });
          });
        return true;
      }

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
