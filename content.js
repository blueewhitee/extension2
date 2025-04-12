// Global variable to store video categories
let videoCategories = { categories: {} };
let CONFIG = {};
let currentAnalysis = null;
let isInitialized = false; // Flag to prevent multiple initializations
let userAnalysisData = null; // Global variable for user analysis data
let timerSettings = null; // Global variable for timer settings
let timerState = null; // Global variable for current timer values (seconds)
let timerInterval = null; // Interval ID for the timer loop
const SAVE_INTERVAL_MS = 15000; // Save state every 15 seconds
let lastSaveTime = 0;

// Load configuration and user analysis data
async function loadConfigAndProfile() {
    if (isInitialized) return;
    console.log('Attempting to load config, profile, settings, and state...');

    // --- LOAD User Analysis Data ---
    try {
        const result = await chrome.storage.local.get('userAnalysisData');
        if (result.userAnalysisData) {
            userAnalysisData = result.userAnalysisData;
            console.log('User analysis data loaded successfully:', userAnalysisData);
        } else {
            console.log('No user analysis data found in storage.');
            userAnalysisData = null;
        }
    } catch (error) {
        console.error('Error loading user analysis data:', error);
        userAnalysisData = null;
    }
    // --- END Load User Analysis Data ---

    // --- Load Timer Settings (from sync) ---
    try {
        const settingsResult = await chrome.storage.sync.get('timerSettings');
        if (settingsResult.timerSettings) {
            timerSettings = settingsResult.timerSettings;
            console.log('Timer settings loaded successfully:', timerSettings);
        } else {
            console.log('No timer settings found in sync storage. Using defaults.');
            timerSettings = {
                distractingLimit: 30 * 60, // Default 30 mins
                enableAutoblock: true,
                redirectUrl: 'https://www.google.com',
                hideRecommendations: true
            };
        }
    } catch (error) {
        console.error('Error loading timer settings:', error);
        timerSettings = { distractingLimit: 30 * 60, enableAutoblock: true, redirectUrl: 'https://www.google.com', hideRecommendations: true };
    }
    // --- END Load Timer Settings ---

    // --- Load Timer State (from local) ---
    try {
        const stateResult = await chrome.storage.local.get('timerState');
        if (stateResult.timerState) {
            timerState = stateResult.timerState;
            console.log('Timer state loaded successfully:', timerState);
        } else {
            console.log('No timer state found in local storage. Initializing.');
            timerState = {
                distracting: timerSettings.distractingLimit,
                lastUpdated: Date.now()
            };
            await chrome.storage.local.set({ timerState: timerState });
        }
    } catch (error) {
        console.error('Error loading timer state:', error);
        timerState = { distracting: timerSettings.distractingLimit, lastUpdated: Date.now() };
    }
    // --- END Load Timer State ---

    // Load config (existing logic)
    try {
        console.log('Attempting to load config...'); // Added log
        const configModule = await import(chrome.runtime.getURL('config.js'));
        CONFIG = configModule.CONFIG; // Access the exported CONFIG object
        console.log('Config loaded successfully:', CONFIG);
    } catch (error) {
        console.error('Error loading config:', error);
        CONFIG = {
            YOUTUBE_API_KEY: 'YOUR_YOUTUBE_API_KEY_FALLBACK',
            GEMINI_API_KEY: 'YOUR_GEMINI_API_KEY_FALLBACK',
            API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
            SYSTEM_PROMPT: 'Analyze YouTube video content for productivity.'
        };
        console.log('Using fallback config.');
    }

    // Proceed to initialize extension
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

        if (currentVideoId && (currentVideoId !== lastVideoId || currentUrl !== lastUrl)) {
            console.log('Video or URL changed, analyzing metadata for:', currentVideoId);
            lastVideoId = currentVideoId;
            lastUrl = currentUrl;

            if (videoDataCache.has(currentVideoId)) {
                console.log('Using cached data for video:', currentVideoId);
                const cachedData = videoDataCache.get(currentVideoId);
                processVideoData(cachedData);
                analyzeAndShowRecommendation(cachedData);
                return;
            }

            const now = Date.now();
            if (now - lastApiCallTime >= API_THROTTLE_MS) {
                console.log('Making API call for video:', currentVideoId);
                lastApiCallTime = now;
                fetchVideoData(currentVideoId);
            } else {
                console.log(`Throttling API call, using DOM data for:`, currentVideoId);
                const basicInfo = getVideoInfoFromDOM();
                processBasicVideoData(currentVideoId, basicInfo);
                showTimeRecommendation(
                    { videoId: currentVideoId, title: basicInfo.title, category: basicInfo.category },
                    { isProductive: false, recommendedTime: 15, reason: "Throttled - basic info only", potentialTransitions: [], personalizedAdvice: "Full analysis pending." }
                );
            }
        }
    }

    window.addEventListener('yt-navigate-finish', checkForVideoChange);
    window.addEventListener('yt-page-data-updated', checkForVideoChange);

    console.log("Scheduling initial video check..."); // Added log
    setTimeout(checkForVideoChange, 2000);

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
            currentAnalysis = { ...videoData };
            return;
        }

        console.log('Requesting new Gemini analysis for:', videoData.videoId);
        const analysis = await sendToGeminiAPI(videoData);

        const enhancedData = { ...videoData, ...analysis };

        videoDataCache.set(videoData.videoId, enhancedData);

        showTimeRecommendation(enhancedData, analysis);

        currentAnalysis = {
            isProductive: analysis.isProductive,
            category: videoData.category,
            recommendedTime: analysis.recommendedTime,
            reason: analysis.reason,
            potentialTransitions: analysis.potentialTransitions,
            personalizedAdvice: analysis.personalizedAdvice,
            confidenceScore: analysis.confidenceScore,
            videoId: videoData.videoId
        };

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
            processVideoData(cachedData);
            analyzeAndShowRecommendation(cachedData);
        }
        return;
    }
    if (!chrome.runtime?.id) { return; }
    chrome.storage.sync.get(['youtubeApiKey'], (result) => {
        const apiKey = result.youtubeApiKey || CONFIG.YOUTUBE_API_KEY;
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
    if (isInitialized) {
        console.log('Extension already initialized, skipping setup.');
        return;
    }
    if (!chrome.runtime?.id) {
        console.error('Extension context invalidated. Cannot initialize.');
        return;
    }

    console.log('Initializing extension core logic...');

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
            videoCategories = { categories: {} };
            console.log('Using fallback categories.');
        })
        .finally(() => {
            console.log("Setting up detection after category load attempt."); // Added log
            const cleanup = setupVideoChangeDetection();
            isInitialized = true;
            console.log('Extension initialization complete.');

            console.log("Attempting to create/update floating timer...");
            createOrUpdateFloatingTimer(); // Update UI with loaded state

            console.log("Starting timer loop..."); // Added log
            startTimerLoop(); // Start the main timer loop
        });
}

