# 🎬 X (Twitter) 동영상 다운로더 (Chrome 확장 프로그램)

x.com(트위터)의 고화질 동영상(MP4) 및 GIF를 안전하고 편리하게 다운로드할 수 있는 **구글 크롬 확장 프로그램 (Manifest V3)**입니다.

---

### 🛡️ 100% 안전한 오픈소스 (악성코드 / 멜웨어 걱정 없는 이유)
웹 스토어의 일부 확장 프로그램들은 초기 배포 후 외부 제3자나 광고업체에 인수되면서 원격 추적 코드, 광고 인젝션, 정보 탈취형 악성 스크립트가 자동 업데이트로 삽입되어 삭제되는 경우가 많습니다.

본 확장 프로그램은:
- **순수 로컬 소스코드**: 원격 서버에서 스크립트를 다운로드하거나 실행하는 코드가 전혀 없습니다.
- **광고/추적 없음**: Google Analytics, 사용자 추적기, 쿠키 수집 코드가 일절 없습니다.
- **공식 CDN 직접 연결**: 트위터 공식 비디오 CDN(`video.twimg.com`)에서 사용자의 브라우저로 원본 MP4를 직접 다운로드합니다.
- **개발자 모드(Load Unpacked) 로드**: 스토어 자동 업데이트로 인한 변조 위험 없이 사용자가 소스코드를 직접 소유하고 실행합니다.

---

## 🚀 설치 방법 (30초 완료)

1. **이 저장소 클론 또는 다운로드**:
   ```bash
   git clone https://github.com/valternt/X-downloader.git
   ```
2. **구글 크롬 브라우저**를 엽니다.
3. 주소창에 다음 주소를 입력하고 이동합니다:
   ```text
   chrome://extensions/
   ```
4. 오른쪽 상단에 있는 **`개발자 모드 (Developer mode)`** 토글 스위치를 켭니다.
5. 왼쪽 상단에 나타난 **`압축해제된 확장 프로그램을 로드합니다 (Load unpacked)`** 버튼을 클릭합니다.
6. 다운로드받은 `X-downloader` 폴더를 선택합니다.
7. 크롬 브라우저 상단 툴바(퍼즐 아이콘)에서 **X Video Downloader**를 고정(Pin)해두시면 더욱 편리합니다.

---

## 💡 사용 방법

### 방법 1: 트윗 하단 액션바에서 바로 받기
- x.com에서 동영상이나 GIF가 포함된 트윗을 보면, 하단 액션바(답글, 리트윗, 좋아요, 공유 옆)에 **`⬇ 다운로드 아이콘`**이 자동으로 표시됩니다.
- 아이콘을 클릭하면 해상도 선택 메뉴가 나타납니다:
  - 💎 **1080p Full HD** (최고 화질)
  - 🎬 **720p HD**
  - 📱 **480p SD / 360p**
  - 🔗 **동영상 URL 복사**
- 원하는 해상도를 클릭하면 다운로드가 즉시 시작됩니다!

### 방법 2: 동영상 위에 마우스 올리기 (Hover)
- 재생 중인 동영상 위에 마우스를 올리면 우측 상단에 **`⬇ 다운로드`** 알약 버튼이 나타납니다.
- 클릭 한 번으로 빠른 다운로드가 가능합니다.

### 방법 3: 확장 프로그램 팝업창 활용
- 크롬 우측 상단 확장 프로그램 아이콘을 클릭합니다.
- **감지된 동영상**: 현재 보고 있는 페이지에 있는 모든 동영상 목록과 썸네일, 최고화질 다운로드 버튼이 한눈에 표시됩니다.
- **URL 입력**: 특정 트윗 링크를 붙여넣어 바로 동영상을 확인할 수 있습니다.

---

## ⚙️ 맞춤 설정

팝업창 우측 상단 톱니바퀴(⚙️) 아이콘을 눌러 설정을 변경할 수 있습니다:
1. **최고 화질 자동 다운로드**: 화질 선택창 없이 클릭 즉시 가장 높은 해상도로 저장.
2. **저장 파일명 형식**:
   - `x_{작성자아이디}_{트윗ID}_{화질}.mp4` (기본값)
   - `x_{트윗ID}_{화질}.mp4`
   - `x_{작성자아이디}_{트윗ID}.mp4`

---

## 📁 프로젝트 파일 구성

```text
X-downloader/
├── manifest.json         # 크롬 확장 프로그램 매니페스트 (Manifest V3)
├── icons/                # 확장 프로그램 아이콘 (16px, 48px, 128px)
├── scripts/
│   ├── interceptor.js    # 트위터 API 응답에서 고화질 MP4 링크를 안전하게 추출
│   ├── content.js        # 트윗 액션바 및 비디오 플레이어에 다운로드 버튼 삽입
│   └── background.js     # 백그라운드 다운로드 관리 및 뱃지 카운트 처리
├── styles/
│   └── content.css       # 트위터 네이티브 디자인과 일치하는 버튼 및 메뉴 스타일
├── popup/                # 확장 프로그램 팝업창 UI (HTML / CSS / JS)
├── generate_icons.py     # 아이콘 생성 스크립트
├── .gitignore            # Git 제외 파일 목록
└── README.md             # 사용 및 설치 안내서
```

---

# 🎬 X (Twitter) Video Downloader (English)

A lightweight, clean, and 100% safe **Google Chrome Extension (Manifest V3)** to download high-resolution MP4 videos and GIFs directly from x.com (Twitter).

### 🛡️ Why It's 100% Safe (No Malware)
- **Zero Remote Dependencies**: Runs purely local code with no remote script injection.
- **Zero Trackers / Ads**: No telemetry, analytics, or background tracking.
- **Direct Official CDN**: Directly grabs progressive MP4 streams from `video.twimg.com`.
- **Open Source & Unpacked**: You own and inspect the code you run.

### 🚀 Installation
1. Clone this repository:
   ```bash
   git clone https://github.com/valternt/X-downloader.git
   ```
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** (top-left button).
5. Select the cloned `X-downloader` folder.
6. Pin the extension to your Chrome toolbar for easy access!

### 💡 Features
- **In-Tweet Action Button**: Adds a native-styled `⬇` button right in the tweet action bar.
- **Video Hover Overlay**: Quick download pill button when hovering over any video player.
- **Quality Selector**: Download in 1080p FHD, 720p HD, 480p SD, or copy video stream link.
- **Extension Popup**: View all detected videos on the active tab or fetch via Tweet URL.
- **Customizable**: Auto-download highest quality option, customized filename formats.

---

## 📄 License
MIT License. Free for personal and educational use.
