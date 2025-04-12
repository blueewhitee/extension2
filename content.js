// Global variable to store video categories
let videoCategories = { categories: {} };
let CONFIG = {};
let currentAnalysis = null;
let isInitialized = false; // Flag to prevent multiple initializations

// Load configuration using dynamic import
async function loadConfig() {
    // Prevent re-running if already initialized via another path
    if (isInitialized) return;
    console.log('Attempting to load config...'); // Added log
    try {
        // Use dynamic import for the .js file
        const configModule = await import(chrome.runtime.getURL('config.js'));
        CONFIG = configModule.CONFIG; // Access the exported CONFIG object
        console.log('Config loaded successfully:', CONFIG);
    } catch (error) {
        console.error('Error loading config:', error);
        // Fallback config remains the same
        CONFIG = {
            YOUTUBE_API_KEY: 'YOUR_YOUTUBE_API_KEY_FALLBACK', // Use distinct fallback keys
            GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_FALLBACK',
            API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
            SYSTEM_PROMPT: 'Analyze YouTube video content for productivity.'
        };
        console.log('Using fallback config.');
    }
    // After config is loaded (or fallback used), proceed to initialize
    // Ensure initializeExtension is called only once after config is ready
    if (!isInitialized) {
        initializeExtension();
    }
}

// Cache variables to prevent excessive API calls
let videoDataCache = new Map();
let lastApiCallTime = 0;
const API_THROTTLE_MS = 5000; // Minimum 5 seconds between API calls

// Function to detect video changes with throttling
function setupVideoChangeDetection() {
    console.log("Setting up video change detection..."); // Added log
    let lastVideoId = '';
    let lastUrl = window.location.href;

    function checkForVideoChange() {
        const currentUrl = window.location.href;
        let currentVideoId = getVideoIdFromUrl(currentUrl);

        // Only process if we have a video ID and it's changed or URL changed significantly
        if (currentVideoId && (currentVideoId !== lastVideoId || currentUrl !== lastUrl)) {
            console.log('Video or URL changed, analyzing metadata for:', currentVideoId);
            lastVideoId = currentVideoId;
            lastUrl = currentUrl;

            // Check if the video data is already in cache
            if (videoDataCache.has(currentVideoId)) {
                console.log('Using cached data for video:', currentVideoId);
                const cachedData = videoDataCache.get(currentVideoId);
                processVideoData(cachedData); // Process cached data
                analyzeAndShowRecommendation(cachedData); // Show recommendation from cache
                return;
            }

            // Throttle API calls
            const now = Date.now();
            if (now - lastApiCallTime >= API_THROTTLE_MS) {
                console.log('Making API call for video:', currentVideoId);
                lastApiCallTime = now;
                fetchVideoData(currentVideoId); // Fetch new data via API
            } else {
                console.log(`Throttling API call, using DOM data for:`, currentVideoId);
                const basicInfo = getVideoInfoFromDOM();
                processBasicVideoData(currentVideoId, basicInfo); // Process basic DOM data
                showTimeRecommendation(
                    { videoId: currentVideoId, title: basicInfo.title, category: basicInfo.category },
                    { isProductive: false, recommendedTime: 15, reason: "Throttled - basic info only", potentialTransitions: [], personalizedAdvice: "Full analysis pending." }
                );
            }
        }
    }

    // Use specific YouTube navigation events
    window.addEventListener('yt-navigate-finish', checkForVideoChange);
    window.addEventListener('yt-page-data-updated', checkForVideoChange);

    // Initial check after a short delay for page elements to load
    console.log("Scheduling initial video check..."); // Added log
    setTimeout(checkForVideoChange, 2000); // Slightly longer delay

    // Return a cleanup function to remove listeners when the script unloads
    return () => {
        window.removeEventListener('yt-navigate-finish', checkForVideoChange);
        window.removeEventListener('yt-page-data-updated', checkForVideoChange);
        console.log('Video change detection listeners removed.');
    };
}