// Use DOMContentLoaded to trigger the combined load function
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadConfigAndProfile);
} else {
    loadConfigAndProfile();
}

// Listener for messages (including profile updates)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'REINITIALIZE') {
        console.log('Received REINITIALIZE message. Resetting and reloading config.');
        isInitialized = false;
        loadConfigAndProfile();
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'GET_CURRENT_ANALYSIS') {
        sendResponse(currentAnalysis);
        return true;
    } else if (message.action === 'getCurrentVideoInfo') {
        console.log("Popup requested current video info.");
        const videoId = getVideoIdFromUrl(window.location.href);
        const responseData = currentAnalysis && currentAnalysis.videoId === videoId
            ? { success: true, ...currentAnalysis }
            : { success: true, ...getVideoInfoFromDOM(), isProductive: undefined };

        console.log("Sending to popup:", responseData);
        sendResponse(responseData);
        return true;
    } else if (message.type === 'PROFILE_UPDATED') {
        console.log('Received PROFILE_UPDATED message. Reloading user analysis data...');
        chrome.storage.local.get('userAnalysisData', (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error reloading user analysis data:", chrome.runtime.lastError);
                return;
            }
            if (result.userAnalysisData) {
                userAnalysisData = result.userAnalysisData;
                console.log('User analysis data reloaded:', userAnalysisData);
            } else {
                userAnalysisData = null;
                console.log('User analysis data removed or not found after update.');
            }
        });
        sendResponse({ success: true });
        return true;
    } else if (message.type === 'SETTINGS_UPDATED') {
        console.log('Received SETTINGS_UPDATED message. Reloading timer settings...');
        chrome.storage.sync.get('timerSettings', (result) => {
            if (chrome.runtime.lastError) {
                console.error("Error reloading timer settings:", chrome.runtime.lastError);
                return;
            }
            if (result.timerSettings) {
                const oldLimit = timerSettings?.distractingLimit;
                timerSettings = result.timerSettings;
                console.log('Timer settings reloaded:', timerSettings);

                if (timerState && oldLimit !== timerSettings.distractingLimit) {
                    console.log("Distracting limit changed. Resetting timer.");
                    timerState.distracting = timerSettings.distractingLimit;
                    updateFloatingTimerUI();
                    saveTimerState(true);
                }
            } else {
                console.log('Timer settings not found after update message.');
            }
        });
        sendResponse({ success: true });
        return true;
    }
});

