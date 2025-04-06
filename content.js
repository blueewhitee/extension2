// Global variable to store video categories
let videoCategories = { categories: {} };

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
        // Get video info and send it back immediately
        const videoInfo = getVideoInfo();
        
        // If we're on a video page, try to enhance with API data
        const videoId = getVideoIdFromUrl(window.location.href);
        if (videoId) {
            // Send basic info immediately
            sendResponse(videoInfo);
            
            // Then try to get enhanced info via API
            fetchEnhancedVideoInfo(videoId).then(enhancedInfo => {
                // If successful, send the enhanced info as a separate message
                if (enhancedInfo) {
                    chrome.runtime.sendMessage({ 
                        type: 'VIDEO_INFO_ENHANCED', 
                        data: enhancedInfo 
                    });
                }
            });
            return true; // Keep the message port open
        } else {
            // Just send basic info
            sendResponse(videoInfo);
            return false;
        }
    } else if (message.type === 'REINITIALIZE') {
        initializeExtension();
        sendResponse({ success: true });
        return false;
    }
    
    return false; // Close the message port for unhandled messages
});

// Add to your message listener in content.js

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log("Message received in content script:", request);
    
    if (request.action === "getCurrentVideoInfo") {
        if (currentVideoId && currentAnalysis) {
            const videoInfo = getVideoInfoFromDOM();
            sendResponse({
                success: true,
                videoId: currentVideoId,
                title: videoInfo.title,
                category: currentAnalysis.category || 'Unknown',
                isProductive: currentAnalysis.isProductive
            });
        } else {
            sendResponse({ 
                success: false, 
                error: "Video information not yet available" 
            });
        }
        return true;
    }
    
    if (request.action === "processAnalyzedData") {
        try {
            console.log("Processing uploaded analyzed data for Gemini API", request.data);
            
            // Store the analyzed data for future use with Gemini API
            chrome.storage.local.set({ userAnalysis: request.data }, () => {
                // Update the current analysis data in memory
                userAnalysisData = request.data;
                
                // If we have a current video, re-analyze it with the new data
                if (currentVideoId) {
                    // Re-analyze the current video with the new data
                    analyzeCurrentVideo(currentVideoId);
                    console.log("Re-analyzing current video with new analysis data");
                }
                
                sendResponse({ 
                    success: true, 
                    message: "Analyzed data processed successfully and will be used with Gemini API"
                });
            });
            
            return true; // Keep the message port open for the async response
        } catch (error) {
            console.error("Error processing analyzed data:", error);
            sendResponse({ 
                success: false, 
                error: error.message || "Unknown error processing data" 
            });
            return true;
        }
    }
    
    return true; // Keep the message port open for async responses
});

// Function to fetch and process video data
// Function to fetch and process video data
function fetchVideoData(videoId) {
    if (!videoId) {
        console.error('No video ID provided for fetching data');
        return;
    }

    if (!chrome.runtime?.id) {
        console.error('Extension context invalidated. Please reload the extension.');
        return;
    }

    chrome.storage.sync.get(['youtubeApiKey'], (result) => {
        const apiKey = result.youtubeApiKey;
        if (!apiKey) {
            console.error('API Key not found.');
            return;
        }

        console.log('Fetching data for video ID:', videoId);
        
        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('API Response:', data);
                if (!data.items || data.items.length === 0) {
                    throw new Error('No video data available.');
                }

                const snippet = data.items[0].snippet;
                const stats = data.items[0].statistics;
                const categoryId = snippet.categoryId;
                const category = videoCategories.categories[categoryId] || 'Unknown';

                const videoInfo = {
                    title: snippet.title,
                    channelTitle: snippet.channelTitle,
                    category: category,
                    views: stats.viewCount,
                    likes: stats.likeCount,
                    publishedAt: snippet.publishedAt
                };

                console.log('Processed video info:', videoInfo);

                // Send video info to the popup
                chrome.runtime.sendMessage({ type: 'VIDEO_INFO', data: videoInfo });
                
                // Also update the UI if needed
                updateCurrentVideoSection(videoInfo.title, videoInfo.category);
                
                // If you have code for time recommendations, add it here
                const analysis = {
                    recommendedTime: getCategoryDefaultTime(category),
                    classification: isProductiveCategory(category) ? "productive" : "distracting"
                };
                
                showTimeRecommendation(videoInfo, analysis);
            })
            .catch(error => {
                console.error('Error fetching video data:', error);
                // NO FALLBACK HERE - This was the issue
            });
    });
}
// Add helper functions used by fetchVideoData
function getCategoryDefaultTime(category) {
    const defaultTimes = {
        "Entertainment": 15,
        "Music": 10,
        "Gaming": 20,
        "Comedy": 15,
        "People & Blogs": 15,
        "Film & Animation": 20,
        "News & Politics": 15,
        "Education": 25,
        "Science & Technology": 25,
        "Howto & Style": 20
    };
    
    return defaultTimes[category] || 15; // Default to 15 minutes
}

