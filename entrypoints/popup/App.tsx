import React, { useState, useEffect, useCallback } from "react";
import { debounce } from "es-toolkit";
import {
  Box,
  VStack,
  Input,
  Textarea,
  Button,
  Switch,
  FormControl,
  FormLabel,
  useToast,
  Alert,
  AlertIcon,
  Select,
  InputGroup,
  InputRightElement,
  IconButton,
  Stat,
  StatLabel,
  StatNumber,
  StatGroup,
  Divider,
  Text,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Checkbox,
  Stack,
  NumberInput,
  NumberInputField,
  NumberInputStepper,
  NumberIncrementStepper,
  NumberDecrementStepper,
  Link,
} from "@chakra-ui/react";
import { ViewIcon, ViewOffIcon } from "@chakra-ui/icons";

type EndpointType = "local" | "openai" | "remote";
type StorageData = {
  IS_ACTIVE?: boolean;
  LIKE_THRESHOLD?: number | null;
  CONTENT_PROMPT?: string;
  KEYWORDS?: string;
  ENDPOINT_TYPE?: EndpointType;
  API_ENDPOINT?: string;
  API_KEY?: string;
  MODEL?: string;
  BLOCKED_COUNT?: number;
  BLOCKED_TWEETS?: Array<{
    id: string;
    text: string;
    timestamp: number;
    reason: string;
  }>;
  LIKES_FILTER_ENABLED?: boolean;
  KEYWORDS_FILTER_ENABLED?: boolean;
  AI_FILTER_ENABLED?: boolean;
};

interface ToastParams {
  title: string;
  description: string;
  status?: string;
  duration?: number;
}

export const useDebounceToast = (delay = 1000) => {
  const toast = useToast();
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedToast = useCallback(
    ({
      title,
      description,
      status = "success",
      duration = 3000,
    }: ToastParams) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        toast({
          title,
          description,
          duration,
        });
      }, delay);
    },
    [toast, delay]
  );

  return debouncedToast;
};