// --- NEW Timer Loop Function ---
function startTimerLoop() {
    if (timerInterval) {
        clearInterval(timerInterval);
    }

    timerInterval = setInterval(() => {
        if (!timerState || !timerSettings) return;

        const videoElement = document.querySelector('video');
        const isPlaying = videoElement && !videoElement.paused && !document.hidden;
        let timeDecremented = false;

        if (isPlaying && currentAnalysis) {
            if (!currentAnalysis.isProductive) {
                if (timerState.distracting > 0) {
                    timerState.distracting--;
                    timeDecremented = true;
                    if (timerState.distracting === 0) {
                        console.log("Distracting time limit reached!");
                        if (timerSettings.enableAutoblock) {
                            console.log("Autoblock enabled. Redirecting to:", timerSettings.redirectUrl);
                            window.location.href = timerSettings.redirectUrl;
                            clearInterval(timerInterval);
                            timerInterval = null;
                        } else {
                            console.log("Autoblock disabled. Limit reached notification needed.");
                        }
                    }
                }
            }
        }

        if (timeDecremented) {
            updateFloatingTimerUI();
        }

        const now = Date.now();
        if (now - lastSaveTime > SAVE_INTERVAL_MS) {
            saveTimerState();
        }

    }, 1000);
}

// --- NEW Function to Update Floating Timer UI ---
function updateFloatingTimerUI() {
    if (!timerState) return;

    const doomValueElement = document.getElementById('timer-doomscrolling-value');

    if (doomValueElement) {
        doomValueElement.textContent = formatTime(timerState.distracting);
        const limit = timerSettings?.distractingLimit || 1;
        const percentage = (timerState.distracting / limit) * 100;
        const parentItem = doomValueElement.closest('.wellbeing-timer-item');
        if (parentItem) {
            parentItem.classList.remove('warning', 'low');
            if (percentage < 10) {
                parentItem.classList.add('low');
            } else if (percentage < 30) {
                parentItem.classList.add('warning');
            }
        }
    }
}

// --- NEW Function to Save Timer State ---
async function saveTimerState(force = false) {
    if (!timerState) return;
    if (!force && Date.now() - lastSaveTime <= SAVE_INTERVAL_MS) return;

    try {
        timerState.lastUpdated = Date.now();
        await chrome.storage.local.set({ timerState: timerState });
        lastSaveTime = Date.now();
    } catch (error) {
        console.error("Error saving timer state:", error);
    }
}

