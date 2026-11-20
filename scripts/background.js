/**
 * X (Twitter) Video Downloader - Service Worker
 * Handles file downloads, tab media persistence, and icon badges.
 * Ephemeral Manifest V3 compliant (persists state in chrome.storage.local).
 */

// Set initial defaults on install
chrome.runtime.onInstalled.addListener(async () => {
  const current = await chrome.storage.local.get(['autoDownloadBest', 'filenameFormat']);
  if (current.autoDownloadBest === undefined) {
    await chrome.storage.local.set({
      autoDownloadBest: false,
      filenameFormat: 'user_id_quality'
    });
  }
});

// Update extension icon badge for active tab
async function updateBadge(tabId, count) {
  try {
    if (!tabId || tabId < 0) return;
    if (count > 0) {
      await chrome.action.setBadgeText({ tabId, text: String(count) });
      await chrome.action.setBadgeBackgroundColor({ tabId, color: '#1d9bf0' });
    } else {
      await chrome.action.setBadgeText({ tabId, text: '' });
    }
  } catch (err) {
    // Tab might have closed
  }
}

// Clean up tab storage when tab is closed
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await chrome.storage.local.remove(`tab_media_${tabId}`);
});

// Reset badge and storage on navigation
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    await updateBadge(tabId, 0);
  }
});

// Handle incoming messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.action) return false;

  // 1. Download Media File
  if (message.action === 'DOWNLOAD_MEDIA') {
    const { url, filename } = message;
    if (!url) {
      sendResponse({ success: false, error: 'No URL provided' });
      return false;
    }

    chrome.downloads.download({
      url: url,
      filename: filename || 'x_video.mp4',
      saveAs: false,
      conflictAction: 'uniquify'
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('Download error:', chrome.runtime.lastError);
        sendResponse({ success: false, error: chrome.runtime.lastError.message });
      } else {
        sendResponse({ success: true, downloadId });
      }
    });

    return true; // Keep channel open for async response
  }

  // 2. Update Media List from Content Script
  if (message.action === 'UPDATE_TAB_MEDIA') {
    const tabId = sender.tab?.id;
    if (tabId) {
      const videos = message.videos || [];
      chrome.storage.local.set({ [`tab_media_${tabId}`]: videos });
      updateBadge(tabId, videos.length);
    }
    sendResponse({ success: true });
    return false;
  }

  // 3. Query Media List for a Specific Tab (called by Popup)
  if (message.action === 'GET_CACHED_TAB_MEDIA') {
    const tabId = message.tabId;
    (async () => {
      const key = `tab_media_${tabId}`;
      const data = await chrome.storage.local.get(key);
      sendResponse({ videos: data[key] || [] });
    })();
    return true; // async
  }

  return false;
});
