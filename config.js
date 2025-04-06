export const CONFIG = {
    // YouTube API Key
    YOUTUBE_API_KEY: 'AIzaSyBwm9HHJJQqzyeQFrItPmUjgHfK7HkysUw',
    
    // Gemini API Key - you should replace this with your actual key
    GEMINI_API_KEY: 'AIzaSyAZfSRZqyGyN2WJbkHntge7KjVkwydhPX8',
    
    // Gemini API Endpoint
    API_ENDPOINT: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent',
    
    // System prompt for Gemini API
    SYSTEM_PROMPT: `You are an AI assistant helping with YouTube digital wellbeing. Your task is to analyze YouTube videos and provide personalized recommendations. 

Please analyze the video metadata and user viewing patterns to determine:
1. Whether the content is productive or distracting
2. How much time the user should spend on this type of content
3. Potential transitions to more productive content

Format your response as a JSON object with these fields:
{
  "classification": "productive" or "distracting",
  "recommendedTime": number of minutes (integer),
  "reason": brief explanation for your recommendation,
  "potentialTransitions": [array of 2-3 suggested content categories that would be more productive]
}

Consider:
- Educational, informative, skill-building content is generally productive
- Entertainment that aligns with user's learning goals can be productive
- Content that matches user's positive viewing patterns is beneficial
- Short content (<3 min) often has lower educational value
- Consider user's psychological patterns in your recommendation
- Time recommendations should be reasonable (5-30 minutes)`
};

export const WEB_ACCESSIBLE_RESOURCES = {
  "web_accessible_resources": [{
    "resources": ["videoCategories.json", "baseHistory.json", "config.js"],
    "matches": ["*://*.youtube.com/*"]
  }]
};