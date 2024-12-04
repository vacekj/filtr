import type { Settings } from './settings';

export interface FilterResult {
  should: boolean;
  reason: string;
}

export function checkKeywords(text: string, settings: Settings): FilterResult {
  if (!settings.KEYWORDS || !settings.KEYWORDS_FILTER_ENABLED) {
    return { should: false, reason: '' };
  }
  
  const keywords = settings.KEYWORDS.split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
  
  if (keywords.length === 0) {
    return { should: false, reason: '' };
  }

  const lowerText = text.toLowerCase();
  const matched = keywords.some(keyword => lowerText.includes(keyword));
  
  return {
    should: matched,
    reason: matched ? 'Matched keywords filter' : ''
  };
}

export function checkLikes(likeCount: number, settings: Settings): FilterResult {
  if (!settings.LIKES_FILTER_ENABLED || !settings.LIKE_THRESHOLD) {
    return { should: false, reason: '' };
  }

  const exceeded = likeCount > settings.LIKE_THRESHOLD;
  return {
    should: exceeded,
    reason: exceeded ? `Like count (${likeCount}) exceeds threshold` : ''
  };
}

export async function checkAI(text: string, settings: Settings): Promise<FilterResult> {
  if (!settings.AI_FILTER_ENABLED || !settings.CONTENT_PROMPT) {
    return { should: false, reason: '' };
  }

  try {
    if (settings.ENDPOINT_TYPE === 'local') {
      const response = await fetch('http://localhost:11434/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: settings.MODEL || 'gpt-4o-mini',
          prompt: `Does this tweet satisfy the following user preferences: "${settings.CONTENT_PROMPT}"
          ? Answer with a probability between 0 and 1. 0 if the tweet doesn't satisfy the preferences, 1 if it satisfies the user preferences.\n\nTweet: "${text}"`,
          stream: false
        })
      });

      const data = await response.json();
      return {
        should: data.response.toLowerCase().includes('yes'),
        reason: 'AI content filter'
      };
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
      return {
        should: data.choices[0].message.content.toLowerCase().includes('yes'),
        reason: 'AI content filter'
      };
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
      const should = data.choices?.[0]?.message?.content?.toLowerCase().includes('yes') || false;
      return {
        should,
        reason: should ? 'AI content filter' : ''
      };
    }
  } catch (e) {
    console.error('Failed to check tweet content:', e);
    return { should: false, reason: '' };
  }
} 