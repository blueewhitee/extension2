# YouTube Digital Wellbeing Extension

## Overview

YouTube Digital Wellbeing is a Chrome extension designed to help users manage their YouTube viewing habits by monitoring video content, classifying videos as productive or distracting, setting time limits for different content types, and redirecting users away from potentially addictive content (including YouTube Shorts).

The extension uses Google's Gemini AI to analyze video content and provide personalized recommendations based on the user's viewing patterns, helping create a healthier relationship with YouTube.

## Key Features

### 1. Time Tracking & Limits
- **Doomscrolling Timer**: Tracks time spent watching distracting content
- **Automatic Redirection**: Redirects users when time limits are reached
- **Visual Indicators**: Shows remaining time with color-coded warnings
- **Persistent Timer**: Timer state persists across browser sessions

### 2. Content Classification
- **AI-Powered Analysis**: Uses Google's Gemini API to classify videos as "Productive" or "Distracting"
- **Personalized Recommendations**: Tailors time recommendations based on video category, content, and user patterns
- **Real-time Analysis**: Analyzes videos as you watch them

### 3. Smart Shorts Handling
- **Automatic Shorts Redirection**: Immediately redirects away from YouTube Shorts
- **Customizable Redirection**: Configurable redirection URL in settings

### 4. Data Management
- **User Analysis Data**: Upload pre-analyzed data to personalize recommendations
- **Data Export**: Export your viewing data for backup or external analysis
- **Privacy-Focused**: All data stored locally in your browser

### 5. Notification System
- **Video Classifications**: Shows classifications for current videos
- **Time Recommendations**: Suggests appropriate viewing durations
- **Potential Transitions**: Recommends more productive content categories

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in the top-right corner)
4. Click "Load unpacked" and select the extension folder
5. The extension is now installed and will activate on YouTube pages

## Configuration

### API Keys

This extension requires two API keys to function fully:

