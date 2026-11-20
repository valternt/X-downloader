/**
 * X (Twitter) Video Downloader - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
  // Elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const tabCountBadge = document.getElementById('tabCountBadge');
  const videoListContainer = document.getElementById('videoListContainer');
  const emptyState = document.getElementById('emptyState');
  const btnRefreshTab = document.getElementById('btnRefreshTab');

  // URL tab elements
  const inputTweetUrl = document.getElementById('inputTweetUrl');
  const btnFetchUrl = document.getElementById('btnFetchUrl');
  const urlResultContainer = document.getElementById('urlResultContainer');

  // Settings elements
  const btnSettings = document.getElementById('btnSettings');
  const btnCloseSettings = document.getElementById('btnCloseSettings');
  const paneSettings = document.getElementById('pane-settings');
  const toggleAutoBest = document.getElementById('toggleAutoBest');
  const selectFilename = document.getElementById('selectFilename');

  // Popup Toast
  const popupToast = document.getElementById('popupToast');
  function showToast(msg) {
    popupToast.textContent = msg;
    popupToast.classList.remove('hidden');
    setTimeout(() => popupToast.classList.add('hidden'), 2500);
  }

  // Sanitize filename
  function sanitize(str) {
    return (str || '').replace(/[/\\?%*:|"<>]/g, '_').replace(/\s+/g, '_').substring(0, 100);
  }

  // Load Settings
  const settings = await chrome.storage.local.get({
    autoDownloadBest: false,
    filenameFormat: 'user_id_quality'
  });
  toggleAutoBest.checked = settings.autoDownloadBest;
  selectFilename.value = settings.filenameFormat;

  toggleAutoBest.addEventListener('change', async () => {
    await chrome.storage.local.set({ autoDownloadBest: toggleAutoBest.checked });
    showToast('설정이 저장되었습니다');
  });

  selectFilename.addEventListener('change', async () => {
    await chrome.storage.local.set({ filenameFormat: selectFilename.value });
    showToast('파일명 형식이 변경되었습니다');
  });

  // Settings pane toggle
  btnSettings.addEventListener('click', () => paneSettings.classList.remove('hidden'));
  btnCloseSettings.addEventListener('click', () => paneSettings.classList.add('hidden'));

  // Tab switching
  navTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      navTabs.forEach(t => t.classList.remove('active'));
      tabPanes.forEach(p => p.classList.remove('active'));
      paneSettings.classList.add('hidden');

      tab.classList.add('active');
      const targetPane = document.getElementById(tab.dataset.tab);
      if (targetPane) targetPane.classList.add('active');
    });
  });

  // Get active browser tab
  const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });

  // Pre-fill URL tab if active tab is a tweet or 810video
  if (activeTab?.url) {
    if ((activeTab.url.includes('x.com') || activeTab.url.includes('twitter.com')) && activeTab.url.includes('/status/')) {
      inputTweetUrl.value = activeTab.url;
    } else if (activeTab.url.includes('810video.com') && (activeTab.url.includes('/watch') || activeTab.url.includes('/w/'))) {
      inputTweetUrl.value = activeTab.url;
    }
  }

  btnRefreshTab.addEventListener('click', () => {
    if (activeTab?.id) {
      chrome.tabs.reload(activeTab.id);
      window.close();
    }
  });

  // Render a Video Card
  function createVideoCard(videoItem) {
    const card = document.createElement('div');
    card.className = 'video-card';

    const author = videoItem.name || videoItem.username || 'X Video';
    const handle = videoItem.username ? `@${videoItem.username}` : '';
    const text = videoItem.text || '';
    const thumb = videoItem.poster || 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="72" height="72" viewBox="0 0 24 24" fill="%2371767b"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>';
    const variants = videoItem.variants || [];

    card.innerHTML = `
      <div class="card-header">
        <img class="card-thumb" src="${thumb}" alt="Thumbnail" />
        <div class="card-meta">
          <div class="card-author">${escapeHtml(author)}</div>
          <div class="card-handle">${escapeHtml(handle)}</div>
          <div class="card-text">${escapeHtml(text)}</div>
        </div>
      </div>
      <div class="card-actions"></div>
    `;

    const actionsContainer = card.querySelector('.card-actions');

    if (variants.length > 0) {
      // Primary: Best Quality Download button
      const best = variants[0];
      const btnBest = document.createElement('button');
      btnBest.className = 'btn-quality primary';
      btnBest.innerHTML = `💎 최고화질 (${best.resolution || 'MP4'})`;
      btnBest.addEventListener('click', () => {
        downloadFile(best.url, videoItem, best);
      });
      actionsContainer.appendChild(btnBest);

      // Other qualities
      for (let i = 1; i < variants.length; i++) {
        const v = variants[i];
        const btn = document.createElement('button');
        btn.className = 'btn-quality';
        btn.textContent = v.label ? v.label.split(' ')[0] : `${v.resolution || 'MP4'}`;
        btn.addEventListener('click', () => {
          downloadFile(v.url, videoItem, v);
        });
        actionsContainer.appendChild(btn);
      }

      // Copy Link button
      const btnCopy = document.createElement('button');
      btnCopy.className = 'btn-quality';
      btnCopy.innerHTML = `🔗 링크복사`;
      btnCopy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(best.url);
        showToast('동영상 링크가 복사되었습니다!');
      });
      actionsContainer.appendChild(btnCopy);
    } else {
      actionsContainer.innerHTML = `<span style="font-size:11px;color:var(--text-secondary);">해상도 정보 분석 중...</span>`;
    }

    return card;
  }

  // Trigger download helper
  async function downloadFile(url, videoItem, variant) {
    const currentSettings = await chrome.storage.local.get({ filenameFormat: 'user_id_quality' });
    const fmt = currentSettings.filenameFormat;

    const user = sanitize(videoItem.username || 'user');
    const id = sanitize(videoItem.tweetId || String(Date.now()));
    const q = sanitize(variant.resolution || 'video');

    let filename = `x_${user}_${id}_${q}.mp4`;
    if (fmt === 'id_quality') {
      filename = `x_${id}_${q}.mp4`;
    } else if (fmt === 'user_id') {
      filename = `x_${user}_${id}.mp4`;
    }

    chrome.runtime.sendMessage({
      action: 'DOWNLOAD_MEDIA',
      url: url,
      filename: filename
    }, (res) => {
      if (res && res.success) {
        showToast('다운로드가 시작되었습니다!');
      } else {
        showToast('다운로드 요청 완료');
      }
    });
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Load Detected Videos for current tab
  async function loadTabVideos() {
    if (!activeTab?.id) {
      emptyState.classList.remove('hidden');
      return;
    }

    let videos = [];

    // Try reading cached media from storage via background
    try {
      const response = await new Promise((resolve) => {
        chrome.runtime.sendMessage({
          action: 'GET_CACHED_TAB_MEDIA',
          tabId: activeTab.id
        }, resolve);
      });
      if (response && Array.isArray(response.videos)) {
        videos = response.videos;
      }
    } catch (e) {}

    // Fallback: Query content script directly
    if (videos.length === 0) {
      try {
        const csResponse = await new Promise((resolve) => {
          chrome.tabs.sendMessage(activeTab.id, { action: 'GET_TAB_MEDIA' }, (res) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(res);
          });
        });
        if (csResponse && Array.isArray(csResponse.videos)) {
          videos = csResponse.videos;
        }
      } catch (e) {}
    }

    tabCountBadge.textContent = String(videos.length);

    if (videos.length === 0) {
      emptyState.classList.remove('hidden');
      videoListContainer.innerHTML = '';
    } else {
      emptyState.classList.add('hidden');
      videoListContainer.innerHTML = '';
      videos.forEach(v => {
        videoListContainer.appendChild(createVideoCard(v));
      });
    }
  }

  // Load URL Input tab parser (Supports X.com and 810video.com)
  btnFetchUrl.addEventListener('click', async () => {
    const rawUrl = inputTweetUrl.value.trim();
    if (!rawUrl) {
      showToast('동영상 링크를 입력해주세요');
      return;
    }

    // --- 1. Check for 810video.com URL ---
    const match810 = rawUrl.match(/810video\.com\/(?:videos\/watch|w)\/([a-zA-Z0-9-]+)/);
    if (match810) {
      const videoId = match810[1];
      btnFetchUrl.disabled = true;
      btnFetchUrl.textContent = '분석 중...';
      urlResultContainer.classList.remove('hidden');
      urlResultContainer.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-secondary);">810video 동영상 정보를 추출하고 있습니다...</div>`;

      try {
        const res = await fetch(`https://810video.com/api/v1/videos/${videoId}`);
        if (!res.ok) throw new Error('Failed to fetch 810video');
        const data = await res.json();

        const variants = [];
        if (Array.isArray(data.streamingPlaylists)) {
          for (const sp of data.streamingPlaylists) {
            for (const f of (sp.files || [])) {
              const resLabel = f.resolution?.label || (f.resolution?.id ? `${f.resolution.id}p` : 'MP4');
              const url = f.fileDownloadUrl || f.fileUrl;
              if (url) variants.push({ label: `${resLabel} (고화질 MP4)`, resolution: resLabel, url });
            }
          }
        }
        if (Array.isArray(data.files)) {
          for (const f of data.files) {
            const resLabel = f.resolution?.label || (f.resolution?.id ? `${f.resolution.id}p` : 'MP4');
            const url = f.fileDownloadUrl || f.fileUrl;
            if (url) variants.push({ label: `${resLabel} (MP4)`, resolution: resLabel, url });
          }
        }

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
          variants: variants
        };

        urlResultContainer.innerHTML = '';
        urlResultContainer.appendChild(createVideoCard(videoItem));
      } catch (err) {
        urlResultContainer.innerHTML = `<div style="color:#f4212e;text-align:center;padding:12px;">동영상 정보를 가져올 수 없습니다. 링크를 확인해주세요.</div>`;
      } finally {
        btnFetchUrl.disabled = false;
        btnFetchUrl.textContent = '분석';
      }
      return;
    }

    // --- 2. Check for Twitter / X URL ---
    const match = rawUrl.match(/\/status\/(\d+)/);
    if (!match) {
      showToast('올바른 트윗(X) 또는 810video 링크가 아닙니다');
      return;
    }

    const tweetId = match[1];
    btnFetchUrl.disabled = true;
    btnFetchUrl.textContent = '분석 중...';
    urlResultContainer.classList.remove('hidden');
    urlResultContainer.innerHTML = `<div style="text-align:center;padding:16px;color:var(--text-secondary);">동영상 정보를 추출하고 있습니다...</div>`;

    // Check if it's already in detected list
    let videos = [];
    try {
      const response = await new Promise(res => {
        chrome.runtime.sendMessage({ action: 'GET_CACHED_TAB_MEDIA', tabId: activeTab?.id }, res);
      });
      if (response?.videos) videos = response.videos;
    } catch (e) {}

    const found = videos.find(v => v.tweetId === tweetId);
    if (found) {
      urlResultContainer.innerHTML = '';
      urlResultContainer.appendChild(createVideoCard(found));
      btnFetchUrl.disabled = false;
      btnFetchUrl.textContent = '분석';
      return;
    }

    // If not in cache, navigate to that tweet tab or open
    setTimeout(() => {
      urlResultContainer.innerHTML = `
        <div class="video-card">
          <div style="font-weight:600;margin-bottom:6px;">트윗 ID: ${tweetId}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;">
            해당 트윗을 브라우저 탭에서 열어 바로 동영상을 감지하고 다운로드할 수 있습니다.
          </div>
          <button id="btnOpenAndDownload" class="btn btn-primary" style="width:100%;">
            🌐 트윗 열고 다운로드하기
          </button>
        </div>
      `;
      document.getElementById('btnOpenAndDownload').addEventListener('click', () => {
        chrome.tabs.create({ url: `https://x.com/i/status/${tweetId}` });
      });
      btnFetchUrl.disabled = false;
      btnFetchUrl.textContent = '분석';
    }, 600);
  });

  // Initial tab media load
  await loadTabVideos();
});
