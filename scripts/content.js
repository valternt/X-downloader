/**
 * X (Twitter) Video Downloader - Content Script
 * Runs in ISOLATED world at document_end.
 * Injects clean download buttons into tweets and handles user interactions.
 */
(function () {
  'use strict';

  // Map of tweetId -> MediaData
  const tweetMediaMap = new Map();
  let openMenuElement = null;
  let isScanning = false;
  let pendingRequests = new Map();

  // SVG Icons
  const ICONS = {
    download: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M12 2.5a.75.75 0 0 1 .75.75v11.69l3.22-3.22a.75.75 0 1 1 1.06 1.06l-4.5 4.5a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06l3.22 3.22V3.25a.75.75 0 0 1 .75-.75zM4 16.75a.75.75 0 0 1 .75.75v2a1 1 0 0 0 1 1h12.5a1 1 0 0 0 1-1v-2a.75.75 0 0 1 1.5 0v2a2.5 2.5 0 0 1-2.5 2.5H5.75A2.5 2.5 0 0 1 3.25 19.5v-2a.75.75 0 0 1 .75-.75z"></path></g></svg>`,
    check: `<svg viewBox="0 0 24 24" aria-hidden="true"><g><path d="M9.64 18.952l-5.55-4.861 1.317-1.504 3.951 3.459 8.459-10.948 1.569 1.215z"></path></g></svg>`,
    copy: `<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:currentColor;"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`
  };

  // Toast Notification System
  let activeToast = null;
  function showToast(message, type = 'info', duration = 3000) {
    if (activeToast) {
      activeToast.remove();
      activeToast = null;
    }
    const toast = document.createElement('div');
    toast.className = `x-downloader-toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    activeToast = toast;

    requestAnimationFrame(() => {
      toast.classList.add('show');
    });

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (toast.parentNode) toast.remove();
        if (activeToast === toast) activeToast = null;
      }, 250);
    }, duration);
  }

  // Sanitize filename for safe saving on all operating systems
  function sanitizeFilename(name) {
    return name.replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').substring(0, 100);
  }

  // Generate nice filename: e.g. x_elonmusk_123456789_1080p.mp4 or Title_720p.mp4
  function buildFilename(tweetData, variant) {
    let baseName = '';
    if (tweetData?.name && !window.location.hostname.includes('twitter') && !window.location.hostname.includes('x.com')) {
      baseName = tweetData.name;
    } else {
      const username = tweetData?.username || 'user';
      const tweetId = tweetData?.tweetId || Date.now();
      baseName = `x_${username}_${tweetId}`;
    }
    let quality = 'video';
    if (variant?.resolution) {
      quality = variant.resolution.replace(/\s+/g, '');
    } else if (variant?.bitrate) {
      quality = `${Math.round(variant.bitrate / 1000)}k`;
    }
    return sanitizeFilename(`${baseName}_${quality}.mp4`);
  }

  // Trigger Download via Chrome Background Service Worker
  async function triggerDownload(url, filename, tweetId) {
    showToast(`다운로드 시작: ${filename}`, 'info', 2500);

    try {
      chrome.runtime.sendMessage({
        action: 'DOWNLOAD_MEDIA',
        url: url,
        filename: filename,
        tweetId: tweetId
      }, (response) => {
        if (chrome.runtime.lastError || (response && !response.success)) {
          console.warn('Direct download message fallback:', chrome.runtime.lastError);
          // Fallback: create temporary download link
          const a = document.createElement('a');
          a.href = url;
          a.download = filename;
          a.target = '_blank';
          document.body.appendChild(a);
          a.click();
          a.remove();
        }
      });
    } catch (e) {
      // Direct anchor click fallback
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      a.remove();
    }
  }

  // Copy URL to clipboard
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      showToast('동영상 주소가 클립보드에 복사되었습니다!', 'success', 2500);
    } catch (err) {
      showToast('주소 복사 실패', 'error', 2000);
    }
  }

  // Close any open quality menu
  function closeOpenMenu() {
    if (openMenuElement) {
      window.removeEventListener('scroll', handleWindowScroll, { capture: true });
      window.removeEventListener('resize', closeOpenMenu);
      openMenuElement.remove();
      openMenuElement = null;
    }
  }

  function handleWindowScroll(e) {
    // If the scroll happened inside the menu itself, don't close
    if (openMenuElement && openMenuElement.contains(e.target)) return;
    closeOpenMenu();
  }

  document.addEventListener('click', (e) => {
    if (openMenuElement && !openMenuElement.contains(e.target)) {
      closeOpenMenu();
    }
  });

  // Extract Tweet ID from an article or link element
  function extractTweetId(article) {
    // 1. Direct links with status
    const statusLinks = article.querySelectorAll('a[href*="/status/"]');
    for (const link of statusLinks) {
      const href = link.getAttribute('href') || '';
      const match = href.match(/\/status\/(\d+)/);
      if (match) return match[1];
    }
    return null;
  }

  // Extract Username from an article
  function extractUsername(article) {
    const userLink = article.querySelector('div[data-testid="User-Name"] a[href^="/"]');
    if (userLink) {
      const href = userLink.getAttribute('href') || '';
      return href.replace(/^\//, '').split('/')[0];
    }
    const statusLink = article.querySelector('a[href*="/status/"]');
    if (statusLink) {
      const match = (statusLink.getAttribute('href') || '').match(/\/([^/]+)\/status\//);
      if (match) return match[1];
    }
    return '';
  }

  // Show Quality Selection Menu (Fixed Portal to document.body)
  function showQualityMenu(anchorBtn, tweetData) {
    closeOpenMenu();

    const variants = tweetData?.variants || [];
    if (variants.length === 0) {
      showToast('사용 가능한 동영상 해상도를 찾을 수 없습니다.', 'error');
      return;
    }

    const menu = document.createElement('div');
    menu.className = 'x-downloader-menu';

    // Theme detection: check if Twitter is in light mode
    const bodyBg = window.getComputedStyle(document.body).backgroundColor;
    if (bodyBg === 'rgb(255, 255, 255)' || bodyBg === 'white') {
      menu.classList.add('light-theme');
    }

    // Header
    const header = document.createElement('div');
    header.className = 'x-downloader-menu-header';
    header.innerHTML = `<span>화질 선택</span><span>${variants.length}개 옵션</span>`;
    menu.appendChild(header);

    // List of resolutions
    variants.forEach((v, index) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'x-downloader-menu-item';

      const isBest = index === 0;
      const badge = isBest ? '💎 ' : '🎬 ';
      const bitrateText = v.bitrate ? `${Math.round(v.bitrate / 1000)} kbps` : '';

      item.innerHTML = `
        <span class="res-tag">${badge}${v.label || 'MP4'}</span>
        <span class="bitrate-tag">${bitrateText}</span>
      `;

      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeOpenMenu();
        const filename = buildFilename(tweetData, v);
        triggerDownload(v.url, filename, tweetData.tweetId);

        // Flash button icon to checkmark
        anchorBtn.innerHTML = ICONS.check;
        anchorBtn.classList.add('downloaded');
        setTimeout(() => {
          anchorBtn.innerHTML = ICONS.download;
          anchorBtn.classList.remove('downloaded');
        }, 3000);
      });

      menu.appendChild(item);
    });

    // Divider
    const divider = document.createElement('div');
    divider.className = 'x-downloader-menu-divider';
    menu.appendChild(divider);

    // Copy best quality link option
    const copyItem = document.createElement('button');
    copyItem.type = 'button';
    copyItem.className = 'x-downloader-menu-item';
    copyItem.innerHTML = `
      <span class="res-tag">${ICONS.copy} 동영상 URL 복사</span>
      <span class="bitrate-tag">링크</span>
    `;
    copyItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeOpenMenu();
      copyToClipboard(variants[0].url);
    });
    menu.appendChild(copyItem);

    // Mount to document.body to avoid being clipped by Twitter's column overflow / stacking contexts
    menu.style.visibility = 'hidden';
    document.body.appendChild(menu);
    openMenuElement = menu;

    // Calculate smart fixed coordinates based on anchor button
    const btnRect = anchorBtn.getBoundingClientRect();
    const menuRect = menu.getBoundingClientRect();
    const menuWidth = menuRect.width || 220;
    const menuHeight = menuRect.height || 180;

    // Align right edge of menu with right edge of button (prevents overflowing into Twitter's right sidebar)
    let left = btnRect.right - menuWidth;
    if (left < 12) left = 12;
    if (left + menuWidth > window.innerWidth - 12) {
      left = window.innerWidth - menuWidth - 12;
    }

    // Determine vertical placement: prefer above button, fallback to below
    let top;
    if (btnRect.top >= menuHeight + 12) {
      top = btnRect.top - menuHeight - 8;
    } else {
      top = btnRect.bottom + 8;
    }

    if (top < 8) top = 8;
    if (top + menuHeight > window.innerHeight - 8) {
      top = window.innerHeight - menuHeight - 8;
    }

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.visibility = 'visible';

    // Auto-close on scroll or window resize
    window.addEventListener('scroll', handleWindowScroll, { passive: true, capture: true });
    window.addEventListener('resize', closeOpenMenu, { passive: true });
  }

  // Request Tweet Media on-demand from interceptor if not cached
  function fetchTweetMediaOnDemand(tweetId) {
    return new Promise((resolve) => {
      const requestId = 'req_' + Math.random().toString(36).substring(2, 10);

      const timeout = setTimeout(() => {
        pendingRequests.delete(requestId);
        resolve(null);
      }, 3500);

      pendingRequests.set(requestId, (data) => {
        clearTimeout(timeout);
        pendingRequests.delete(requestId);
        resolve(data);
      });

      window.postMessage({
        type: 'X_DOWNLOADER_GET_TWEET_MEDIA',
        tweetId: tweetId,
        requestId: requestId
      }, '*');
    });
  }

  // Handle Download Button Click
  async function handleDownloadClick(btn, article) {
    const tweetId = extractTweetId(article);
    if (!tweetId) {
      showToast('트윗 ID를 식별할 수 없습니다.', 'error');
      return;
    }

    let mediaData = tweetMediaMap.get(tweetId);

    // If not in cache, request from MAIN world interceptor
    if (!mediaData || !mediaData.variants || mediaData.variants.length === 0) {
      btn.innerHTML = `<div class="x-downloader-spinner"></div>`;
      mediaData = await fetchTweetMediaOnDemand(tweetId);
      btn.innerHTML = ICONS.download;

      if (mediaData) {
        tweetMediaMap.set(tweetId, mediaData);
        syncMediaWithBackground();
      }
    }

    if (!mediaData || !mediaData.variants || mediaData.variants.length === 0) {
      showToast('동영상 스트림 정보를 수집 중입니다. 동영상을 잠시 재생해 보세요.', 'info', 3500);
      return;
    }

    // Ensure username is populated
    if (!mediaData.username) {
      mediaData.username = extractUsername(article);
    }

    // Check user preference
    chrome.storage.local.get({ autoDownloadBest: false }, (settings) => {
      if (settings.autoDownloadBest && mediaData.variants.length > 0) {
        // Direct download best quality
        const best = mediaData.variants[0];
        const filename = buildFilename(mediaData, best);
        triggerDownload(best.url, filename, tweetId);
        btn.innerHTML = ICONS.check;
        btn.classList.add('downloaded');
        setTimeout(() => {
          btn.innerHTML = ICONS.download;
          btn.classList.remove('downloaded');
        }, 3000);
      } else {
        // Show quality options menu
        showQualityMenu(btn, mediaData);
      }
    });
  }

  // Inject Download Button into a Tweet's action bar
  function injectActionButton(article) {
    if (article.dataset.xDownloaderInjected === 'true') return;

    // Check if the article contains a video or animated gif
    const hasVideo = article.querySelector('video') ||
                     article.querySelector('[data-testid="videoPlayer"]') ||
                     article.querySelector('[data-testid="videoComponent"]');

    const tweetId = extractTweetId(article);
    const hasCachedMedia = tweetId && tweetMediaMap.has(tweetId);

    // If no video element and no cached media, skip for now
    if (!hasVideo && !hasCachedMedia) return;

    // Locate action bar (role="group")
    const actionBar = article.querySelector('div[role="group"]');
    if (!actionBar) return;

    // Check if already injected
    if (actionBar.querySelector('.x-downloader-btn-wrap')) return;

    // Create button container
    const wrap = document.createElement('div');
    wrap.className = 'x-downloader-btn-wrap';

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'x-downloader-btn';
    btn.title = '동영상 / GIF 다운로드';
    btn.setAttribute('aria-label', '동영상 다운로드');
    btn.innerHTML = ICONS.download;

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handleDownloadClick(btn, article);
    });

    wrap.appendChild(btn);

    // Insert right before the last element (Share button) or at end
    const lastItem = actionBar.lastElementChild;
    if (lastItem) {
      actionBar.insertBefore(wrap, lastItem);
    } else {
      actionBar.appendChild(wrap);
    }

    article.dataset.xDownloaderInjected = 'true';
  }

  // Inject Floating Overlay Pill onto Video Players
  function injectVideoOverlay(videoContainer) {
    if (videoContainer.dataset.xDownloaderPillInjected === 'true') return;
    if (videoContainer.querySelector('.x-downloader-video-pill')) return;

    const pill = document.createElement('div');
    pill.className = 'x-downloader-video-pill';
    pill.innerHTML = `${ICONS.download} <span>다운로드</span>`;

    pill.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const article = videoContainer.closest('article');
      if (article) {
        const actionBtn = article.querySelector('.x-downloader-btn');
        if (actionBtn) {
          handleDownloadClick(actionBtn, article);
          return;
        }
      }

      // If standalone video player outside article
      const tweetId = window.location.pathname.match(/\/status\/(\d+)/)?.[1];
      if (tweetId) {
        handleDownloadClick(pill, document.body);
      } else {
        showToast('동영상 다운로드 메뉴를 여는 중...', 'info');
      }
    });

    // Ensure container has relative positioning
    const computedStyle = window.getComputedStyle(videoContainer);
    if (computedStyle.position === 'static') {
      videoContainer.style.position = 'relative';
    }

    videoContainer.appendChild(pill);
    videoContainer.dataset.xDownloaderPillInjected = 'true';
  }

  // Scan current page DOM for tweets and videos (batched via requestAnimationFrame)
  function scanPage() {
    if (isScanning) return;
    isScanning = true;

    requestAnimationFrame(() => {
      try {
        // 1. Scan tweet articles
        const articles = document.querySelectorAll('article[data-testid="tweet"], article[role="article"]');
        for (let i = 0; i < articles.length; i++) {
          injectActionButton(articles[i]);
        }

        // 2. Scan video player containers for hover pill
        const videoPlayers = document.querySelectorAll('[data-testid="videoPlayer"], [data-testid="videoComponent"]');
        for (let j = 0; j < videoPlayers.length; j++) {
          injectVideoOverlay(videoPlayers[j]);
        }
      } catch (err) {
        // Fail gracefully
      } finally {
        isScanning = false;
      }
    });
  }

  // Sync detected videos with background service worker so Extension Popup can display them
  function syncMediaWithBackground() {
    try {
      const list = Array.from(tweetMediaMap.values());
      chrome.runtime.sendMessage({
        action: 'UPDATE_TAB_MEDIA',
        videos: list
      });
    } catch (e) {
      // Extension context invalidated on reload
    }
  }

  // Listen for messages from MAIN world interceptor
  window.addEventListener('message', (event) => {
    if (!event.data || event.source !== window) return;

    if (event.data.type === 'X_DOWNLOADER_MEDIA_CAPTURED') {
      const newItems = event.data.items || [];
      for (const item of newItems) {
        if (item && item.tweetId) {
          tweetMediaMap.set(item.tweetId, item);
        }
      }
      syncMediaWithBackground();
      scanPage();
    } else if (event.data.type === 'X_DOWNLOADER_TWEET_MEDIA_RESPONSE') {
      const { requestId, data } = event.data;
      if (pendingRequests.has(requestId)) {
        const handler = pendingRequests.get(requestId);
        handler(data);
      }
    }
  });

  // Listen for messages from Extension Popup
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'GET_TAB_MEDIA') {
      sendResponse({ videos: Array.from(tweetMediaMap.values()) });
      return false;
    }
  });

  // --- 810video.com (PeerTube) Integration ---
  function init810Video() {
    let currentVideoId = null;
    let currentVideoData = null;

    async function checkPeerTubePage() {
      const match = window.location.pathname.match(/\/(?:videos\/watch|w)\/([a-zA-Z0-9-]+)/);
      if (!match) return;

      const videoId = match[1];
      if (videoId === currentVideoId && currentVideoData) {
        inject810Buttons();
        return;
      }

      currentVideoId = videoId;
      try {
        const res = await fetch(`https://810video.com/api/v1/videos/${videoId}`);
        if (!res.ok) return;
        const data = await res.json();

        const variants = [];
        // Extract from streamingPlaylists (HLS fragmented MP4s)
        if (Array.isArray(data.streamingPlaylists)) {
          for (const sp of data.streamingPlaylists) {
            for (const f of (sp.files || [])) {
              const resLabel = f.resolution?.label || (f.resolution?.id ? `${f.resolution.id}p` : 'MP4');
              const url = f.fileDownloadUrl || f.fileUrl;
              if (url) {
                variants.push({
                  label: `${resLabel} (고화질 MP4)`,
                  resolution: resLabel,
                  url: url,
                  bitrate: f.fps || 0
                });
              }
            }
          }
        }
        // Extract from direct files
        if (Array.isArray(data.files)) {
          for (const f of data.files) {
            const resLabel = f.resolution?.label || (f.resolution?.id ? `${f.resolution.id}p` : 'MP4');
            const url = f.fileDownloadUrl || f.fileUrl;
            if (url) {
              variants.push({
                label: `${resLabel} (MP4)`,
                resolution: resLabel,
                url: url,
                bitrate: f.size || 0
              });
            }
          }
        }

        // Sort descending by resolution (1080p > 720p > 480p > 360p)
        variants.sort((a, b) => {
          const getNum = str => parseInt((str.resolution || '').replace(/\D/g, ''), 10) || 0;
          return getNum(b) - getNum(a);
        });

        const videoItem = {
          tweetId: String(data.id || videoId),
          username: data.channel?.displayName || data.account?.displayName || '810video',
          name: data.name || '810video',
          text: data.description || '',
          poster: data.thumbnailUrl || data.previewUrl || '',
          variants: variants,
          durationMs: (data.duration || 0) * 1000
        };

        currentVideoData = videoItem;
        tweetMediaMap.set(videoItem.tweetId, videoItem);
        syncMediaWithBackground();
        inject810Buttons();
      } catch (err) {
        // Silently continue
      }
    }

    function inject810Buttons() {
      if (!currentVideoData || currentVideoData.variants.length === 0) return;

      // 1. Video Player Hover Overlay Pill
      const videoEl = document.querySelector('video');
      const playerContainer = videoEl?.closest('.video-js') || videoEl?.closest('my-video-player') || videoEl?.parentElement;
      if (playerContainer && !playerContainer.querySelector('.x-downloader-video-pill')) {
        const pill = document.createElement('div');
        pill.className = 'x-downloader-video-pill';
        pill.style.opacity = '1';
        pill.style.pointerEvents = 'auto';
        pill.innerHTML = `${ICONS.download} <span>다운로드</span>`;
        pill.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showQualityMenu(pill, currentVideoData);
        });
        playerContainer.style.position = 'relative';
        playerContainer.appendChild(pill);
      }

      // 2. Action Button under Video Details
      const actionsBar = document.querySelector('.actions-button') ||
                         document.querySelector('.actions-container') ||
                         document.querySelector('my-video-actions') ||
                         document.querySelector('.video-actions');

      if (actionsBar && !actionsBar.querySelector('.x-downloader-810-btn')) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'x-downloader-810-btn';
        btn.style.cssText = 'display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:20px;background:#1d9bf0;color:#fff;border:none;font-weight:600;font-size:13px;cursor:pointer;margin-left:8px;';
        btn.innerHTML = `${ICONS.download} <span>동영상 다운로드</span>`;
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          showQualityMenu(btn, currentVideoData);
        });
        actionsBar.appendChild(btn);
      }
    }

    // Check periodically for SPA navigation in PeerTube
    setInterval(checkPeerTubePage, 1200);
    window.addEventListener('popstate', checkPeerTubePage);
    checkPeerTubePage();
  }

  // Choose initialization based on host
  if (window.location.hostname.includes('810video.com')) {
    init810Video();
  } else {
    // Standard Twitter / X Observer
    let mutationTimeout = null;
    const observer = new MutationObserver(() => {
      if (mutationTimeout) return;
      mutationTimeout = setTimeout(() => {
        mutationTimeout = null;
        scanPage();
      }, 200);
    });

    observer.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true
    });

    scanPage();
    window.addEventListener('popstate', () => setTimeout(scanPage, 500));
  }
})();