1. **YouTube Data API Key**: Required to fetch detailed video information
   - Get it from [Google Cloud Console](https://console.cloud.google.com/)
   - Enable YouTube Data API v3

2. **Gemini API Key**: Required for AI content analysis
   - Get it from [Google AI Studio](https://makersuite.google.com/app/apikey)

Both keys are configured in the extension's `config.js` file or saved to Chrome's sync storage.

### Settings

The extension offers several customizable settings in the popup UI:

1. **Time Limits**
   - Set the time limit for distracting content (1-120 minutes)

2. **Redirect Settings**
   - Configure where you're redirected when time limits are reached
   - Default: `https://www.google.com`

3. **Options**
   - **Auto-block after time limit**: Enable/disable automatic redirection when time runs out
   - **Hide blocked category recommendations**: Control whether recommendations for blocked content are shown

## User Interface

### Popup UI

The extension's popup has three main tabs:

#### 1. Timers Tab
- Displays your current "Doomscrolling Content" timer with remaining time
- Shows information about the current video:
  - Title
  - Category
  - Classification (Productive/Distracting)

#### 2. Analyzed Data Tab
- Upload pre-analyzed data in JSON format
- Export your current analysis data

#### 3. Settings Tab
- Configure time limits, redirection URLs, and behavior options

### In-Page UI

When browsing YouTube, the extension adds:

1. **Floating Timer Display**
   - Shows remaining time for distracting content
   - Changes color as time decreases (warning → critical)

2. **Video Classification Notification**
   - Appears when a new video is analyzed
   - Shows classification, recommended viewing time, and reasons
   - Provides personalized advice and potential content transitions
   - Can be dismissed by clicking the close button

## Technical Details

### Architecture

The extension uses a standard Chrome extension architecture with:

1. **Manifest File (`manifest.json`)**
   - Defines permissions, resources, and components
   - Uses Manifest V3 specification

2. **Background Script (`background.js`)**
   - Service worker that runs in the background
   - Handles URL monitoring and content script injection
   - Automatically redirects YouTube Shorts URLs
   - Initializes extension settings

3. **Content Script (`content.js`)**
   - Injected into YouTube pages
   - Detects video changes and extracts metadata
   - Communicates with Gemini API for content analysis
   - Manages timers and UI overlays
   - Tracks time spent on different content types

4. **Popup (`popup.html`, `popup.js`)**
   - User interface for viewing timers and managing settings
   - Communicates with the content script to display and update information

5. **Configuration (`config.js`)**
   - Stores API keys and endpoints
   - Defines the AI system prompt

### Data Flow

1. When you open a YouTube page, `background.js` injects `content.js`
2. `content.js` detects when videos change and extracts video metadata
3. Video information is sent to the Gemini API for analysis
4. Analysis results determine if the content is productive or distracting
5. If distracting, the timer counts down while you watch
6. If you exceed your time limit, you're redirected to your configured URL
7. All settings and timer states are stored in Chrome's storage for persistence

### Storage

The extension uses two types of Chrome storage:

1. **Local Storage** (`chrome.storage.local`)
   - `timerState`: Current timer values and timestamp
   - `userAnalysisData`: Uploaded user analysis data

2. **Sync Storage** (`chrome.storage.sync`)
   - `timerSettings`: Time limits and behavior settings
   - `youtubeApiKey` & `geminiApiKey`: API keys

### APIs Used

1. **Chrome Extension APIs**
   - `chrome.tabs`: For accessing and manipulating browser tabs
   - `chrome.storage`: For persistent data storage
   - `chrome.scripting`: For injecting the content script
   - `chrome.runtime`: For message passing between components

2. **External APIs**
   - **YouTube Data API v3**: Fetches detailed video information
   - **Gemini API**: Analyzes video content and provides recommendations

## Personalization System

The extension can be personalized by uploading a JSON file containing analysis of your viewing patterns, which enhances the AI recommendations:

### Analysis Data Structure
- `dominantTopics`: Your most frequently watched topics
- `formatDistribution`: Breakdown of short-form vs. long-form content consumption
- `psychologicalPatterns`: Identified viewing behavior patterns
- `keyInsights`: Algorithmic insights about your viewing habits
- `categoryTransitions`: Common transitions between content categories

## Troubleshooting

### Common Issues

1. **"Error contacting content script"**
   - This usually happens when the popup is opened before the content script is fully loaded
   - Try refreshing the YouTube page and reopening the popup
   - Make sure you're on a YouTube video page or homepage (not search results or channels)

2. **No Video Information**
   - Ensure you're on a YouTube watch page (`youtube.com/watch?v=...`)
   - The homepage will have limited information available

3. **Timer Not Working**
   - Verify you have allowed the extension all requested permissions
   - Check if the video is properly classified (some videos may need time to analyze)

4. **API Errors**
   - Ensure your API keys are correctly configured in `config.js`
   - Check for API quota limitations or expired keys

## Privacy Considerations

- All analysis data is stored locally in your browser
- The extension requires access to your YouTube browsing to function
- Video data is sent to Google's Gemini API for analysis
- No data is sent to any third-party servers beyond the Google APIs

## Development

### Project Structure
```
extension2/
├── manifest.json       # Extension manifest
├── background.js       # Service worker script
├── content.js          # Content script injected into YouTube
├── popup.html          # Popup UI structure
├── popup.js            # Popup logic
├── styles.css          # CSS for injected UI elements
├── config.js           # API keys and configuration
└── videoCategories.json # Mapping of YouTube category IDs to names
```

### Building and Testing
1. Make changes to the appropriate files
2. Go to `chrome://extensions/` in Chrome
3. Click the reload button on the extension card
4. Open YouTube to test your changes

## Credits and Acknowledgments

- This extension uses the Gemini 2.0 Flash AI model from Google
- YouTube category data based on the official YouTube API documentation
- UI design inspired by YouTube's own interface for seamless integration

## License

This project is intended for educational purposes and personal use.

---

*Note: API keys included in the source code are examples and may not be valid. Replace them with your own keys for full functionality.*