// Helper function to consolidate analysis and UI update
async function analyzeAndShowRecommendation(videoData) {
    if (!videoData || !videoData.videoId) return;
    try {
        // Check if analysis already exists in cache or currentAnalysis
        if (videoData.isProductive !== undefined) {
            console.log('Using existing analysis for recommendation:', videoData.videoId);
            showTimeRecommendation(videoData, {
                isProductive: videoData.isProductive,
                recommendedTime: videoData.recommendedTime,
                reason: videoData.reason,
                potentialTransitions: videoData.potentialTransitions,
                personalizedAdvice: videoData.personalizedAdvice,
                confidenceScore: videoData.confidenceScore
            });
            currentAnalysis = { ...videoData }; // Update currentAnalysis
            return;
        }

        // If no analysis exists, call Gemini
        console.log('Requesting new Gemini analysis for:', videoData.videoId);
        const analysis = await sendToGeminiAPI(videoData);

        // Combine video data with analysis results
        const enhancedData = { ...videoData, ...analysis };

        // Update cache with analysis results
        videoDataCache.set(videoData.videoId, enhancedData);

        // Update UI
        showTimeRecommendation(enhancedData, analysis);

        // Save current analysis
        currentAnalysis = {
            isProductive: analysis.isProductive,
            category: videoData.category,
            recommendedTime: analysis.recommendedTime,
            reason: analysis.reason,
            potentialTransitions: analysis.potentialTransitions,
            personalizedAdvice: analysis.personalizedAdvice,
            confidenceScore: analysis.confidenceScore,
            videoId: videoData.videoId // Ensure videoId is part of currentAnalysis
        };

        // Send updated data to popup/background if needed
        chrome.runtime.sendMessage({
            type: 'VIDEO_INFO_ENHANCED',
            data: enhancedData
        });

    } catch (error) {
        console.error('Error during analysis or showing recommendation:', error);
    }
}

