// Global variable to store video categories
let videoCategories = { categories: {} };
let tabcontent = document.getElementsByClassName("tabcontent");

// Load video categories from videoCategories.json
fetch(chrome.runtime.getURL('videoCategories.json'))
    .then(response => response.json())
    .then(data => {
        console.log('Loaded Video Categories:', data);
        videoCategories = data;
    })
    .catch(error => {
        console.error('Error loading categories:', error);
        // Fallback to an empty object if loading fails
        videoCategories = { categories: {} };
    });

// Function to extract video information from YouTube
function getVideoInfo() {
    const videoTitle = document.querySelector('h1.title yt-formatted-string')?.textContent || 'Not available';
    const videoCategory = document.querySelector('.metadata-info .category span')?.textContent || 'Unknown';
    const videoClassification = '--'; // You can add logic to classify the video if needed
    return {
        title: videoTitle,
        category: videoCategory,
        classification: videoClassification
    };
}

// Timer Management Logic
let entertainmentTimer = 30 * 60; // 30 minutes in seconds
let gamingTimer = 15 * 60; // 15 minutes in seconds

// --- Define formatTime before updateTimerDisplay ---
function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) {
        return "00:00";
    }
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
// --- End formatTime definition ---

function updateTimerDisplay() {
    // --- Check if elements exist before updating ---
    const doomscrollingTimerElement = document.getElementById('doomscrolling-timer');
    // Assuming you might add a gaming timer element later with id 'gaming-timer'
    // const gamingTimerElement = document.getElementById('gaming-timer');

    if (doomscrollingTimerElement) {
        // Use the correct variable name if 'entertainmentTimer' is meant for doomscrolling
        doomscrollingTimerElement.textContent = formatTime(entertainmentTimer);
        // Update progress bar (assuming 30 mins = 1800 seconds is the max)
        const doomscrollingProgress = document.getElementById('doomscrolling-progress');
        if (doomscrollingProgress) {
            doomscrollingProgress.value = (entertainmentTimer / (30 * 60)) * 100;
        }
    }
    // if (gamingTimerElement) {
    //     gamingTimerElement.textContent = formatTime(gamingTimer);
    // }
    // --- End element check ---
}

chrome.storage.sync.set({
    youtubeApiKey: 'AIzaSyDBBQfrtsRQdnWyFZ9cZHp_JaC4GgeJ_Gs',
    geminiApiKey: 'AIzaSyAZfSRZqyGyN2WJbkHntge7KjVkwydhPX8' // Also save Gemini key if needed globally
}, () => {
    console.log('API Keys potentially updated in storage.');
});

chrome.storage.sync.get(['youtubeApiKey', 'geminiApiKey'], (result) => { // Get both keys
    console.log('Storage result:', result);
    const youtubeKey = result.youtubeApiKey;
    const geminiKey = result.geminiApiKey;
    if (!youtubeKey) {
        console.error('YouTube API Key not found.');
    } else {
        console.log('YouTube API Key retrieved:', youtubeKey);
    }
    if (!geminiKey) {
        console.error('Gemini API Key not found.');
    } else {
        console.log('Gemini API Key retrieved:', geminiKey);
    }
});