// Function to determine if a category is productive
function isProductiveCategory(category) {
    const productiveCategories = [
        "Education",
        "Science & Technology",
        "News & Politics",
        "Howto & Style",
        "Documentary"
    ];
    
    return productiveCategories.includes(category);
}

// Function to detect video changes and auto-scrape
function setupVideoChangeDetection() {
    let lastVideoId = '';
    let lastUrl = window.location.href;

    function checkForVideoChange() {
        const currentUrl = window.location.href;
        let currentVideoId = getVideoIdFromUrl(currentUrl);

        // Add debug logs
        console.log('Checking for video change:');
        console.log('Current URL:', currentUrl);
        console.log('Current Video ID:', currentVideoId);
        console.log('Last Video ID:', lastVideoId);

        // Only process if we have a video ID and it's changed or URL changed
        if (currentVideoId && (currentVideoId !== lastVideoId || currentUrl !== lastUrl)) {
            console.log('Video changed, analyzing metadata for:', currentVideoId);
            lastVideoId = currentVideoId;
            lastUrl = currentUrl;
            
            // Call fetchVideoData directly with the video ID
            fetchVideoData(currentVideoId);
            
            // Also try to analyze the video if you're using that function
            try {
                analyzeCurrentVideo(currentVideoId);
            } catch (e) {
                console.error('Error analyzing video:', e);
            }
        }
    }

    // Check for changes more frequently
    const intervalId = setInterval(checkForVideoChange, 500);

    // Additional event listeners for YouTube navigation
    window.addEventListener('yt-navigate-start', checkForVideoChange);
    window.addEventListener('yt-navigate-finish', checkForVideoChange);
    window.addEventListener('yt-page-data-updated', checkForVideoChange);
    
    // Initial check
    setTimeout(checkForVideoChange, 1000);
    
    return () => {
        clearInterval(intervalId);
        window.removeEventListener('yt-navigate-start', checkForVideoChange);
        window.removeEventListener('yt-navigate-finish', checkForVideoChange);
        window.removeEventListener('yt-page-data-updated', checkForVideoChange);
    };
}

// Function to analyze current video metadata and send to Gemini API
function analyzeCurrentVideo(videoId) {
    if (!videoId) {
        console.error('No video ID provided for analysis');
        return;
    }

    // Get video data from YouTube API
    chrome.storage.sync.get(['youtubeApiKey'], function(result) {
        const apiKey = result.youtubeApiKey || CONFIG.YOUTUBE_API_KEY;
        
        if (!apiKey) {
            console.error('API Key not found');
            return;
        }

        // Fetch video metadata from YouTube API
        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(async data => {
                console.log('API Response:', data);
                if (!data.items || data.items.length === 0) {
                    throw new Error('No video data available');
                }

                const snippet = data.items[0].snippet;
                const stats = data.items[0].statistics;
                const contentDetails = data.items[0].contentDetails;
                const categoryId = snippet.categoryId;
                const category = videoCategories.categories[categoryId] || 'Unknown';
                
                // Get duration if available
                let duration = 0;
                if (contentDetails && contentDetails.duration) {
                    duration = parseDuration(contentDetails.duration);
                }
                
                // Create video metadata object
                const videoData = {
                    videoId: videoId,
                    title: snippet.title,
                    channelTitle: snippet.channelTitle,
                    category: category,
                    categoryId: categoryId,
                    views: stats.viewCount || '0',
                    likes: stats.likeCount || '0',
                    publishedAt: snippet.publishedAt,
                    duration: duration,
                    isShort: window.location.href.includes('/shorts/') || duration < 60
                };
                
                // Update current video info globals
                currentVideoId = videoId;
                currentVideoCategory = category;
                
                // Send to Gemini API for enhanced analysis
                const enhancedData = await sendToGeminiAPI(videoData);
                
                // Save current analysis
                currentAnalysis = {
                    isProductive: enhancedData.isProductive,
                    category: category,
                    recommendedTime: enhancedData.recommendedTime,
                    reason: enhancedData.analysisReason,
                    potentialTransitions: enhancedData.potentialTransitions
                };
                
                console.log('Enhanced video analysis:', enhancedData);
                
                // Send video data to background script
                chrome.runtime.sendMessage({ 
                    action: "videoChange", 
                    videoData: enhancedData 
                });
                
                // Update popup with current video info
                updateCurrentVideoSection(videoData.title, videoData.category);
                
                // Show recommendation to user
                showTimeRecommendation(videoData, {
                    classification: enhancedData.isProductive ? "productive" : "distracting",
                    recommendedTime: enhancedData.recommendedTime,
                    reason: enhancedData.analysisReason
                });
                
                // Check if category is blocked and show overlay if needed
                checkCategoryBlocking(category);
            })
            // In the analyzeCurrentVideo function, modify the catch block:
            .catch(error => {
                console.error('Video analysis error:', error);
                // Remove the fallback mechanism
                chrome.runtime.sendMessage({ 
                    type: 'VIDEO_INFO_ERROR', 
                    error: error.message 
                });
            });
    });
}

