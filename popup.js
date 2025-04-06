// Tab Switching Logic
function openTab(evt, tabName) {
    let tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    let tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    const tabElement = document.getElementById(tabName);
    if (tabElement) {
        tabElement.style.display = "block";
        evt.currentTarget.className += " active";
    } else {
        console.error(`Tab with ID '${tabName}' not found.`);
    }
}

// Timer Management Logic
let entertainmentTimer = 30 * 60; // 30 minutes in seconds
let musicTimer = 15 * 60; // 15 minutes in seconds
let gamingTimer = 20 * 60; // 20 minutes in seconds

function updateTimerDisplay() {
    document.getElementById('entertainment-timer').textContent = formatTime(entertainmentTimer);
    document.getElementById('music-timer').textContent = formatTime(musicTimer);
    document.getElementById('gaming-timer').textContent = formatTime(gamingTimer);
}

function formatTime(seconds) {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs < 10 ? '0' : ''}${secs}`;
}

// Settings Management Logic
function saveSettings() {
    const newSettings = {
        timeLimits: {
            "Doomscrolling": parseInt(document.getElementById('doomscrolling-limit').value, 10)
        },
        options: {
            enableAutoblock: document.getElementById('enable-autoblock').checked,
            hideRecommendations: document.getElementById('hide-recommendations').checked,
        }
    };

    // Get redirect URL
    const redirectUrl = document.getElementById('redirect-url').value;
    
    // Save settings
    chrome.storage.local.set({ settings: newSettings }, () => {
        currentSettings = newSettings;
        
        // Also save redirect URL
        chrome.storage.sync.set({ redirectUrl: redirectUrl });
        
        // Update timers with new settings
        chrome.runtime.sendMessage({ 
            action: "updateTimerLimits", 
            settings: newSettings 
        });
        
        // Show confirmation
        const settingsSection = document.querySelector('.settings-section');
        const confirmMessage = document.createElement('div');
        confirmMessage.textContent = "Settings saved!";
        confirmMessage.className = "success";
        settingsSection.appendChild(confirmMessage);

        // Remove confirmation message after 2 seconds
        setTimeout(() => {
            if (confirmMessage.parentNode) {
                confirmMessage.parentNode.removeChild(confirmMessage);
            }
        }, 2000);
    });
}

function updateSettingsUI() {
    // Update time input
    document.getElementById('doomscrolling-limit').value =
        currentSettings.timeLimits?.["Doomscrolling"] || 30;

    // Update checkboxes
    document.getElementById('enable-autoblock').checked =
        currentSettings.options?.enableAutoblock ?? true;
    document.getElementById('hide-recommendations').checked =
        currentSettings.options?.hideRecommendations ?? true;
        
    // Update redirect URL if available
    chrome.storage.sync.get(['redirectUrl'], (result) => {
        const urlInput = document.getElementById('redirect-url');
        if (urlInput && result.redirectUrl) {
            urlInput.value = result.redirectUrl;
        } else if (urlInput) {
            urlInput.value = "https://www.google.com"; // Default
        }
    });
}

// Analytics Display Logic
function exportAnalyticsData() {
    if (chrome && chrome.storage && chrome.storage.sync) {
        chrome.storage.sync.get(['analyticsData'], (result) => {
            const dataStr = JSON.stringify(result.analyticsData || {});
            const dataBlob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(dataBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'analytics_data.json';
            a.click();
        });
    } else {
        console.error('Extension context is invalid.');
    }
}

// Handle analyzed data upload
function handleAnalyzedDataUpload() {
    const fileInput = document.getElementById('analyzedDataUpload');
    const statusElement = document.getElementById('upload-status');

    if (!fileInput.files || fileInput.files.length === 0) {
        statusElement.textContent = "Please select a file first.";
        statusElement.className = "error";
        return;
    }

    const file = fileInput.files[0];
    const reader = new FileReader();

    statusElement.textContent = "Reading file...";
    statusElement.className = "";

    reader.onload = (event) => {
        try {
            const analyzedData = JSON.parse(event.target.result);

            // Validate that it's a properly structured analysis file
            if (!analyzedData.categories || !analyzedData.formatDistribution || !analyzedData.psychologicalPatterns) {
                statusElement.textContent = "Invalid analysis data format. Please upload a valid analyzed data file.";
                statusElement.className = "error";
                return;
            }

            statusElement.textContent = "Processing analyzed data...";

            // Send to content script for processing
            chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
                if (tabs.length === 0) {
                    statusElement.textContent = "No active tab found.";
                    statusElement.className = "error";
                    return;
                }

                chrome.tabs.sendMessage(
                    tabs[0].id, 
                    { action: "processAnalyzedData", data: analyzedData },
                    (response) => {
                        if (chrome.runtime.lastError) {
                            statusElement.textContent = "Error: " + chrome.runtime.lastError.message;
                            statusElement.className = "error";
                            return;
                        }

                        if (response && response.success) {
                            statusElement.textContent = "Analysis data uploaded successfully! Gemini API will now use this data for personalized recommendations.";
                            statusElement.className = "success";
                        } else {
                            statusElement.textContent = "Error processing data: " + (response?.error || "Unknown error");
                            statusElement.className = "error";
                        }
                    }
                );
            });
        } catch (error) {
            statusElement.textContent = "Error parsing file. Please make sure it's a valid JSON file.";
            statusElement.className = "error";
            console.error('JSON Parse Error:', error);
        }
    };

    reader.onerror = () => {
        statusElement.textContent = "Error reading file.";
        statusElement.className = "error";
    };

    reader.readAsText(file);
}

// Listen for video info from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Received message in popup:', message);
    
    if (message.type === 'VIDEO_INFO' || message.type === 'VIDEO_INFO_ENHANCED') {
        console.log('Received video info:', message.data);
        const { title, category } = message.data;
        document.getElementById('video-title').textContent = title || "Not available";
        document.getElementById('video-category').textContent = `Category: ${category || "Unknown"}`;
    }else if (message.type === 'VIDEO_INFO_ERROR') {
        console.error('Error getting video info:', message.error);
        // Don't update the UI on error - keep the previous values
    }
    
    // Handle other message types...
});

document.addEventListener('DOMContentLoaded', function() {
    // Initialize tab functionality
    document.getElementById('timerTabButton').addEventListener('click', (e) => openTab(e, 'TimerTab'));
    document.getElementById('dataTabButton').addEventListener('click', (e) => openTab(e, 'DataTab'));
    document.getElementById('settingsTabButton').addEventListener('click', (e) => openTab(e, 'SettingsTab'));
    
    // Get current timers
    updateTimerDisplay();
    
    // Get current video info
    getCurrentVideoInfo();
    
    // Add analyzed data upload handler
    if (document.getElementById('uploadAnalyzedDataButton')) {
        document.getElementById('uploadAnalyzedDataButton').addEventListener('click', handleAnalyzedDataUpload);
    }
    
    // Add export functionality
    if (document.getElementById('exportDataButton')) {
        document.getElementById('exportDataButton').addEventListener('click', exportAnalyticsData);
    }
    
    // Add settings functionality
    if (document.getElementById('saveSettingsButton')) {
        document.getElementById('saveSettingsButton').addEventListener('click', saveSettings);
    }
    
    // Update timer display periodically
    setInterval(updateTimerDisplay, 1000);

    // Add this to your DOMContentLoaded event listener in popup.js
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (message.action === "updateCurrentVideo") {
            const videoTitleElem = document.getElementById('video-title');
            const videoCategoryElem = document.getElementById('video-category');
            
            if (videoTitleElem && videoCategoryElem) {
                videoTitleElem.textContent = message.data.title;
                videoCategoryElem.textContent = "Category: " + message.data.category;
            }
        }
    });
});

function getCurrentVideoInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs.length === 0) {
            console.log('No active tab found.');
            updateCurrentVideoSection('Not available', 'Unknown');
            return;
        }
        
        // Check if we're on YouTube
        if (!tabs[0].url.includes('youtube.com')) {
            updateCurrentVideoSection('Not on YouTube', 'N/A');
            return;
        }

        try {
            chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_VIDEO_INFO' }, (response) => {
                if (chrome.runtime.lastError) {
                    console.log('Error:', chrome.runtime.lastError.message);
                    updateCurrentVideoSection('Could not retrieve video info', 'Unknown');
                    return;
                }
                
                if (response) {
                    updateCurrentVideoSection(response.title, response.category);
                } else {
                    updateCurrentVideoSection('Not available', 'Unknown');
                }
            });
        } catch (error) {
            console.error('Error sending message:', error);
            updateCurrentVideoSection('Error retrieving video data', 'Unknown');
        }
    });
}

function updateCurrentVideoSection(title, category) {
    const currentVideoSection = document.getElementById('current-video-info');
    if (!currentVideoSection) {
        console.error('Element with id "current-video-info" not found');
        return;
    }

    currentVideoSection.innerHTML = `
        <h3>Current Video</h3>
        <div id="video-title">${title}</div>
        <div id="video-category">Category: ${category}</div>
        <div id="video-classification">Classification: --</div>
    `;
}

if (chrome && chrome.storage && chrome.storage.sync) {
    chrome.storage.sync.set({ youtubeApiKey: 'YOUR_API_KEY' }, () => {
        console.log('API Key saved.');
    });
} else {
    console.error('Extension context is invalid.');
}
