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

function updateTimerDisplay() {
    document.getElementById('entertainment-timer').textContent = formatTime(entertainmentTimer);
    document.getElementById('gaming-timer').textContent = formatTime(gamingTimer);
}

chrome.storage.sync.set({ youtubeApiKey: 'AIzaSyDBBQfrtsRQdnWyFZ9cZHp_JaC4GgeJ_Gs' }, () => {
    console.log('API Key saved.');
});

chrome.storage.sync.get(['youtubeApiKey'], (result) => {
    console.log('Storage result:', result);
    const apiKey = result.youtubeApiKey;
    if (!apiKey) {
        console.error('API Key not found.');
        return;
    }
    console.log('API Key retrieved:', apiKey);
});

// Send video information to the popup
function sendVideoInfo() {
    const videoInfo = getVideoInfo();
    chrome.runtime.sendMessage({ type: 'VIDEO_INFO', data: videoInfo });
}

// Function to fetch enhanced video info with API
function fetchEnhancedVideoInfo(videoId) {
    return new Promise((resolve) => {
        chrome.storage.sync.get(['youtubeApiKey'], (result) => {
            const apiKey = result.youtubeApiKey;
            if (!apiKey) {
                console.error('API Key not found.');
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
                        throw new Error('No video data available.');
                    }
                    const snippet = data.items[0].snippet;
                    const stats = data.items[0].statistics;
                    const categoryId = snippet.categoryId;
                    const videoInfo = {
                        title: snippet.title,
                        channelTitle: snippet.channelTitle,
                        category: videoCategories.categories[categoryId] || 'Unknown',
                        views: stats.viewCount,
                        likes: stats.likeCount,
                        publishedAt: snippet.publishedAt
                    };
                    resolve(videoInfo);
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

// Consolidated message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('Message received:', message.type);
    if (message.type === 'GET_VIDEO_INFO') {
        const videoInfo = getVideoInfo();
        const videoId = getVideoIdFromUrl(window.location.href);
        if (videoId) {
            sendResponse(videoInfo);
            fetchEnhancedVideoInfo(videoId).then(enhancedInfo => {
                if (enhancedInfo) {
                    chrome.runtime.sendMessage({
                        type: 'VIDEO_INFO_ENHANCED',
                        data: enhancedInfo
                    });
                }
            });
            return true;
        } else {
            sendResponse(videoInfo);
            return false;
        }
    } else if (message.type === 'REINITIALIZE') {
        initializeExtension();
        sendResponse({ success: true });
        return false;
    }
});

// Update the upload button event handler to handle "already exists" response
document.getElementById('uploadAnalyzedDataButton').addEventListener('click', function() {
    const fileInput = document.getElementById('analyzedDataUpload');
    const statusElement = document.getElementById('upload-status');
    
    if (!fileInput.files.length) {
        statusElement.textContent = 'Please select a file first.';
        statusElement.className = 'upload-status error';
        return;
    }
    
    const file = fileInput.files[0];
    const reader = new FileReader();
    
    // Show loading status
    statusElement.textContent = 'Uploading...';
    statusElement.className = 'upload-status';
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            // Send data to content script for processing
            chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
                chrome.tabs.sendMessage(tabs[0].id, {
                    action: "processAnalyzedData",
                    data: data
                }, function(response) {
                    if (response && response.success) {
                        if (response.alreadyExists) {
                            // Show "already exists" message
                            statusElement.textContent = 'This data was already uploaded.';
                            statusElement.className = 'upload-status info';
                        } else {
                            // Show success message
                            statusElement.textContent = 'Uploaded successfully!';
                            statusElement.className = 'upload-status success';
                        }
                        
                        // Optional: Clear the file input after upload
                        fileInput.value = '';
                    } else {
                        statusElement.textContent = response?.error || 'Upload failed.';
                        statusElement.className = 'upload-status error';
                    }
                });
            });
            
        } catch (error) {
            statusElement.textContent = 'Invalid JSON file: ' + error.message;
            statusElement.className = 'upload-status error';
        }
    };
    
    reader.onerror = function() {
        statusElement.textContent = 'Error reading file.';
        statusElement.className = 'upload-status error';
    };
    
    reader.readAsText(file);
});

// Initialize the popup
function initializeExtension() {
    console.log('[YouTube Wellbeing] Initializing popup...');
    
    // Set up tab functionality
    document.getElementById('timerTabButton').addEventListener('click', (e) => openTab(e, 'TimerTab'));
    document.getElementById('dataTabButton').addEventListener('click', (e) => openTab(e, 'DataTab'));
    document.getElementById('settingsTabButton').addEventListener('click', (e) => openTab(e, 'SettingsTab'));
    
    // Get current timers
    updateTimerDisplay();
    
    // Get current video info
    getCurrentVideoInfo();
    
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
}

// Make sure you have the openTab function defined
function openTab(evt, tabName) {
    // Hide all tab content
    const tabcontent = document.getElementsByClassName("tabcontent");
    for (let i = 0; i < tabcontent.length; i++) {
        tabcontent[i].style.display = "none";
    }

    // Remove the "active" class from all tab buttons
    const tablinks = document.getElementsByClassName("tablinks");
    for (let i = 0; i < tablinks.length; i++) {
        tablinks[i].className = tablinks[i].className.replace(" active", "");
    }

    // Show the current tab and add an "active" class to the button that opened the tab
    document.getElementById(tabName).style.display = "block";
    evt.currentTarget.className += " active";
}

// Make sure the getCurrentVideoInfo function is defined (if not already)
function getCurrentVideoInfo() {
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        chrome.tabs.sendMessage(
            tabs[0].id,
            { action: "getCurrentVideoInfo" },
            function(response) {
                if (response && response.success) {
                    document.getElementById('video-title').textContent = response.title;
                    document.getElementById('video-category').textContent = `Category: ${response.category}`;
                    document.getElementById('video-classification').textContent = 
                        `Classification: ${response.isProductive ? 'Productive' : 'Distracting'}`;
                } else {
                    console.log('No video information available');
                }
            }
        );
    });
}

// Initial call
initializeExtension();

// Also add the missing debugLog function that's called in initializeExtension
function debugLog(...args) {
    console.log('[YouTube Wellbeing]', ...args);
}