// Function to send video data to Gemini API
async function sendToGeminiAPI(videoData) {
    try {
        console.log('Sending to Gemini API:', videoData.title);
        
        // Determine if this is short or long form content
        const isShortForm = videoData.isShort;
        const contentFormat = isShortForm ? "short-form" : "long-form";
        
        // Create prompt for Gemini API
        const prompt = {
            contents: [
                {
                    role: "system",
                    parts: [{ text: CONFIG.SYSTEM_PROMPT }]
                },
                {
                    role: "user",
                    parts: [{ 
                        text: `Analyze this YouTube video:
                        
VIDEO METADATA:
Title: ${videoData.title}
Channel: ${videoData.channelTitle}
Category: ${videoData.category}
Format: ${contentFormat}
Views: ${videoData.views || 'Unknown'}
Publication Date: ${videoData.publishedAt || 'Unknown'}
Duration: ${formatDuration(videoData.duration)}
`
                    }]
                }
            ]
        };
        
        // Call Gemini API
        const response = await fetch(`${CONFIG.API_ENDPOINT}?key=${CONFIG.GEMINI_API_KEY}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(prompt)
        });
        
        if (!response.ok) {
            throw new Error(`Gemini API error: ${response.status}`);
        }
        
        const data = await response.json();
        
        // Extract analysis from Gemini response
        const analysisText = data.candidates[0].content.parts[0].text;
        
        // Clean the response text (remove markdown formatting if present)
        const cleanedText = analysisText.replace(/```json|```/g, '').trim();
        
        // Parse the JSON response
        const analysis = JSON.parse(cleanedText);
        
        console.log('Gemini analysis:', analysis);
        
        // Update video metadata with analysis
        videoData.isProductive = analysis.classification === "productive";
        videoData.recommendedTime = analysis.recommendedTime;
        videoData.analysisReason = analysis.reason;
        videoData.potentialTransitions = analysis.potentialTransitions;
        
        return videoData;
    } catch (error) {
        console.error('Error analyzing with Gemini:', error);
        
        // Fallback to basic category-based analysis
        videoData.isProductive = isProductiveCategory(videoData.category);
        videoData.recommendedTime = getCategoryDefaultTime(videoData.category);
        videoData.analysisReason = "Based on video category (fallback analysis)";
        videoData.potentialTransitions = [];
        
        return videoData;
    }
}

// Helper function to format duration for Gemini
function formatDuration(seconds) {
    if (!seconds || seconds === 0) return 'Unknown';
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes < 1) {
        return `${seconds} seconds`;
    } else if (minutes === 1) {
        return `1 minute ${remainingSeconds > 0 ? `${remainingSeconds} seconds` : ''}`;
    } else {
        return `${minutes} minutes ${remainingSeconds > 0 ? `${remainingSeconds} seconds` : ''}`;
    }
}

// Get video info from DOM as fallback
function getVideoInfoFromDOM() {
    // Different selectors for different YouTube layouts
    const titleSelectors = [
        'h1.title yt-formatted-string',
        'h1.title',
        '#title h1',
        '#title'
    ];
    
    const categorySelectors = [
        '.metadata-info .category span',
        '#meta-contents #info-strings a'
    ];
    
    // Try all selectors until we find one that works
    let videoTitle = 'Not available';
    for (const selector of titleSelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            videoTitle = element.textContent.trim();
            break;
        }
    }
    
    let videoCategory = 'Unknown';
    for (const selector of categorySelectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim()) {
            videoCategory = element.textContent.trim();
            break;
        }
    }
    
    // Check if we're on a Shorts page
    const isShort = window.location.href.includes('/shorts/');
    if (isShort) {
        videoCategory = videoCategory || 'Shorts';
    }
    
    return {
        title: videoTitle,
        category: videoCategory,
        isShort: isShort
    };
}

// Function to auto-scrape metadata when video changes
function autoScrapeMetadata(videoId) {
    if (!chrome.runtime?.id) {
        console.error('Extension context invalidated. Please reload the extension.');
        return;
    }

    chrome.storage.sync.get(['youtubeApiKey'], function(result) {
        const apiKey = result.youtubeApiKey;
        if (!apiKey) {
            console.error('API Key not found');
            return;
        }

        // Fetch only the snippet part
        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${videoId}&key=${apiKey}`)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`API Error: ${response.status} ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('API Response:', data);
                if (!data.items || data.items.length === 0) {
                    throw new Error('No video data available');
                }

                const snippet = data.items[0].snippet;
                const categoryId = snippet.categoryId;
                const category = videoCategories.categories[categoryId] || 'Unknown';

                const videoData = {
                    title: snippet.title,
                    category: category
                };

                console.log('Extracted Video Data:', videoData);

                // Send video info to the popup
                chrome.runtime.sendMessage({ type: 'VIDEO_INFO', data: videoData });
            })
            .catch(error => {
                console.error('Auto-scrape API Error:', error);
            });
    });
}

// Check if the extension context is valid
if (!chrome.runtime?.id) {
    console.error('Extension context invalidated. Please reload the extension.');
} else {
    // Initialize the extension
    setupVideoChangeDetection();
}

// Reinitialize if the context is invalidated
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REINITIALIZE') {
        if (!chrome.runtime?.id) {
            console.error('Extension context invalidated. Please reload the extension.');
        } else {
            setupVideoChangeDetection();
        }
    }
});

function showTimeRecommendation(videoData, analysis) {
    const existingNotification = document.getElementById('wellbeing-time-recommendation');
    if (existingNotification) {
        existingNotification.remove();
    }

    const notification = document.createElement('div');
    notification.id = 'wellbeing-time-recommendation';
    notification.innerHTML = `
        <h3>${videoData.title}</h3>
        <p>Category: ${videoData.category}</p>
        <p>Recommended Time: ${analysis.recommendedTime} minutes</p>
    `;
    document.body.appendChild(notification);

    console.log('UI Updated with:', videoData.title, videoData.category, analysis.recommendedTime);
}

function updateCurrentVideoSection(title, category) {
    // Find or create the "Current Video" section
    let currentVideoSection = document.getElementById('current-video-section');
    if (!currentVideoSection) {
        currentVideoSection = document.createElement('div');
        currentVideoSection.id = 'current-video-section';
        currentVideoSection.style.position = 'fixed';
        currentVideoSection.style.top = '10px';
        currentVideoSection.style.right = '10px';
        currentVideoSection.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
        currentVideoSection.style.color = 'white';
        currentVideoSection.style.padding = '10px';
        currentVideoSection.style.borderRadius = '5px';
        currentVideoSection.style.zIndex = '9999';
        document.body.appendChild(currentVideoSection);
    }

    // Update the content
    currentVideoSection.innerHTML = `
        <h3>Current Video</h3>
        <p><strong>Title:</strong> ${title}</p>
        <p><strong>Category:</strong> ${category}</p>
    `;

    console.log('Updated "Current Video" section with:', title, category);
}

// Initial call - make sure it runs after the page is loaded
function initializeExtension() {
    if (!chrome.runtime?.id) {
        console.error('Extension context invalidated. Please reload the extension.');
        return;
    }

    debugLog('Initializing extension...');
    
    // Load video categories
    fetch(chrome.runtime.getURL('videoCategories.json'))
        .then(response => response.json())
        .then(data => {
            debugLog('Loaded Video Categories:', data);
            videoCategories = data;
            
            // Set up detection after categories are loaded
            const cleanup = setupVideoChangeDetection();
            
            // Send initial video info
            const videoId = getVideoIdFromUrl(window.location.href);
            if (videoId) {
                fetchVideoData(videoId);
            } else {
                // Just use DOM-based info if no video ID
                const basicInfo = getVideoInfo();
                chrome.runtime.sendMessage({ type: 'VIDEO_INFO', data: basicInfo });
            }
        })
        .catch(error => {
            console.error('Error loading categories:', error);
            videoCategories = { categories: {} };
            
            // Still set up detection even if categories failed to load
            const cleanup = setupVideoChangeDetection();
        });
}

// Run initialization when DOM is loaded
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeExtension);
} else {
    initializeExtension();
}

// Reinitialize when the extension context is invalidated
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REINITIALIZE') {
        initializeExtension();
    }
});

// Initial call
initializeExtension();

// Also add the missing debugLog function that's called in initializeExtension
function debugLog(...args) {
    console.log('[YouTube Wellbeing]', ...args);
}