function App() {
  // Extension state
  const [isActive, setIsActive] = useState<boolean>(true);

  // Filter states
  const [likesFilterEnabled, setLikesFilterEnabled] = useState<boolean>(true);
  const [keywordsFilterEnabled, setKeywordsFilterEnabled] =
    useState<boolean>(false);
  const [aiFilterEnabled, setAiFilterEnabled] = useState<boolean>(false);

  // Filter settings
  const [likeThreshold, setLikeThreshold] = useState<string>("10000");
  const [keywords, setKeywords] = useState<string>("");
  const [contentPrompt, setContentPrompt] = useState<string>("");

  // AI endpoint settings
  const [endpointType, setEndpointType] = useState<EndpointType>("local");
  const [apiEndpoint, setApiEndpoint] = useState<string>(
    "http://localhost:11434"
  );
  const [apiKey, setApiKey] = useState<string>("");
  const [showApiKey, setShowApiKey] = useState<boolean>(false);
  const [model, setModel] = useState<string>("gpt-4o-mini");

  // Stats
  const [blockedCount, setBlockedCount] = useState<number>(0);
  const [blockedTweets, setBlockedTweets] = useState<
    Array<{
      id: string;
      text: string;
      timestamp: number;
      reason: string;
    }>
  >([]);

  const [isError, setIsError] = useState<boolean>(false);
  const toast = useDebounceToast();

  useEffect(() => {
    chrome.storage.local.get(
      [
        "IS_ACTIVE",
        "LIKE_THRESHOLD",
        "CONTENT_PROMPT",
        "KEYWORDS",
        "ENDPOINT_TYPE",
        "API_ENDPOINT",
        "API_KEY",
        "MODEL",
        "BLOCKED_COUNT",
        "BLOCKED_TWEETS",
        "LIKES_FILTER_ENABLED",
        "KEYWORDS_FILTER_ENABLED",
        "AI_FILTER_ENABLED",
      ],
      (result: StorageData) => {
        setIsActive(result.IS_ACTIVE ?? true);
        setLikeThreshold(result.LIKE_THRESHOLD?.toString() || "10000");
        setContentPrompt(result.CONTENT_PROMPT || "");
        setKeywords(result.KEYWORDS || "");
        setEndpointType((result.ENDPOINT_TYPE || "local") as EndpointType);
        setApiEndpoint(result.API_ENDPOINT || "http://localhost:11434");
        setApiKey(result.API_KEY || "");
        setModel(result.MODEL || "gpt-4o-mini");
        setBlockedCount(result.BLOCKED_COUNT || 0);
        setBlockedTweets(result.BLOCKED_TWEETS || []);
        setLikesFilterEnabled(result.LIKES_FILTER_ENABLED ?? true);
        setKeywordsFilterEnabled(result.KEYWORDS_FILTER_ENABLED || false);
        setAiFilterEnabled(result.AI_FILTER_ENABLED || false);

        // Ensure default settings are saved if not present
        if (
          result.IS_ACTIVE === undefined ||
          result.LIKES_FILTER_ENABLED === undefined
        ) {
          saveSettings({
            IS_ACTIVE: true,
            LIKES_FILTER_ENABLED: true,
            LIKE_THRESHOLD: 10000,
          });
        }
      }
    );
  }, []);

  const handleReset = (): void => {
    chrome.storage.local.remove(
      [
        "IS_ACTIVE",
        "LIKE_THRESHOLD",
        "CONTENT_PROMPT",
        "KEYWORDS",
        "ENDPOINT_TYPE",
        "API_ENDPOINT",
        "API_KEY",
        "MODEL",
        "BLOCKED_COUNT",
        "BLOCKED_TWEETS",
        "LIKES_FILTER_ENABLED",
        "KEYWORDS_FILTER_ENABLED",
        "AI_FILTER_ENABLED",
      ],
      () => {
        setIsActive(true);
        setLikeThreshold("10000");
        setContentPrompt("");
        setKeywords("");
        setEndpointType("local");
        setApiEndpoint("http://localhost:11434");
        setApiKey("");
        setModel("gpt-4o-mini");
        setBlockedCount(0);
        setBlockedTweets([]);
        setLikesFilterEnabled(true);
        setKeywordsFilterEnabled(false);
        setAiFilterEnabled(false);
        toast({
          title: "Settings reset",
          description: "All settings have been reset to default",
          status: "info",
          duration: 2000,
        });
      }
    );
  };

  const saveSettings = useCallback((updates: StorageData) => {
    chrome.storage.local.set(updates);
    toast({
      title: "Settings saved",
      description: "Your changes have been saved",
      status: "success",
      duration: 2000,
    });
  }, []);

  return (
    <Box
      minW="500px"
      w="max-content"
      p={6}
      maxW="md"
      mx="auto"
      fontFamily="'Inter', sans-serif"
    >
      <VStack spacing={6} align="stretch">
        {/* Header */}
        <Box pb={4} borderBottomWidth={1}>
          <Text fontSize="xl" fontWeight="600" textAlign="left">
            Filtr
          </Text>
          <Text mt={2} fontSize="sm" color="gray.600">
            A powerful content filter for X.com that helps you curate your feed
            using likes, keywords, and AI-powered filtering.
          </Text>
        </Box>

        <Box>
          <FormControl
            display="flex"
            alignItems="center"
            justifyContent="space-between"
          >
            <Box>
              <FormLabel htmlFor="active-switch" mb={0}>
                {isActive ? "Active" : "Inactive"}
              </FormLabel>
              <Text fontSize="sm" color="gray.600">
                Enable or disable all filtering
              </Text>
            </Box>
            <Switch
              id="active-switch"
              isChecked={isActive}
              onChange={(e) => {
                setIsActive(e.target.checked);
                saveSettings({ IS_ACTIVE: e.target.checked });
              }}
              colorScheme="blue"
            />
          </FormControl>
        </Box>

        <Divider />

        {/* Likes Filter */}
        <FormControl>
          <FormControl display="flex" alignItems="center" mb={2}>
            <Box flex="1">
              <FormLabel htmlFor="likes-filter-switch" mb={0}>
                Likes Filter
              </FormLabel>
              <Text fontSize="sm" color="gray.600">
                Hide tweets with likes above the threshold. Useful for filtering
                out popular tweets.
              </Text>
            </Box>
            <Switch
              id="likes-filter-switch"
              isChecked={likesFilterEnabled}
              onChange={(e) => {
                setLikesFilterEnabled(e.target.checked);
                saveSettings({ LIKES_FILTER_ENABLED: e.target.checked });
              }}
              colorScheme="blue"
            />
          </FormControl>
          {likesFilterEnabled && (
            <NumberInput
              value={likeThreshold}
              onChange={(value) => {
                setLikeThreshold(value);
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue)) {
                  saveSettings({ LIKE_THRESHOLD: numValue });
                }
              }}
              min={0}
              step={1000}
            >
              <NumberInputField placeholder="Enter like threshold" />
              <NumberInputStepper>
                <NumberIncrementStepper />
                <NumberDecrementStepper />
              </NumberInputStepper>
            </NumberInput>
          )}
        </FormControl>

        {/* Keywords Filter */}
        <FormControl>
          <FormControl display="flex" alignItems="center" mb={2}>
            <Box flex="1">
              <FormLabel htmlFor="keywords-filter-switch" mb={0}>
                Keywords Filter
              </FormLabel>
              <Text fontSize="sm" color="gray.600">
                Hide tweets containing specific keywords or phrases
              </Text>
            </Box>
            <Switch
              id="keywords-filter-switch"
              isChecked={keywordsFilterEnabled}
              onChange={(e) => {
                setKeywordsFilterEnabled(e.target.checked);
                saveSettings({ KEYWORDS_FILTER_ENABLED: e.target.checked });
              }}
              colorScheme="blue"
            />
          </FormControl>
          {keywordsFilterEnabled && (
            <Input
              value={keywords}
              onChange={(e) => {
                setKeywords(e.target.value);
                saveSettings({ KEYWORDS: e.target.value });
              }}
              placeholder="Enter keywords, separated by commas"
            />
          )}
        </FormControl>

        {/* AI Filter */}
        <FormControl>
          <FormControl display="flex" alignItems="center" mb={2}>
            <Box flex="1">
              <FormLabel htmlFor="ai-filter-switch" mb={0}>
                AI Filter
              </FormLabel>
              <Text fontSize="sm" color="gray.600">
                Use AI to intelligently filter tweets based on content.
              </Text>
            </Box>
            <Switch
              id="ai-filter-switch"
              isChecked={aiFilterEnabled}
              onChange={(e) => {
                setAiFilterEnabled(e.target.checked);
                saveSettings({ AI_FILTER_ENABLED: e.target.checked });
              }}
              colorScheme="blue"
            />
          </FormControl>
          {aiFilterEnabled && (
            <>
              <FormControl>
                <FormLabel>LLM Endpoint</FormLabel>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Choose your AI model provider
                </Text>
                <Select
                  value={endpointType}
                  onChange={(e) => {
                    const value = e.target.value as EndpointType;
                    setEndpointType(value);
                    let defaultEndpoint =
                      value === "local"
                        ? "http://localhost:11434"
                        : value === "openai"
                        ? "https://api.openai.com/v1"
                        : "";
                    setApiEndpoint(defaultEndpoint);
                    saveSettings({
                      ENDPOINT_TYPE: value,
                      API_ENDPOINT: defaultEndpoint,
                    });
                  }}
                >
                  <option value="local">Local (Ollama)</option>
                  <option value="openai">OpenAI</option>
                  <option value="remote">Custom Endpoint</option>
                </Select>
              </FormControl>

              <FormControl mt={4}>
                <FormLabel>Model</FormLabel>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Specify which AI model to use
                </Text>
                <Input
                  value={model}
                  onChange={(e) => {
                    setModel(e.target.value);
                    saveSettings({ MODEL: e.target.value });
                  }}
                  placeholder="Enter model name"
                />
              </FormControl>

              {endpointType !== "local" && (
                <FormControl mt={4}>
                  <FormLabel>API Key</FormLabel>
                  <InputGroup>
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => {
                        setApiKey(e.target.value);
                        saveSettings({ API_KEY: e.target.value });
                      }}
                      placeholder="Enter API key"
                    />
                    <InputRightElement>
                      <IconButton
                        aria-label={
                          showApiKey ? "Hide API key" : "Show API key"
                        }
                        icon={showApiKey ? <ViewIcon /> : <ViewOffIcon />}
                        onClick={() => setShowApiKey(!showApiKey)}
                        variant="ghost"
                        size="sm"
                      />
                    </InputRightElement>
                  </InputGroup>
                </FormControl>
              )}

              {endpointType === "remote" && (
                <FormControl mt={4}>
                  <FormLabel>API Endpoint URL</FormLabel>
                  <Input
                    value={apiEndpoint}
                    onChange={(e) => {
                      setApiEndpoint(e.target.value);
                      saveSettings({ API_ENDPOINT: e.target.value });
                    }}
                    placeholder="https://api.example.com"
                  />
                </FormControl>
              )}

              <FormControl mt={4}>
                <FormLabel>Content Filter Prompt</FormLabel>
                <Text fontSize="sm" color="gray.600" mb={2}>
                  Describe what content you want to see and what to filter out,
                  in natural language.
                </Text>
                <Textarea
                  value={contentPrompt}
                  onChange={(e) => {
                    setContentPrompt(e.target.value);
                    saveSettings({ CONTENT_PROMPT: e.target.value });
                  }}
                  placeholder="I want tweets about AI and deep tech, I don't want tweets about politics and drama."
                  rows={4}
                />
              </FormControl>
            </>
          )}
        </FormControl>

        <Divider />

        {/* Stats */}
        <StatGroup>
          <Stat>
            <StatLabel>Tweets Blocked</StatLabel>
            <StatNumber>{blockedCount}</StatNumber>
          </Stat>
        </StatGroup>

        {/* Blocked Tweets */}
        <Accordion allowToggle>
          <AccordionItem>
            <h2>
              <AccordionButton>
                <Box flex="1" textAlign="left">
                  View Blocked Tweets
                </Box>
                <AccordionIcon />
              </AccordionButton>
            </h2>
            <AccordionPanel>
              {blockedTweets.length > 0 ? (
                <VStack align="stretch" spacing={4}>
                  {blockedTweets.map((tweet) => (
                    <Box
                      key={tweet.id}
                      p={2}
                      borderWidth="1px"
                      borderRadius="md"
                    >
                      <Link
                        href={`https://twitter.com/i/web/status/${tweet.id}`}
                        isExternal
                        color="blue.500"
                        _hover={{ textDecoration: "none" }}
                      >
                        <Box
                          p={2}
                          borderRadius="md"
                          transition="background 0.2s"
                          _hover={{ bg: "gray.50" }}
                        >
                          <Text fontSize="sm">{tweet.text}</Text>
                          <Text fontSize="xs" color="gray.500">
                            Blocked:{" "}
                            {new Date(tweet.timestamp).toLocaleString()}
                          </Text>
                          <Text fontSize="xs" color="gray.500">
                            Reason: {tweet.reason}
                          </Text>
                        </Box>
                      </Link>
                    </Box>
                  ))}
                  <Button
                    size="sm"
                    colorScheme="red"
                    variant="ghost"
                    onClick={() => {
                      setBlockedTweets([]);
                      setBlockedCount(0);
                      saveSettings({
                        BLOCKED_TWEETS: [],
                        BLOCKED_COUNT: 0,
                      });
                    }}
                  >
                    Clear History
                  </Button>
                </VStack>
              ) : (
                <Text color="gray.500">No blocked tweets yet</Text>
              )}
            </AccordionPanel>
          </AccordionItem>
        </Accordion>

        {/* Reset button */}
        <Box pt={4}>
          <Button
            type="button"
            onClick={handleReset}
            colorScheme="red"
            variant="ghost"
          >
            Reset Settings
          </Button>
        </Box>

        {/* Footer */}
        <Box pt={6} borderTopWidth={1}>
          <Text fontSize="sm" color="gray.500" textAlign="center">
            © forever Atris ·{" "}
            <Link href="https://atris.cc" isExternal color="blue.500">
              atris.cc
            </Link>
          </Text>
        </Box>

        {isError && (
          <Alert status="error">
            <AlertIcon />
            Please enter a valid positive number for the threshold
          </Alert>
        )}
      </VStack>
    </Box>
  );
}

export default App;
