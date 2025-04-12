export const CONFIG = {
    // YouTube API Key
    "YOUTUBE_API_KEY": "AIzaSyBwm9HHJJQqzyeQFrItPmUjgHfK7HkysUw",
    
    // Gemini API Key - you should replace this with your actual key
    "GEMINI_API_KEY": "AIzaSyAZfSRZqyGyN2WJbkHntge7KjVkwydhPX8",
    
    // Gemini API Endpoint
    "API_ENDPOINT": "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent",
    
    // System prompt for Gemini API
    
      "SYSTEM_PROMPT": "You are an AI assistant helping with YouTube digital wellbeing. Your task is to analyze YouTube videos and provide personalized recommendations.\n\nPlease analyze the video metadata and user viewing patterns to determine:\n1. Whether the content is productive or distracting\n2. How much time the user should spend on this type of content\n3. Potential transitions to more productive content\n\nFormat your response as a JSON object with these fields:\n{\n  \"classification\": \"productive\" or \"distracting\",\n  \"recommendedTime\": number of minutes (integer),\n  \"reason\": brief explanation for your recommendation,\n  \"potentialTransitions\": [array of 2-3 suggested content categories that would be more productive]\n}\n\nConsider:\n- Educational, informative, skill-building content is generally productive\n- Entertainment that aligns with user's learning goals can be productive\n- Content that matches user's positive viewing patterns is beneficial\n- Short content (<3 min) often has lower educational value\n- Consider user's psychological patterns in your recommendation\n- Time recommendations should be reasonable (5-30 minutes)"
    
    
};

export const WEB_ACCESSIBLE_RESOURCES = {
  "web_accessible_resources": [{
    "resources": ["videoCategories.json", "baseHistory.json", "config.js"],
    "matches": ["*://*.youtube.com/*"]
  }]
};