// --- Modify createOrUpdateFloatingTimer to use loaded state ---
function createOrUpdateFloatingTimer() {
    console.log(">>> createOrUpdateFloatingTimer function started.");
    try {
        let timerDiv = document.getElementById('wellbeing-floating-timer');
        if (!timerDiv) {
            console.log("Timer div not found, creating new one.");
            timerDiv = document.createElement('div');
            timerDiv.id = 'wellbeing-floating-timer';
            timerDiv.className = 'wellbeing-timer-display';
            document.body.appendChild(timerDiv);
            console.log("Timer div appended to body.");
        } else {
            console.log("Timer div already exists, updating content.");
        }

        const distractingTime = timerState?.distracting ?? timerSettings?.distractingLimit ?? (30 * 60);

        timerDiv.innerHTML = `
            <div class="wellbeing-timer-title">Time Limits</div>
            <div class="wellbeing-timer-item">
                <span class="wellbeing-timer-category">Doomscrolling</span>
                <span class="wellbeing-timer-time" id="timer-doomscrolling-value">${formatTime(distractingTime)}</span>
            </div>
        `;
        console.log("Timer div innerHTML updated with initial values.");
        updateFloatingTimerUI();

    } catch (error) {
        console.error("Error in createOrUpdateFloatingTimer:", error);
    }
}

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
    console.log("Using user analysis data for context:", userAnalysisData);

    return new Promise((resolve, reject) => {
        chrome.storage.sync.get(['geminiApiKey'], async (result) => {
            const apiKey = result.geminiApiKey || CONFIG.GEMINI_API_KEY;

            if (!apiKey || apiKey === 'YOUR_GEMINI_API_KEY_FALLBACK') {
                console.error('Valid Gemini API Key not found. Cannot perform analysis.');
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

            let personalizationContext = "";
            if (userAnalysisData) {
                personalizationContext = "\n\nUser's Historical Viewing Context (for personalization):";

                if (userAnalysisData.dominantTopics && userAnalysisData.dominantTopics.length > 0) {
                    const topics = userAnalysisData.dominantTopics.slice(0, 5).map(t => `${t.name} (${t.percentage.toFixed(1)}%)`).join(', ');
                    personalizationContext += `\n- Frequently Watched Topics: ${topics}`;
                }

                if (userAnalysisData.formatDistribution) {
                    personalizationContext += `\n- Viewing Format: ${userAnalysisData.formatDistribution.shortForm}% Short-form, ${userAnalysisData.formatDistribution.longForm}% Long-form`;
                }

                if (userAnalysisData.psychologicalPatterns && userAnalysisData.psychologicalPatterns.length > 0) {
                    const patterns = userAnalysisData.psychologicalPatterns.slice(0, 3).map(p => p.title).join('; ');
                    personalizationContext += `\n- Observed Patterns: ${patterns}`;
                }

                if (userAnalysisData.keyInsights?.algorithmicInsight) {
                    const limitsMatch = userAnalysisData.keyInsights.algorithmicInsight.match(/Recommended daily viewing time limits:(.*)/i);
                    if (limitsMatch && limitsMatch[1]) {
                        personalizationContext += `\n- Previously Suggested Limits: ${limitsMatch[1].trim()}`;
                    }
                }

                if (userAnalysisData.categoryTransitions && userAnalysisData.categoryTransitions.length > 0) {
                    const topTransition = userAnalysisData.categoryTransitions[0];
                    personalizationContext += `\n- Common Transition: From '${topTransition.from}' to '${topTransition.to}' (Strength: ${topTransition.strength})`;
                }
            } else {
                personalizationContext = "\n\n(No historical user analysis data available for personalization)";
            }

            const userPrompt = `Analyze the following YouTube video:\nTitle: ${videoData.title}\nChannel: ${videoData.channelTitle}\nCategory: ${videoData.category}\nDuration: ${videoData.duration} seconds\nViews: ${videoData.views}\nLikes: ${videoData.likes}\nPublished: ${videoData.publishedAt}\nIs Short: ${videoData.isShort}${personalizationContext}`;

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
    const existingNotification = document.getElementById('wellbeing-time-recommendation');
    if (existingNotification) {
        existingNotification.remove();
    }

    let transitionsHTML = 'None';
    if (analysis.potentialTransitions && analysis.potentialTransitions.length > 0) {
        transitionsHTML = '<ul>' +
            analysis.potentialTransitions.map(transition => `<li>${transition}</li>`).join('') +
            '</ul>';
    }

    const classificationText = analysis.isProductive !== undefined
        ? (analysis.isProductive ? 'Productive' : 'Distracting')
        : 'Unknown';
    const classificationClass = classificationText.toLowerCase();

    const notification = document.createElement('div');
    notification.id = 'wellbeing-time-recommendation';
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

    let styleElement = document.getElementById('wellbeing-recommendation-styles');
    if (!styleElement) {
        styleElement = document.createElement('style');
        styleElement.id = 'wellbeing-recommendation-styles';
        styleElement.textContent = `
            #wellbeing-time-recommendation {
                position: fixed;
                top: 200px;
                right: 20px;
                width: 320px;
                background-color: #ffffff;
                color: #333333;
                border-radius: 8px;
                box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
                z-index: 9998;
                font-family: 'Roboto', Arial, sans-serif;
                overflow: hidden;
                border: 1px solid #e0e0e0;
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
                padding: 10px 16px;
                background-color: #f1f1f1;
                color: #333333;
                border-bottom: 1px solid #e0e0e0;
            }

            .wellbeing-header h3 {
                margin: 0;
                font-size: 15px;
                font-weight: 500;
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
                max-width: 250px;
            }

            #wellbeing-close-btn {
                background: none;
                border: none;
                color: #666666;
                font-size: 24px;
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
                max-height: 300px;
                overflow-y: auto;
            }

            .wellbeing-content p {
                margin: 6px 0;
                font-size: 13px;
                line-height: 1.5;
            }
            .wellbeing-content p strong {
                font-weight: 500;
                color: #555555;
            }

            .wellbeing-reason, .wellbeing-transitions, .wellbeing-advice {
                margin-top: 10px;
                padding-top: 10px;
                border-top: 1px solid #eeeeee;
            }
            .wellbeing-reason p:first-child,
            .wellbeing-transitions p:first-child,
            .wellbeing-advice p:first-child {
                margin-top: 0;
            }

            .productive {
                color: #2e7d32;
                font-weight: bold;
            }

            .distracting {
                color: #c62828;
                font-weight: bold;
            }
            .unknown {
                color: #757575;
                font-weight: normal;
            }

            .wellbeing-transitions ul {
                margin: 4px 0 8px 0;
                padding-left: 18px;
                list-style: disc;
            }
            .wellbeing-transitions li {
                margin-bottom: 4px;
            }
        `;
        document.head.appendChild(styleElement);
    }

    document.body.appendChild(notification);

    const closeButton = document.getElementById('wellbeing-close-btn');
    if (closeButton) {
        closeButton.addEventListener('click', () => {
            notification.classList.add('hidden');
            setTimeout(() => {
                notification.remove();
            }, 300);
        });
    } else {
        console.error("Could not find close button for recommendation.");
    }

    console.log('UI Updated with complete analysis (new style):', analysis);
}

function debugLog(...args) {
    console.log('[YouTube Wellbeing]', ...args);
}

function formatTime(seconds) {
    if (isNaN(seconds) || seconds < 0) return "00:00";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}