console.log("Service worker started.");

// Save the API key securely
chrome.storage.sync.set({ youtubeApiKey: 'YOUR_API_KEY' }, () => {
  console.log('API Key saved.');
});

// Initialize the extension on startup
chrome.runtime.onStartup.addListener(() => {
  console.log("Extension started.");
  initializeExtension();
});

// Initialize the extension on installation
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed.");
  initializeExtension();
});

// Initialize the extension
function initializeExtension() {
  // Set up message listeners
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'getState') {
      sendResponse({ active: true, lastUpdate: new Date() });
    }
  });

  // Inject content script into YouTube pages
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.url?.includes('youtube.com')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        });
      }
    });
  });

  // Set up periodic tasks (if alarms API is available)
  if (chrome.alarms) {
    chrome.alarms.create('refreshData', {
      periodInMinutes: 60
    });
  } else {
    console.error('chrome.alarms API is not available.');
  }

  // Initialize storage or settings
  chrome.storage.local.get(['settings'], (result) => {
    if (!result.settings) {
      chrome.storage.local.set({ settings: {} });
    }
  });
}

// Optional: Listen for runtime messages (if needed in the future)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXAMPLE_MESSAGE') {
    console.log('Received message:', message);
    sendResponse({ success: true });
  }
});