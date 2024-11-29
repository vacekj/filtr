import type { Settings } from './settings';
import { checkKeywords, checkLikes, checkAI } from './filters';

export interface Tweet {
  id: string;
  text: string;
  element: HTMLElement;
  likeCount: number;
}

export function extractTweetData(element: HTMLElement): Tweet | null {
  const tweetId = element.getAttribute('data-tweet-id') || 
                 element.querySelector('time')?.parentElement?.getAttribute('href')?.split('/').pop();
  
  if (!tweetId) {
    console.log('No tweet ID found');
    return null;
  }

  const tweetText = element.querySelector('[data-testid="tweetText"]')?.textContent || '';
  const likeButton = element.querySelector('[data-testid="like"]');
  const likeCount = parseInt(likeButton?.getAttribute('aria-label')?.match(/\d+/)?.[0] || '0', 10);

  return {
    id: tweetId,
    text: tweetText,
    element,
    likeCount
  };
}

export async function processTweet(tweet: Tweet, settings: Settings): Promise<void> {
  if (!settings.IS_ACTIVE) {
    console.log('Processing skipped: extension inactive');
    return;
  }

  console.log('Processing tweet:', { id: tweet.id });

  // Check keywords first (fastest)
  const keywordResult = checkKeywords(tweet.text, settings);
  if (keywordResult.should) {
    hideTweet(tweet, keywordResult.reason);
    return;
  }

  // Then check like threshold
  const likeResult = checkLikes(tweet.likeCount, settings);
  if (likeResult.should) {
    hideTweet(tweet, likeResult.reason);
    return;
  }

  // Finally, check with AI if enabled
  const aiResult = await checkAI(tweet.text, settings);
  if (aiResult.should) {
    hideTweet(tweet, aiResult.reason);
    return;
  }

  console.log('Tweet passed all filters:', { id: tweet.id });
}

function hideTweet(tweet: Tweet, reason: string): void {
  console.log('Hiding tweet:', { id: tweet.id, reason });
  tweet.element.style.display = 'none';
  
  // Notify background script
  chrome.runtime.sendMessage({
    type: 'TWEET_BLOCKED',
    tweet: {
      id: tweet.id,
      text: tweet.text,
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
}

export function setupTweetObserver(settings: Settings): MutationObserver {
  console.log('Setting up tweet observer');
  
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node instanceof Element) {
          if (node instanceof HTMLElement && 
              node.matches('article[data-testid="tweet"], div[data-testid="cellInnerDiv"] article')) {
            const tweet = extractTweetData(node);
            if (tweet) {
              processTweet(tweet, settings);
            }
          }
          // Check for tweets within added node
          const tweetElements = node.querySelectorAll<HTMLElement>(
            'article[data-testid="tweet"], div[data-testid="cellInnerDiv"] article'
          );
          tweetElements.forEach(element => {
            const tweet = extractTweetData(element);
            if (tweet) {
              processTweet(tweet, settings);
            }
          });
        }
      }
    }
  });

  return observer;
}

export function processExistingTweets(settings: Settings): void {
  console.log('Processing existing tweets');
  const tweetElements = document.querySelectorAll<HTMLElement>(
    'article[data-testid="tweet"], div[data-testid="cellInnerDiv"] article'
  );
  console.log('Found tweets:', tweetElements.length);
  
  tweetElements.forEach(element => {
    const tweet = extractTweetData(element);
    if (tweet) {
      processTweet(tweet, settings);
    }
  });
} 