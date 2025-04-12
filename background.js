console.log("Service worker started.");

// Save the API key securely (Consider if this is the best place - maybe settings?)
chrome.storage.sync.set({
    youtubeApiKey: 'AIzaSyDBBQfrtsRQdnWyFZ9cZHp_JaC4GgeJ_Gs',
    geminiApiKey: 'AIzaSyAZfSRZqyGyN2WJbkHntge7KjVkwydhPX8'
}, () => {
    console.log('API Keys potentially updated in storage.'); // Changed log
});

// Initialize the extension on startup
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started.");
  // initializeExtension(); // Don't call initialize here, let onInstalled handle first setup
});

// Initialize the extension on installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log("Extension installed or updated:", details.reason);
  initializeExtensionSettings(); // Renamed function for clarity
});

// Function to set up initial settings and alarms
function initializeExtensionSettings() {
  console.log("Initializing extension settings...");

  // Set up periodic tasks (if alarms API is available)
  if (chrome.alarms) {
    chrome.alarms.create('refreshData', { // Example alarm
      periodInMinutes: 60
    });
    console.log("Alarm 'refreshData' created.");
  } else {
    console.error('chrome.alarms API is not available.');
  }

  // Initialize storage or settings if needed
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: {} }, () => {
        console.log("Initialized local storage settings.");
      });
    }
  });

  // REMOVE the old injection loop:
  // chrome.tabs.query({}, (tabs) => { ... });
}

// --- Inject content script on YouTube navigation ---
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the tab is fully loaded and the URL is a YouTube watch or shorts page
  if (changeInfo.status === 'complete' && tab.url &&
      (tab.url.includes('youtube.com/watch') || tab.url.includes('youtube.com/shorts'))) {

    console.log(`Injecting content script into tab ${tabId} (URL: ${tab.url})`);
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js'] // Inject content.js
      // Note: No 'type: "module"' needed here. If content.js uses import,
      // executeScript handles it correctly as long as the imported file
      // (config.js) is in web_accessible_resources.
    }).then(() => {
      console.log(`Successfully injected content script into tab ${tabId}`);
    }).catch((error) => {
      console.error(`Failed to inject content script into tab ${tabId}:`, error);
    });
  }
});

// Optional: Listen for runtime messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Background received message:", message.type || message.action); // Log message type/action

  if (message.action === 'getState') { // Example from original code
      sendResponse({ active: true, lastUpdate: new Date() });
      return true; // Indicate async response if needed elsewhere
  }
  // Handle other messages like 'VIDEO_INFO_ENHANCED' if the background needs them
  else if (message.type === 'VIDEO_INFO_ENHANCED') {
      console.log("Received enhanced video info:", message.data);
      // Process or store this data if needed
  }
  // Add other message handlers as required
});

console.log("Background script listeners set up.");