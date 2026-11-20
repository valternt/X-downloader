/**
 * X (Twitter) Video Downloader - Interceptor Script
 * Runs in the MAIN world at document_start.
 * Safely intercepts Twitter API responses to extract direct MP4 video URLs.
 * 100% clean, privacy-focused, zero external connections.
 */
(function () {
  'use strict';

  // Prevent duplicate execution
  if (window.__X_DOWNLOADER_INTERCEPTOR_INITIALIZED__) return;
  window.__X_DOWNLOADER_INTERCEPTOR_INITIALIZED__ = true;

  // Cache for captured tweets with videos: tweetId -> TweetMediaData
  const capturedTweets = new Map();
  let authHeaders = {
    authorization: 'Bearer AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA',
    csrfToken: ''
  };
  let tweetDetailEndpoint = null; // Caches the active TweetDetail endpoint url template

  // Helper to extract CSRF token from cookies
  function getCsrfToken() {
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : '';
  }

  // Format resolution label and dimensions from URL or bitrate
  function parseVariantInfo(variant) {
    let resolution = '';
    let label = '';
    const url = variant.url || '';

    // Check URL pattern like /vid/avc1/1280x720/ or /vid/720x1280/ or /vid/320x320/
    const dimMatch = url.match(/\/(\d+)x(\d+)\//);
    if (dimMatch) {
      const w = parseInt(dimMatch[1], 10);
      const h = parseInt(dimMatch[2], 10);
      const minDim = Math.min(w, h);
      const maxDim = Math.max(w, h);
      resolution = `${w}x${h}`;

      if (minDim >= 1080) {
        label = `1080p FHD (${resolution})`;
      } else if (minDim >= 720) {
        label = `720p HD (${resolution})`;
      } else if (minDim >= 480) {
        label = `480p SD (${resolution})`;
      } else if (minDim >= 360) {
        label = `360p (${resolution})`;
      } else {
        label = `${minDim}p (${resolution})`;
      }
    } else if (variant.bitrate) {
      const kbps = Math.round(variant.bitrate / 1000);
      if (kbps >= 2000) label = `고화질 (~${kbps} kbps)`;
      else if (kbps >= 800) label = `일반화질 (~${kbps} kbps)`;
      else label = `저용량 (~${kbps} kbps)`;
    } else {
      label = 'MP4 비디오';
    }

    return {
      bitrate: variant.bitrate || 0,
      url: variant.url,
      contentType: variant.content_type || 'video/mp4',
      resolution: resolution,
      label: label
    };
  }

  // Recursive parser to find all tweets with videos in any Twitter API response
  function parseDataForVideos(root) {
    if (!root || typeof root !== 'object') return [];
    const discovered = [];

    function processMediaList(mediaList, tweetId, authorInfo, fullText) {
      if (!Array.isArray(mediaList)) return;

      const mediaItems = [];
      for (const m of mediaList) {
        if (!m || (m.type !== 'video' && m.type !== 'animated_gif')) continue;
        const videoInfo = m.video_info;
        if (!videoInfo || !Array.isArray(videoInfo.variants)) continue;

        // Filter for progressive MP4s
        const mp4Variants = videoInfo.variants
          .filter(v => v && v.content_type === 'video/mp4' && v.url)
          .map(parseVariantInfo)
          .sort((a, b) => b.bitrate - a.bitrate);

        // Also check if m3u8 playlist is present (as a fallback)
        const hlsVariant = videoInfo.variants.find(v => v && v.content_type === 'application/x-mpegURL');

        if (mp4Variants.length > 0 || hlsVariant) {
          mediaItems.push({
            mediaId: m.id_str || m.id || String(Date.now()),
            type: m.type, // 'video' or 'animated_gif'
            poster: m.media_url_https || '',
            durationMs: videoInfo.duration_millis || 0,
            aspectRatio: videoInfo.aspect_ratio || [16, 9],
            variants: mp4Variants,
            hlsUrl: hlsVariant ? hlsVariant.url : null
          });
        }
      }

      if (mediaItems.length > 0 && tweetId) {
        const item = {
          tweetId: String(tweetId),
          username: authorInfo.screen_name || authorInfo.username || '',
          name: authorInfo.name || '',
          text: (fullText || '').trim(),
          media: mediaItems,
          // Primary media shortcut for convenience
          variants: mediaItems[0].variants,
          poster: mediaItems[0].poster,
          type: mediaItems[0].type,
          durationMs: mediaItems[0].durationMs,
          timestamp: Date.now()
        };
        discovered.push(item);
      }
    }

    function walk(node, currentTweetId = null, currentAuthor = {}, currentText = '') {
      if (!node || typeof node !== 'object') return;

      // Check if this node represents a Tweet
      let tweetId = currentTweetId;
      let author = currentAuthor;
      let text = currentText;

      if (typeof node.rest_id === 'string' && /^\d+$/.test(node.rest_id)) {
        tweetId = node.rest_id;
      } else if (typeof node.id_str === 'string' && /^\d+$/.test(node.id_str)) {
        tweetId = node.id_str;
      }

      // Check for user information
      if (node.core?.user_results?.result?.legacy) {
        author = node.core.user_results.result.legacy;
      } else if (node.core?.user_results?.result?.core) {
        author = node.core.user_results.result.core;
      } else if (node.user) {
        author = node.user;
      }

      // Check for tweet text
      if (typeof node.legacy?.full_text === 'string') {
        text = node.legacy.full_text;
      } else if (typeof node.note_tweet?.note_tweet_results?.result?.text === 'string') {
        text = node.note_tweet.note_tweet_results.result.text;
      } else if (typeof node.full_text === 'string') {
        text = node.full_text;
      } else if (typeof node.text === 'string') {
        text = node.text;
      }

      // Check for media in extended_entities
      const extMedia = node.extended_entities?.media ||
                        node.legacy?.extended_entities?.media ||
                        node.card?.legacy?.binding_values;

      if (node.extended_entities?.media) {
        processMediaList(node.extended_entities.media, tweetId, author, text);
      }
      if (node.legacy?.extended_entities?.media) {
        processMediaList(node.legacy.extended_entities.media, tweetId, author, text);
      }

      // Some video ads or broadcasts store in card binding values
      if (Array.isArray(node.media)) {
        processMediaList(node.media, tweetId, author, text);
      }

      // Recursively traverse children
      if (Array.isArray(node)) {
        for (let i = 0; i < node.length; i++) {
          walk(node[i], tweetId, author, text);
        }
      } else {
        for (const key of Object.keys(node)) {
          // Skip large user profile object branches to save CPU
          if (key === 'user_results' && node[key]?.result?.__typename === 'User') continue;
          walk(node[key], tweetId, author, text);
        }
      }
    }

    walk(root);
    return discovered;
  }

  // Broadcast newly captured media to ISOLATED content script
  function broadcastCapturedVideos(newItems) {
    if (!newItems || newItems.length === 0) return;
    let addedCount = 0;

    for (const item of newItems) {
      if (item && item.tweetId) {
        capturedTweets.set(item.tweetId, item);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      window.postMessage({
        type: 'X_DOWNLOADER_MEDIA_CAPTURED',
        items: newItems,
        allTweets: Array.from(capturedTweets.entries()).map(([k, v]) => [k, v])
      }, '*');
    }
  }

  // --- Fetch Interception ---
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const response = await originalFetch.apply(this, args);

    try {
      let requestUrl = '';
      if (typeof args[0] === 'string') {
        requestUrl = args[0];
      } else if (args[0] && typeof args[0].url === 'string') {
        requestUrl = args[0].url;
      }

      // Capture auth headers if present
      if (args[1] && args[1].headers) {
        const headers = args[1].headers;
        if (typeof headers.get === 'function') {
          if (headers.get('authorization')) authHeaders.authorization = headers.get('authorization');
          if (headers.get('x-csrf-token')) authHeaders.csrfToken = headers.get('x-csrf-token');
        } else if (typeof headers === 'object') {
          if (headers['authorization']) authHeaders.authorization = headers['authorization'];
          if (headers['x-csrf-token']) authHeaders.csrfToken = headers['x-csrf-token'];
        }
      }

      // Save TweetDetail endpoint template if seen
      if (requestUrl.includes('/TweetDetail')) {
        tweetDetailEndpoint = requestUrl;
      }

      // Check if this is an API call that might return tweets
      if (
        requestUrl.includes('/i/api/') ||
        requestUrl.includes('api.twitter.com') ||
        requestUrl.includes('api.x.com') ||
        requestUrl.includes('cdn.syndication.twimg.com')
      ) {
        const clone = response.clone();
        clone.json().then(data => {
          const videos = parseDataForVideos(data);
          if (videos.length > 0) {
            broadcastCapturedVideos(videos);
          }
        }).catch(() => {
          // Ignore non-json responses
        });
      }
    } catch (err) {
      // Ignore interception error to ensure Twitter works normally
    }

    return response;
  };

  // --- XMLHttpRequest Interception ---
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const originalSetRequestHeader = XMLHttpRequest.prototype.setRequestHeader;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._x_url = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.setRequestHeader = function (header, value) {
    if (header && value) {
      const lower = header.toLowerCase();
      if (lower === 'authorization') authHeaders.authorization = value;
      if (lower === 'x-csrf-token') authHeaders.csrfToken = value;
    }
    return originalSetRequestHeader.call(this, header, value);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const url = this._x_url || '';
        if (
          url.includes('/i/api/') ||
          url.includes('api.twitter.com') ||
          url.includes('api.x.com')
        ) {
          if (url.includes('/TweetDetail')) {
            tweetDetailEndpoint = url;
          }
          if (this.responseText) {
            const data = JSON.parse(this.responseText);
            const videos = parseDataForVideos(data);
            if (videos.length > 0) {
              broadcastCapturedVideos(videos);
            }
          }
        }
      } catch (err) {
        // Silently continue
      }
    });

    return originalSend.apply(this, args);
  };

  // --- Listen for on-demand fetch requests from content script ---
  window.addEventListener('message', async (event) => {
    if (!event.data || event.source !== window) return;

    if (event.data.type === 'X_DOWNLOADER_GET_TWEET_MEDIA') {
      const { tweetId, requestId } = event.data;
      if (!tweetId) return;

      // 1. If already cached, respond immediately
      if (capturedTweets.has(tweetId)) {
        window.postMessage({
          type: 'X_DOWNLOADER_TWEET_MEDIA_RESPONSE',
          requestId,
          tweetId,
          data: capturedTweets.get(tweetId)
        }, '*');
        return;
      }

      // 2. Try fetching from Twitter's TweetDetail if we have the endpoint template
      try {
        const csrf = authHeaders.csrfToken || getCsrfToken();
        if (tweetDetailEndpoint && csrf) {
          // Replace tweetId in the variables query param
          const urlObj = new URL(tweetDetailEndpoint, window.location.origin);
          const variables = JSON.parse(urlObj.searchParams.get('variables') || '{}');
          variables.focalTweetId = tweetId;
          urlObj.searchParams.set('variables', JSON.stringify(variables));

          const res = await originalFetch(urlObj.toString(), {
            headers: {
              'authorization': authHeaders.authorization,
              'x-csrf-token': csrf,
              'x-twitter-active-user': 'yes',
              'x-twitter-auth-type': 'OAuth2Session'
            },
            credentials: 'include'
          });

          if (res.ok) {
            const data = await res.json();
            const videos = parseDataForVideos(data);
            broadcastCapturedVideos(videos);
            const found = capturedTweets.get(tweetId);
            window.postMessage({
              type: 'X_DOWNLOADER_TWEET_MEDIA_RESPONSE',
              requestId,
              tweetId,
              data: found || null
            }, '*');
            return;
          }
        }
      } catch (e) {
        // On error, respond with null
      }

      window.postMessage({
        type: 'X_DOWNLOADER_TWEET_MEDIA_RESPONSE',
        requestId,
        tweetId,
        data: null
      }, '*');
    }
  });

  // Ready signal
  window.postMessage({ type: 'X_DOWNLOADER_INTERCEPTOR_READY' }, '*');
})();