// Modify your fetchVideoData function to use the new helper
async function fetchVideoData(videoId) {
    if (!videoId || videoDataCache.has(videoId)) {
        if (videoDataCache.has(videoId)) {
            console.log('fetchVideoData: Using cached data for', videoId);
            const cachedData = videoDataCache.get(videoId);
            processVideoData(cachedData); // Process immediately
            analyzeAndShowRecommendation(cachedData); // Trigger analysis/recommendation
        }
        return;
    }
    if (!chrome.runtime?.id) { return; }
    chrome.storage.sync.get(['youtubeApiKey'], (result) => {
        const apiKey = result.youtubeApiKey || CONFIG.YOUTUBE_API_KEY; // Use config fallback
        if (!apiKey) { return; }

        console.log('Fetching YouTube API data for video ID:', videoId);

        fetch(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${videoId}&key=${apiKey}`)
            .then(response => {
                if (!response.ok) { throw new Error(`API Error: ${response.status} ${response.statusText}`); }
                return response.json();
            })
            .then(data => {
                if (!data.items || data.items.length === 0) { throw new Error('No video data available from API.'); }

                const item = data.items[0];
                const snippet = item.snippet;
                const stats = item.statistics;
                const contentDetails = item.contentDetails;
                const categoryId = snippet.categoryId;
                const category = videoCategories.categories[categoryId] || 'Unknown';
                const duration = contentDetails?.duration ? parseDuration(contentDetails.duration) : 0;

                const videoData = {
                    videoId: videoId,
                    title: snippet.title,
                    channelTitle: snippet.channelTitle,
                    category: category,
                    categoryId: categoryId,
                    views: stats?.viewCount || '0',
                    likes: stats?.likeCount || '0',
                    publishedAt: snippet.publishedAt,
                    duration: duration,
                    isShort: window.location.href.includes('/shorts/') || duration < 60
                };

                processVideoData(videoData);

                videoDataCache.set(videoId, videoData);

                analyzeAndShowRecommendation(videoData);

            })
            .catch(error => {
                console.error('Error fetching video data from API:', error);
                const basicInfo = getVideoInfoFromDOM();
                processBasicVideoData(videoId, basicInfo);
                showTimeRecommendation(
                    { videoId: videoId, title: basicInfo.title, category: basicInfo.category },
                    { isProductive: false, recommendedTime: 15, reason: `API Error: ${error.message}`, potentialTransitions: [], personalizedAdvice: "Could not fetch full video details." }
                );
            });
    });
}

// Main initialization function - called AFTER config is loaded
function initializeExtension() {
    // Prevent re-initialization if already done
    if (isInitialized) {
        console.log('Extension already initialized, skipping setup.'); // Added log
        return;
    }
    if (!chrome.runtime?.id) {
        console.error('Extension context invalidated. Cannot initialize.');
        return;
    }

    console.log('Initializing extension core logic...');

    // Load categories, then set up detection
    fetch(chrome.runtime.getURL('videoCategories.json'))
        .then(response => {
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return response.json();
        })
        .then(data => {
            console.log('Loaded Video Categories:', data);
            videoCategories = data;
        })
        .catch(error => {
            console.error('Error loading categories:', error);
            videoCategories = { categories: {} }; // Fallback
            console.log('Using fallback categories.');
        })
        .finally(() => {
            // Setup detection AFTER categories attempt (success or fail)
            console.log("Setting up detection after category load attempt."); // Added log
            const cleanup = setupVideoChangeDetection();
            isInitialized = true; // Mark as initialized
            console.log('Extension initialization complete.');

            // Add call to create/update the persistent UI here
            console.log("Attempting to create floating timer..."); // Added log
            createOrUpdateFloatingTimer();
        });
}

// Use DOMContentLoaded to trigger the initial config load reliably
if (document.readyState === 'loading') {
    console.log("DOM not ready, adding listener for DOMContentLoaded."); // Added log
    document.addEventListener('DOMContentLoaded', loadConfig);
} else {
    // If DOM is already loaded, call loadConfig directly
    console.log("DOM already ready, calling loadConfig directly."); // Added log
    loadConfig();
}

// Listener for re-initialization messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REINITIALIZE') {
        console.log('Received REINITIALIZE message. Resetting and reloading config.'); // Added log
        isInitialized = false; // Reset flag
        loadConfig(); // Reload config and re-initialize
        sendResponse({ success: true });
        return true; // Indicate async response potentially needed later
    } else if (message.type === 'GET_CURRENT_ANALYSIS') {
        sendResponse(currentAnalysis);
        return true; // Indicates asynchronous response
    } else if (message.action === 'getCurrentVideoInfo') {
        console.log("Popup requested current video info.");
        const videoId = getVideoIdFromUrl(window.location.href);
        const responseData = currentAnalysis && currentAnalysis.videoId === videoId
            ? { success: true, ...currentAnalysis }
            : { success: true, ...getVideoInfoFromDOM(), isProductive: undefined };

        console.log("Sending to popup:", responseData);
        sendResponse(responseData);
        return true; // Indicate async response
    }
});

// Helper Functions
function getVideoIdFromUrl(url) {
    try {
        if (!url) return '';
        if (url.includes('/shorts/')) {
            const match = url.match(/\/shorts\/([^/?&]+)/);
            return match ? match[1] : '';
        } else if (url.includes('/watch')) {
            const urlObj = new URL(url);
            return urlObj.searchParams.get('v') || '';
        }
        return '';
    } catch (e) {
        console.error('Error extracting video ID from URL:', url, e);
        return '';
    }
}

function getVideoInfoFromDOM() {
    const titleElement = document.querySelector('h1.style-scope.ytd-watch-metadata yt-formatted-string');
    const title = titleElement ? titleElement.textContent : 'Title not found in DOM';
    const category = 'Unknown (DOM)';
    return { title, category };
}

function processVideoData(videoData) {
    console.log("Processing video data:", videoData);
}

function processBasicVideoData(videoId, basicInfo) {
    console.log("Processing basic DOM video data:", videoId, basicInfo);
}

function parseDuration(durationString) {
    const match = durationString.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const hours = parseInt(match[1] || 0);
    const minutes = parseInt(match[2] || 0);
    const seconds = parseInt(match[3] || 0);
    return hours * 3600 + minutes * 60 + seconds;
}

async function sendToGeminiAPI(videoData) {
    console.log("Attempting to send data to Gemini API for analysis:", videoData);

    // 1. Get API Key
    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['geminiApiKey'], async (result) => {
            const apiKey = result.geminiApiKey || CONFIG.GEMINI_API_KEY; // Use config fallback

            if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_FALLBACK') {
                console.error('Valid Gemini API Key not found. Cannot perform analysis.');
                // Resolve with a default error analysis instead of rejecting,
                // so the UI can still show something.
                resolve({
                    isProductive: false,
                    recommendedTime: 15,
                    reason: "Gemini API Key not configured.",
                    potentialTransitions: [],
                    personalizedAdvice: "Please configure the Gemini API key in the extension settings or config.",
                    confidenceScore: 0
                });
                return;
            }

            const apiEndpoint = `${CONFIG.API_ENDPOINT}?key=${apiKey}`;
            const systemPrompt = CONFIG.SYSTEM_PROMPT;

            // 2. Construct Request Body
            // Prepare the user prompt part with video details
            const userPrompt = `Analyze the following YouTube video:\nTitle: ${videoData.title}\nChannel: ${videoData.channelTitle}\nCategory: ${videoData.category}\nDuration: ${videoData.duration} seconds\nViews: ${videoData.views}\nLikes: ${videoData.likes}\nPublished: ${videoData.publishedAt}\nIs Short: ${videoData.isShort}`;

            const requestBody = {
                contents: [{
                    parts: [{ text: systemPrompt }, { text: userPrompt }]
                }],
            };

            console.log("Sending request to Gemini:", apiEndpoint);

            try {
                const response = await fetch(apiEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(requestBody),
                });

                if (!response.ok) {
                    const errorBody = await response.text();
                    console.error(`Gemini API Error: ${response.status} ${response.statusText}`, errorBody);
                    throw new Error(`Gemini API Error: ${response.status} ${response.statusText}`);
                }

                const responseData = await response.json();
                console.log("Gemini API Response:", responseData);

                if (!responseData.candidates || !responseData.candidates[0] || !responseData.candidates[0].content || !responseData.candidates[0].content.parts || !responseData.candidates[0].content.parts[0]) {
                     console.error("Unexpected Gemini response structure:", responseData);
                     throw new Error("Unexpected response structure from Gemini API.");
                 }

                const generatedText = responseData.candidates[0].content.parts[0].text;
                console.log("Generated Text from Gemini:", generatedText);

                let analysisResult;
                try {
                    const cleanedText = generatedText.replace(/^```json\s*|```$/g, '').trim();
                    analysisResult = JSON.parse(cleanedText);
                } catch (parseError) {
                    console.error("Failed to parse JSON response from Gemini:", parseError, "Raw text:", generatedText);
                    analysisResult = {
                         isProductive: generatedText.toLowerCase().includes('"productive"'),
                         recommendedTime: parseInt(generatedText.match(/"recommendedTime":\s*(\d+)/)?.[1] || '15'),
                         reason: generatedText.match(/"reason":\s*"([^"]+)"/)?.[1] || "Could not parse reason.",
                         potentialTransitions: generatedText.match(/"potentialTransitions":\s*(\[.*?\])/)?.[1] ? JSON.parse(generatedText.match(/"potentialTransitions":\s*(\[.*?\])/)[1]) : [],
                         personalizedAdvice: generatedText.match(/"personalizedAdvice":\s*"([^"]+)"/)?.[1] || "Could not parse advice.",
                         confidenceScore: 0.5
                    };
                     console.warn("Using fallback parsing for Gemini response.");
                }

                const isProductive = analysisResult.classification?.toLowerCase() === 'productive';

                resolve({
                    isProductive: isProductive,
                    recommendedTime: analysisResult.recommendedTime || 15,
                    reason: analysisResult.reason || "No reason provided by AI.",
                    potentialTransitions: analysisResult.potentialTransitions || [],
                    personalizedAdvice: analysisResult.personalizedAdvice || "No specific advice provided.",
                    confidenceScore: analysisResult.confidenceScore || 0.8
                });

            } catch (error) {
                console.error('Error calling Gemini API:', error);
                resolve({
                    isProductive: false,
                    recommendedTime: 15,
                    reason: `Error communicating with AI: ${error.message}`,
                    potentialTransitions: [],
                    personalizedAdvice: "Analysis could not be completed due to an error.",
                    confidenceScore: 0
                });
            }
        });
    });
}

function showTimeRecommendation(videoData, analysis) {
    // Remove any existing notification with the new ID
    const existingNotification = document.getElementById('wellbeing-time-recommendation');
    if (existingNotification) {
        existingNotification.remove();
    }

    // Format transitions as HTML list
    let transitionsHTML = 'None'; // Default text
    if (analysis.potentialTransitions && analysis.potentialTransitions.length > 0) {
        transitionsHTML = '<ul>' +
            analysis.potentialTransitions.map(transition => `<li>${transition}</li>`).join('') +
            '</ul>';
    }

    // Determine classification text and class
    const classificationText = analysis.isProductive !== undefined
        ? (analysis.isProductive ? 'Productive' : 'Distracting')
        : 'Unknown';
    const classificationClass = classificationText.toLowerCase(); // 'productive', 'distracting', or 'unknown'

    // Create enhanced notification with all Gemini fields
    const notification = document.createElement('div');
    notification.id = 'wellbeing-time-recommendation'; // Use the new ID
    notification.innerHTML = `
        <div class="wellbeing-header">
            <h3>${videoData.title || 'Video Title'}</h3>
            <button id="wellbeing-close-btn">×</button>
        </div>
        <div class="wellbeing-content">
            <p><strong>Category:</strong> ${videoData.category || 'Unknown'}</p>
            <p><strong>Classification:</strong> <span class="${classificationClass}">${classificationText}</span> (Confidence: ${analysis.confidenceScore?.toFixed(2) || 'N/A'})</p>
            <p><strong>Recommended Time:</strong> ${analysis.recommendedTime || 'N/A'} minutes</p>
            <div class="wellbeing-reason">
                <p><strong>Reason:</strong></p>
                <p>${analysis.reason || 'No reason provided.'}</p>
            </div>
             <div class="wellbeing-advice">
                 <p><strong>Advice:</strong></p>
                 <p>${analysis.personalizedAdvice || 'No advice provided.'}</p>
             </div>
            <div class="wellbeing-transitions">
                <p><strong>Potential Transitions:</strong></p>
                ${transitionsHTML}
            </div>
        </div>
    `;

    // Add CSS styles for the notification - Injecting styles directly
    // Check if style already exists to avoid duplicates
    let styleElement = document.getElementById('wellbeing-recommendation-styles');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'wellbeing-recommendation-styles';
        styleElement.textContent = `
            #wellbeing-time-recommendation {
                position: fixed;
                top: 200px; /* <<< ADJUSTED: Moved down to avoid overlap with timer */
                right: 20px;
                width: 320px;
                background-color: #ffffff; /* White background */
                color: #333333; /* Darker text */
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15); /* Softer shadow */
                z-index: 9998; /* <<< ADJUSTED: Slightly lower z-index than timer if needed */
                font-family: 'Roboto', Arial, sans-serif;
                overflow: hidden;
                border: 1px solid #e0e0e0; /* Light border */
                transition: opacity 0.3s ease, transform 0.3s ease;
                opacity: 1;
                transform: translateX(0);
            }
            #wellbeing-time-recommendation.hidden {
                 opacity: 0;
                 transform: translateX(100%);
                 pointer-events: none;
            }

            .wellbeing-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px 16px; /* Slightly less padding */
                background-color: #f1f1f1; /* Lighter header */
                color: #333333; /* Darker header text */
                border-bottom: 1px solid #e0e0e0;
            }

            .wellbeing-header h3 {
                margin: 0;
                font-size: 15px; /* Slightly smaller */
                font-weight: 500; /* Medium weight */
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 250px; /* Adjust width */
            }

            #wellbeing-close-btn {
                background: none;
                border: none;
                color: #666666; /* Gray close button */
                font-size: 24px; /* Larger click target */
                cursor: pointer;
                padding: 0 4px;
                line-height: 1;
                font-weight: bold;
            }
             #wellbeing-close-btn:hover {
                 color: #333333;
             }

            .wellbeing-content {
                padding: 12px 16px;
                max-height: 300px; /* Limit height and allow scroll */
                overflow-y: auto;
            }

            .wellbeing-content p {
                margin: 6px 0; /* Tighter spacing */
                font-size: 13px; /* Smaller base font */
                line-height: 1.5;
            }
             .wellbeing-content p strong {
                 font-weight: 500; /* Medium weight for labels */
                 color: #555555;
             }

            .wellbeing-reason, .wellbeing-transitions, .wellbeing-advice {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #eeeeee; /* Lighter separator */
            }
             .wellbeing-reason p:first-child,
             .wellbeing-transitions p:first-child,
             .wellbeing-advice p:first-child {
                 margin-top: 0; /* Remove extra margin above label */
             }

            .productive { /* Style for classification span */
                color: #2e7d32; /* Darker green */
                font-weight: bold;
            }

            .distracting { /* Style for classification span */
                color: #c62828; /* Darker red */
                font-weight: bold;
            }
             .unknown { /* Style for classification span */
                 color: #757575; /* Gray */
                 font-weight: normal;
             }

            .wellbeing-transitions ul {
                margin: 4px 0 8px 0;
                padding-left: 18px; /* Adjust indent */
                list-style: disc;
            }
             .wellbeing-transitions li {
                 margin-bottom: 4px;
             }
        `;
        document.head.appendChild(styleElement);
    }

    // Append the notification to the body
    document.body.appendChild(notification);

    // Add close button functionality
    const closeButton = document.getElementById('wellbeing-close-btn');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            // Optional: Add fade-out effect
            notification.classList.add('hidden');
            // Remove after transition
            setTimeout(() => {
                 notification.remove();
                 // Optionally remove the style element if no other notifications use it
                 // This might cause issues if another video loads quickly, so maybe leave it.
                 // if (!document.getElementById('wellbeing-time-recommendation') && styleElement) {
                 //    styleElement.remove();
                 // }
            }, 300); // Match transition duration
        });
    } else {
        console.error("Could not find close button for recommendation.");
    }

    console.log('UI Updated with complete analysis (new style):', analysis);
}

function debugLog(...args) {
    console.log('[YouTube Wellbeing]', ...args);
}

function createOrUpdateFloatingTimer() {
    console.log(">>> createOrUpdateFloatingTimer function started."); // Added log
    try {
        let timerDiv = document.getElementById('wellbeing-floating-timer');
        if (!timerDiv) {
            console.log("Timer div not found, creating new one."); // Added log
            timerDiv = document.createElement('div');
            timerDiv.id = 'wellbeing-floating-timer';
            timerDiv.className = 'wellbeing-timer-display'; // Use class from styles.css
            document.body.appendChild(timerDiv);
            console.log("Timer div appended to body."); // Added log
        } else {
            console.log("Timer div already exists, updating content."); // Added log
        }

        // Fetch actual timer data (e.g., from storage or background script)
        // For now, using placeholder values
        const doomscrollingTime = 30 * 60; // Placeholder
        const gamingTime = 15 * 60; // Placeholder

        timerDiv.innerHTML = `
            <div class="wellbeing-timer-title">Time Limits</div>
            <div class="wellbeing-timer-item">
                <span class="wellbeing-timer-category">Doomscrolling</span>
                <span class="wellbeing-timer-time" id="timer-doomscrolling-value">${formatTime(doomscrollingTime)}</span>
            </div>
            <div class="wellbeing-timer-item">
                <span class="wellbeing-timer-category">Gaming</span>
                <span class="wellbeing-timer-time" id="timer-gaming-value">${formatTime(gamingTime)}</span>
            </div>
            <!-- Add more categories as needed -->
        `;
        console.log("Timer div innerHTML updated."); // Added log
    } catch (error) {
        console.error("Error in createOrUpdateFloatingTimer:", error);
    }
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}