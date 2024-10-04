// @ts-nocheck
export default defineContentScript({
  matches: ["*://*.x.com/*"],
  main() {
    const description = "politics, sexual content, immigration and rage bait"

    // Function to check for new posts on the page
    async function checkForNewPosts() {
      // Early check for API key
      const apiKey = await getGroqApiKey();
      if (!apiKey) {
        console.error("No API key provided. Aborting analysis.");
        return;
      }

      const posts = document.querySelectorAll('[data-testid="cellInnerDiv"]');

      for (const post of posts) {
        const tweetArticle = post.querySelector('article[data-testid="tweet"]');
        if (!tweetArticle) continue;

        const postId = Array.from(tweetArticle.querySelectorAll("a"))
          .find((a) => a.href.includes("/status/"))
          ?.href.split("/")
          .find((part, index, array) => array[index - 1] === "status");
        const postTextElement = tweetArticle.querySelector(
          '[data-testid="tweetText"]',
        );
        const postText = postTextElement
          ? postTextElement.innerText.trim()
          : "";

        if (postId) {
          const analysis = await analyzeTweet(postText, apiKey);
          applyPostVisibility(postId, analysis);
        }
      }
    }

    // Function to get cached analysis
    async function getCachedAnalysis(postId) {
      return new Promise((resolve) => {
        chrome.storage.local.get([`analysis_${postId}`], (result) => {
          resolve(result[`analysis_${postId}`] || null);
        });
      });
    }

    // Function to cache analysis
    async function cacheAnalysis(postId, analysis) {
      return new Promise((resolve) => {
        chrome.storage.local.set({[`analysis_${postId}`]: analysis}, resolve);
      });
    }

    // Function to apply post visibility based on analysis
    function applyPostVisibility(postId, analysis) {
      if (analysis !== null) {
        const shouldHide = analysis.probability < 0.5;

        if (shouldHide) {
          const postElement = findPostElement(postId);
          if (postElement) {
            if (postElement.style.display !== "none") {
              postElement.style.display = "none";
              const tweetUrl = `https://x.com/user/status/${postId}`;
              const tweetText =
                postElement
                  .querySelector('[data-testid="tweetText"]')
                  ?.innerText.trim() || "Text not found";
              console.log(`Post ${postId} hidden due to high scores:`);
              console.log(`Tweet URL: ${tweetUrl}`);
              console.log(`Tweet Text: ${tweetText}`);
            }
          } else {
            console.log(`Could not find element for post ${postId} to hide`);
          }
        }
      } else {
        console.log(`Skipping post ${postId} due to invalid analysis result`);
      }
    }

    // Function to find the div element containing a specific post ID
    function findPostElement(postId) {
      if (typeof postId !== "string") {
        throw new Error("postId must be a string");
      }
      const cellInnerDivs = document.querySelectorAll(
        '[data-testid="cellInnerDiv"]',
      );
      for (const div of cellInnerDivs) {
        const link = div.querySelector(`a[href*="/status/${postId}"]`);
        if (link) {
          return div;
        }
      }

      return null; // Return null if no matching element is found
    }

    window.findPostElement = findPostElement;

    // Function to reset the cache (seenPostIds and analysis results)
    function resetCache() {
      chrome.storage.local.get(null, (items) => {
        const allKeys = Object.keys(items);
        const analysisKeys = allKeys.filter((key) =>
          key.startsWith("analysis_"),
        );
        chrome.storage.local.remove(analysisKeys, () => {
          console.log("Cache (analysis results) has been reset.");
        });
      });
    }

    // Make resetCache function available in the global scope
    window.resetCache = resetCache;

    console.log("Welcome to tweet blocker");

    // Function to analyze a tweet using the Groq API
    async function analyzeTweet(tweetText, apiKey) {
      let retries = 0;
      const maxRetries = 3;
      const messages = [
        {
          role: "system",
          content: `Your task is to evaluate Tweets/X posts. Always respond with JSON. The user provides the following description of what they don't like: ${description}. Answer with a probability of the user liking the tweet, in the following format: {probability: NUMBER}. The probability should be a number between 0 and 1. Example response: {probability: 0.5}`,
        },
        {
          role: "user",
          content: "Tweet: " + tweetText,
        },
      ];
      console.log('analyzing tweet');
      while (retries < maxRetries) {
        try {
          const response = await fetch(
            "http://localhost:11434/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ollama`,
              },
              body: JSON.stringify({
                messages: messages,
                model: "llama3.2:3b-instruct-q8_0",
                temperature: 1,
                max_tokens: 1024,
                top_p: 1,
                stream: false,
                response_format: {
                  type: "json_object",
                },
                stop: null,
              }),
            },
          );

          if (response.status === 400) {
            retries++;
            continue;
          }

          const data = await response.json();
          return JSON.parse(data.choices[0].message.content);
        } catch (error) {
          retries++;
          if (retries === maxRetries) {
            console.error("Max retries reached. Returning empty object.");
            return {};
          }
        }
      }

      return {};
    }

    // Function to get or set the Groq API key
    async function getGroqApiKey() {
      return new Promise((resolve) => {
        chrome.storage.local.get(["GROQ_API_KEY"], (result) => {
          if (result.GROQ_API_KEY) {
            resolve(result.GROQ_API_KEY);
          } else {
            const apiKey = prompt("Please enter your Groq API key:");
            if (apiKey) {
              chrome.storage.local.set({GROQ_API_KEY: apiKey}, () => {
                resolve(apiKey);
              });
            } else {
              resolve(null);
            }
          }
        });
      });
    }

    // Debounce function to limit how often the scroll event fires
    function debounce(func, delay) {
      let timeoutId;
      return function (...args) {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => func.apply(this, args), delay);
      };
    }

    // Create debounced version of checkForNewPosts
    const debouncedCheck = debounce(checkForNewPosts, 300);

    // Modify the scroll event listener to call checkForNewPosts
    window.addEventListener("scroll", () => {
      if (window.location.hostname === "x.com") {
        debouncedCheck();
      }
    });

    // Initial check when the page loads
    if (window.location.hostname === "x.com") {
      checkForNewPosts();
    }
  },
});
