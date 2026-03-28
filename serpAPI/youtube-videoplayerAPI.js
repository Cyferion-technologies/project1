const { getJson } = require("serpapi");

// Minimal SerpAPI example for the single-video detail engine.
// Fetches metadata for one video id and prints the full response object.
getJson({
  engine: "youtube_video",
  v: "vFcS080VYQ0",
  api_key: "e6c0a3ebf84e7c71c093acb435ed4262055f1f7948d61e9394fdf7aeaac66594"
}, (json) => {
  console.log(json);
});