// Function to fetch enhanced video info with API
function fetchEnhancedVideoInfo(videoId) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['youtubeApiKey'], (result) => {
            const apiKey = result.youtubeApiKey;
            if (!apiKey || apiKey === 'YOUR_YOUTUBE_API_KEY_FALLBACK' || apiKey === 'AIzaSyDBBQfrtsRQdnWyFZ9cZHp_JaC4GgeJ_Gs') { // Check against placeholder/example
                console.error('Valid YouTube API Key not found in storage.');
                resolve(null);
                return;
            }
            fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`)
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`API Error: ${response.status} ${response.statusText}`);
                    }
                    return response.json();
                })
                .then(data => {
                    if (!data.items || data.items.length === 0) {
                        throw new Error('No video data available from API.');
                    }
                    const item = data.items[0];
                    const snippet = item.snippet;
                    const stats = item.statistics;
                    const categoryId = snippet.categoryId;
                    // Ensure videoCategories is loaded before accessing it
                    const categoryName = videoCategories.categories ? (videoCategories.categories[categoryId] || 'Unknown') : 'Unknown';
                    const videoData = { // Changed variable name to avoid conflict
                        title: snippet.title,
                        channelTitle: snippet.channelTitle,
                        category: categoryName,
                        views: stats?.viewCount || '0',
                        likes: stats?.likeCount || '0',
                        publishedAt: snippet.publishedAt
                    };
                    resolve(videoData);
                })
                .catch(error => {
                    console.error('Error fetching enhanced video info:', error);
                    resolve(null);
                });
        });
    });
}

// Helper function to get video ID from URL
function getVideoIdFromUrl(url) {
    console.log('Getting video ID from URL:', url);
    let videoId = '';
    try {
        if (!url) return ''; // Handle null/undefined URL
        if (url.includes('/shorts/')) {
            const match = url.match(/\/shorts\/([^/?&]+)/);
            videoId = match ? match[1] : '';
        } else if (url.includes('/watch')) {
            const urlObj = new URL(url);
            videoId = urlObj.searchParams.get('v') || '';
        }
        console.log('Extracted video ID:', videoId);
        return videoId;
    } catch (e) {
        console.error('Error extracting video ID:', e);
        return '';
    }
}

// Update the upload button event handler
const uploadButton = document.getElementById('uploadAnalyzedDataButton');
if (uploadButton) {
    uploadButton.addEventListener('click', function() {
        const fileInput = document.getElementById('analyzedDataUpload');
        const statusElement = document.getElementById('upload-status');

        if (!fileInput || !fileInput.files.length) {
            if (statusElement) {
                statusElement.textContent = 'Please select a file first.';
                statusElement.className = 'upload-status error';
            }
            return;
        }

        const file = fileInput.files[0];
        const reader = new FileReader();

        if (statusElement) {
            statusElement.textContent = 'Uploading...';
            statusElement.className = 'upload-status info'; // Use info class for pending
        }

        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);

                chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                    if (tabs && tabs.length > 0 && tabs[0].id) {
                        chrome.tabs.sendMessage(tabs[0].id, {
                            action: "processAnalyzedData",
                            data: data
                        }, function(response) {
                            if (chrome.runtime.lastError) {
                                console.error("Error sending upload data:", chrome.runtime.lastError.message);
                                if (statusElement) {
                                    statusElement.textContent = 'Error contacting content script.';
                                    statusElement.className = 'upload-status error';
                                }
                                return;
                            }

                            if (statusElement) {
                                if (response && response.success) {
                                    if (response.alreadyExists) {
                                        statusElement.textContent = 'This data was already uploaded.';
                                        statusElement.className = 'upload-status info';
                                    } else {
                                        statusElement.textContent = 'Uploaded successfully!';
                                        statusElement.className = 'upload-status success';
                                    }
                                    if (fileInput) fileInput.value = ''; // Clear file input
                                } else {
                                    statusElement.textContent = response?.error || 'Upload failed.';
                                    statusElement.className = 'upload-status error';
                                }
                            }
                        });
                    } else {
                        console.error("Could not find active tab to send upload data.");
                        if (statusElement) {
                            statusElement.textContent = 'Could not find active tab.';
                            statusElement.className = 'upload-status error';
                        }
                    }
                });

            } catch (error) {
                console.error("Error parsing JSON file:", error);
                if (statusElement) {
                    statusElement.textContent = 'Invalid JSON file: ' + error.message;
                    statusElement.className = 'upload-status error';
                }
            }
        };

        reader.onerror = function() {
            console.error("Error reading file.");
            if (statusElement) {
                statusElement.textContent = 'Error reading file.';
                statusElement.className = 'upload-status error';
            }
        };

        reader.readAsText(file);
    });
} else {
    console.warn("Upload button not found.");
}

// Initialize the popup
function initializePopup() {
    console.log('[YouTube Wellbeing] Initializing popup...');

    // Set up tab functionality
    const timerTabButton = document.getElementById('timerTabButton');
    const dataTabButton = document.getElementById('dataTabButton');
    const settingsTabButton = document.getElementById('settingsTabButton');

    if (timerTabButton) timerTabButton.addEventListener('click', (e) => openTab(e, 'TimerTab'));
    if (dataTabButton) dataTabButton.addEventListener('click', (e) => openTab(e, 'DataTab'));
    if (settingsTabButton) settingsTabButton.addEventListener('click', (e) => openTab(e, 'SettingsTab'));

    // Get current timers from storage or background script (placeholder update)
    updateTimerDisplay(); // Initial display

    // Get current video info from content script
    getCurrentVideoInfo(); // Request info from content script

    // Add export functionality
    const exportButton = document.getElementById('exportDataButton');
    if (exportButton) {
        exportButton.addEventListener('click', exportAnalyticsData); // Ensure function exists
    }

    // Add settings functionality
    const saveSettingsButton = document.getElementById('saveSettingsButton');
    if (saveSettingsButton) {
        saveSettingsButton.addEventListener('click', saveSettings); // Ensure function exists
    }

    // Update timer display periodically - This needs real data source
    setInterval(updateTimerDisplay, 1000); // Placeholder update interval
}

// Make sure you have the openTab function defined
function openTab(evt, tabName) {
    // Hide all tab content
    const tabcontentElements = document.getElementsByClassName("tabcontent"); // Use different variable name
    for (let i = 0; i < tabcontentElements.length; i++) {
        tabcontentElements[i].style.display = "none";
    }

    // Remove the "active" class from all tab buttons
    const tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab and add an "active" class to the button that opened the tab
    const currentTab = document.getElementById(tabName);
    if (currentTab) {
        currentTab.style.display = "block";
    }
    if (evt && evt.currentTarget) { // Check if event and target exist
        evt.currentTarget.className += " active";
    }
}

// Make sure the getCurrentVideoInfo function is defined
function getCurrentVideoInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        // Ensure tabs[0] exists and has an id
        if (tabs && tabs.length > 0 && tabs[0].id) {
            chrome.tabs.sendMessage(
                tabs[0].id,
                { action: "getCurrentVideoInfo" }, // Message content script
                function(response) {
                    // Check chrome.runtime.lastError
                    if (chrome.runtime.lastError) {
                        console.error("Error sending message to content script:", chrome.runtime.lastError.message);
                        // Update UI to show error
                        const titleEl = document.getElementById('video-title');
                        const categoryEl = document.getElementById('video-category');
                        const classificationEl = document.getElementById('video-classification');
                        if (titleEl) titleEl.textContent = 'Error contacting page';
                        if (categoryEl) categoryEl.textContent = 'Category: Error';
                        if (classificationEl) classificationEl.textContent = 'Classification: Error';
                        return;
                    }

                    // Update UI based on response from content script
                    const titleEl = document.getElementById('video-title');
                    const categoryEl = document.getElementById('video-category');
                    const classificationEl = document.getElementById('video-classification');

                    if (response && response.success) {
                        if (titleEl) titleEl.textContent = response.title || 'Title not available';
                        if (categoryEl) categoryEl.textContent = `Category: ${response.category || 'Unknown'}`;

                        const classification = response.isProductive !== undefined
                            ? (response.isProductive ? 'Productive' : 'Distracting')
                            : '--';
                        if (classificationEl) classificationEl.textContent = `Classification: ${classification}`;

                    } else {
                        console.log('No video information received from content script or error:', response?.error);
                        if (titleEl) titleEl.textContent = 'Not available';
                        if (categoryEl) categoryEl.textContent = 'Category: Unknown';
                        if (classificationEl) classificationEl.textContent = 'Classification: --';
                    }
                }
            );
        } else {
            console.error("Could not get active tab ID to request video info.");
            // Update UI to show error
            const titleEl = document.getElementById('video-title');
            const categoryEl = document.getElementById('video-category');
            const classificationEl = document.getElementById('video-classification');
            if (titleEl) titleEl.textContent = 'Could not find active tab';
            if (categoryEl) categoryEl.textContent = 'Category: Error';
            if (classificationEl) classificationEl.textContent = 'Classification: Error';
        }
    });
}

// --- Define missing functions (exportAnalyticsData, saveSettings) ---
function exportAnalyticsData() {
    console.log("Export Data button clicked - Functionality not implemented yet.");
    // Add logic here to retrieve data (e.g., from chrome.storage) and trigger download
    alert("Export functionality is not yet implemented.");
}

function saveSettings() {
    console.log("Save Settings button clicked - Functionality not implemented yet.");
    // Add logic here to retrieve settings from inputs and save to chrome.storage
    const doomLimit = document.getElementById('doomscrolling-limit')?.value;
    const redirectUrl = document.getElementById('redirect-url')?.value;
    const autoBlock = document.getElementById('enable-autoblock')?.checked;
    const hideRecs = document.getElementById('hide-recommendations')?.checked;

    const settings = {
        doomscrollingLimit: parseInt(doomLimit) || 30,
        redirectUrl: redirectUrl || 'https://www.google.com',
        enableAutoblock: autoBlock !== undefined ? autoBlock : true,
        hideRecommendations: hideRecs !== undefined ? hideRecs : true
    };

    chrome.storage.sync.set({ settings: settings }, () => {
        if (chrome.runtime.lastError) {
            console.error("Error saving settings:", chrome.runtime.lastError);
            alert("Error saving settings.");
        } else {
            console.log("Settings saved:", settings);
            alert("Settings saved successfully!");
        }
    });
}
// --- End missing function definitions ---

// Initial call - Use DOMContentLoaded to ensure elements exist
document.addEventListener('DOMContentLoaded', initializePopup);