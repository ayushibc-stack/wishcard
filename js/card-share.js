// Card Share Module for WishCard.in
// Handles upload to Firebase Storage, Firestore document creation, and share UI

import { db, storage } from './firebase-config.js';
import { collection, doc, setDoc, getDoc, updateDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { captureCardVideo, generateThumbnail } from './video-capture.js';

/**
 * Main share function - handles the entire flow:
 * 1. Generate video from card
 * 2. Upload HTML, video, thumbnail to Storage
 * 3. Create Firestore document
 * 4. Return shareable link
 */
export async function shareCard({ htmlContent, thumbnailDataUrl, cardType, recipientName, occasion, colors }) {
  const progressUI = showProgressUI();

  try {
    // Generate unique card ID
    const cardId = generateCardId();

    // Step 1: Record video
    const hasMediaRecorder = typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported('video/webm');
    let videoBlob = null;

    if (hasMediaRecorder) {
      progressUI.updateStep('recording');
      const videoResult = await captureCardVideo(htmlContent, {
        recipientName,
        photoDataUrl: thumbnailDataUrl,
        colors: colors || null
      });
      videoBlob = videoResult.videoBlob; // May be null if recording failed
    }

    // Step 2: Generate thumbnail
    progressUI.updateStep('thumbnail');
    let thumbnailBlob = null;
    try {
      thumbnailBlob = await generateThumbnail(htmlContent, {
        recipientName,
        photoDataUrl: thumbnailDataUrl,
        colors: colors || null
      });
    } catch (e) {
      // If thumbnail generation fails and we have a dataUrl, convert it
      if (thumbnailDataUrl) {
        thumbnailBlob = dataUrlToBlob(thumbnailDataUrl);
      }
    }

    // Step 3: Upload files to Firebase Storage
    progressUI.updateStep('uploading');

    const uploadResults = await uploadCardFiles(cardId, {
      htmlContent,
      videoBlob,
      thumbnailBlob
    });

    // Step 4: Create Firestore document
    progressUI.updateStep('saving');

    const cardDoc = {
      cardId,
      cardType: cardType || 'birthday',
      recipientName: recipientName || '',
      occasion: occasion || '',
      createdAt: serverTimestamp(),
      openCount: 0,
      videoUrl: uploadResults.videoUrl || null,
      thumbnailUrl: uploadResults.thumbnailUrl || null,
      htmlUrl: uploadResults.htmlUrl || null
    };

    await setDoc(doc(db, 'cards', cardId), cardDoc);

    // Step 5: Done!
    progressUI.updateStep('done');

    setTimeout(() => {
      progressUI.hide();
    }, 1500);

    const shareUrl = getShareableLink(cardId);
    return { cardId, shareUrl, success: true, error: null };

  } catch (err) {
    progressUI.hide();
    return { cardId: null, shareUrl: null, success: false, error: err.message || 'Share failed' };
  }
}

/**
 * Get the full shareable URL for a card
 */
export function getShareableLink(cardId) {
  return `https://wishcard-in.web.app/card/${cardId}`;
}

/**
 * Show the share UI modal/overlay
 * Displays: shareable link, copy button, WhatsApp share button, download fallback
 */
export function showShareUI(cardId, recipientName, cardType) {
  // Remove any existing share modal
  const existing = document.getElementById('wishcard-share-modal');
  if (existing) existing.remove();

  const shareUrl = getShareableLink(cardId);
  const whatsappText = encodeURIComponent(
    `Hey! Maine ${recipientName || 'tumhare'} ke liye ek special ${cardType || 'greeting'} card banaya hai! Yahan dekho: ${shareUrl}`
  );
  const whatsappUrl = `https://wa.me/?text=${whatsappText}`;

  const modal = document.createElement('div');
  modal.id = 'wishcard-share-modal';
  modal.innerHTML = `
    <div class="wc-share-overlay" onclick="this.parentElement.remove()">
      <div class="wc-share-card" onclick="event.stopPropagation()">
        <button class="wc-share-close" onclick="document.getElementById('wishcard-share-modal').remove()">&times;</button>
        <div class="wc-share-success-icon">&#10003;</div>
        <h2 class="wc-share-title">Card Ready! &#127881;</h2>
        <p class="wc-share-subtitle">Ab apne special person ko bhejo!</p>

        <div class="wc-share-link-box">
          <input type="text" readonly value="${shareUrl}" class="wc-share-link-input" id="wc-share-link-input">
          <button class="wc-share-copy-btn" id="wc-share-copy-btn">Copy</button>
        </div>

        <div class="wc-share-buttons">
          <a href="${whatsappUrl}" target="_blank" rel="noopener" class="wc-share-btn wc-share-whatsapp">
            <span class="wc-share-btn-icon">&#128172;</span>
            WhatsApp pe bhejo
          </a>
          <button class="wc-share-btn wc-share-download" id="wc-share-download-btn">
            <span class="wc-share-btn-icon">&#128229;</span>
            Phone me Download karo
          </button>
        </div>

        <p class="wc-share-footer">Made with &#10084;&#65039; on WishCard.in</p>
      </div>
    </div>
  `;

  // Inject styles
  if (!document.getElementById('wishcard-share-styles')) {
    const style = document.createElement('style');
    style.id = 'wishcard-share-styles';
    style.textContent = getShareStyles();
    document.head.appendChild(style);
  }

  document.body.appendChild(modal);

  // Copy button handler
  document.getElementById('wc-share-copy-btn').addEventListener('click', () => {
    const input = document.getElementById('wc-share-link-input');
    input.select();
    if (navigator.clipboard) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        document.getElementById('wc-share-copy-btn').textContent = 'Link copy ho gaya!';
        setTimeout(() => {
          const btn = document.getElementById('wc-share-copy-btn');
          if (btn) btn.textContent = 'Copy';
        }, 2000);
      });
    } else {
      document.execCommand('copy');
      document.getElementById('wc-share-copy-btn').textContent = 'Link copy ho gaya!';
    }
  });

  return modal;
}

/**
 * Show progress UI during upload process
 * Steps: Recording video... Uploading card... Generating link...
 */
export function showProgressUI() {
  // Remove any existing progress modal
  const existing = document.getElementById('wishcard-progress-modal');
  if (existing) existing.remove();

  // Inject styles if needed
  if (!document.getElementById('wishcard-share-styles')) {
    const style = document.createElement('style');
    style.id = 'wishcard-share-styles';
    style.textContent = getShareStyles();
    document.head.appendChild(style);
  }

  const steps = [
    { id: 'recording', label: 'Video record ho raha hai...' },
    { id: 'thumbnail', label: 'Thumbnail bana rahe hain...' },
    { id: 'uploading', label: 'Card upload ho raha hai...' },
    { id: 'saving', label: 'Link generate ho raha hai...' },
    { id: 'done', label: 'Ho gaya! &#127881;' }
  ];

  const modal = document.createElement('div');
  modal.id = 'wishcard-progress-modal';
  modal.innerHTML = `
    <div class="wc-share-overlay">
      <div class="wc-share-card wc-progress-card">
        <h2 class="wc-share-title">Card share ho raha hai...</h2>
        <div class="wc-progress-steps">
          ${steps.map(s => `
            <div class="wc-progress-step" id="wc-step-${s.id}">
              <span class="wc-step-indicator">&#9675;</span>
              <span class="wc-step-label">${s.label}</span>
            </div>
          `).join('')}
        </div>
        <div class="wc-progress-spinner"></div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  return {
    updateStep(stepId) {
      // Mark previous steps as complete
      const allSteps = modal.querySelectorAll('.wc-progress-step');
      let found = false;
      allSteps.forEach(el => {
        if (el.id === `wc-step-${stepId}`) {
          el.classList.add('wc-step-active');
          found = true;
        } else if (!found) {
          el.classList.remove('wc-step-active');
          el.classList.add('wc-step-done');
          el.querySelector('.wc-step-indicator').innerHTML = '&#10003;';
        }
      });
    },
    hide() {
      const el = document.getElementById('wishcard-progress-modal');
      if (el) {
        el.style.opacity = '0';
        setTimeout(() => el.remove(), 300);
      }
    }
  };
}

/**
 * Show the card preview after generation (before sharing)
 * Displays the card in an iframe with Share and Download buttons
 */
export function showCardPreview(htmlContent, metadata = {}) {
  const { recipientName, cardType, occasion, thumbnailDataUrl, colors } = metadata;

  // Remove any existing preview modal
  const existing = document.getElementById('wishcard-preview-modal');
  if (existing) existing.remove();

  // Inject styles if needed
  if (!document.getElementById('wishcard-share-styles')) {
    const style = document.createElement('style');
    style.id = 'wishcard-share-styles';
    style.textContent = getShareStyles();
    document.head.appendChild(style);
  }

  const modal = document.createElement('div');
  modal.id = 'wishcard-preview-modal';
  modal.innerHTML = `
    <div class="wc-share-overlay">
      <div class="wc-share-card wc-preview-card">
        <button class="wc-share-close" onclick="document.getElementById('wishcard-preview-modal').remove()">&times;</button>
        <h2 class="wc-share-title">Card Preview &#127912;</h2>
        <div class="wc-preview-iframe-wrap">
          <iframe class="wc-preview-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
        </div>
        <div class="wc-share-buttons">
          <button class="wc-share-btn wc-share-whatsapp" id="wc-preview-share-btn">
            <span class="wc-share-btn-icon">&#128279;</span>
            Share via Link
          </button>
          <button class="wc-share-btn wc-share-download" id="wc-preview-download-btn">
            <span class="wc-share-btn-icon">&#128229;</span>
            Phone me Download karo
          </button>
          <button class="wc-share-btn wc-share-back" id="wc-preview-back-btn">
            &#8592; Back to Edit
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Load HTML content into iframe
  const iframe = modal.querySelector('.wc-preview-iframe');
  iframe.srcdoc = htmlContent;

  // Share button handler
  document.getElementById('wc-preview-share-btn').addEventListener('click', async () => {
    modal.remove();
    const result = await shareCard({
      htmlContent,
      thumbnailDataUrl,
      cardType,
      recipientName,
      occasion,
      colors
    });
    if (result.success) {
      showShareUI(result.cardId, recipientName, cardType);
    } else {
      showErrorToast(result.error || 'Share failed. Please try again.');
    }
  });

  // Back button handler
  document.getElementById('wc-preview-back-btn').addEventListener('click', () => {
    modal.remove();
  });

  // Download button handler
  document.getElementById('wc-preview-download-btn').addEventListener('click', () => {
    if (metadata.downloadFn) {
      metadata.downloadFn();
      modal.remove();
    }
  });

  return modal;
}

// --- Internal helpers ---

/**
 * Show a floating error toast notification
 */
function showErrorToast(message) {
  const existing = document.getElementById('wishcard-error-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'wishcard-error-toast';
  toast.style.cssText = `
    position: fixed;
    top: 24px;
    left: 50%;
    transform: translateX(-50%) translateY(-10px);
    background: rgba(220, 38, 38, 0.95);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid rgba(248, 113, 113, 0.4);
    border-radius: 12px;
    padding: 14px 24px;
    color: #fff;
    font-family: 'Outfit', sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 999999;
    opacity: 0;
    transition: opacity 0.3s ease, transform 0.3s ease;
    max-width: 90vw;
    text-align: center;
    box-shadow: 0 8px 32px rgba(220, 38, 38, 0.3);
  `;
  toast.textContent = message;
  document.body.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  // Auto-hide after 4 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-10px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function generateCardId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 10);
}

async function uploadCardFiles(cardId, { htmlContent, videoBlob, thumbnailBlob }) {
  const results = { htmlUrl: null, videoUrl: null, thumbnailUrl: null };

  // Upload HTML card
  const htmlRef = ref(storage, `cards/${cardId}/card.html`);
  const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
  await uploadBytes(htmlRef, htmlBlob, { contentType: 'text/html' });
  results.htmlUrl = await getDownloadURL(htmlRef);

  // Upload video (if available)
  if (videoBlob) {
    const videoRef = ref(storage, `cards/${cardId}/video.webm`);
    await uploadBytes(videoRef, videoBlob, { contentType: 'video/webm' });
    results.videoUrl = await getDownloadURL(videoRef);
  }

  // Upload thumbnail (if available)
  if (thumbnailBlob) {
    const thumbRef = ref(storage, `cards/${cardId}/thumbnail.png`);
    await uploadBytes(thumbRef, thumbnailBlob, { contentType: 'image/png' });
    results.thumbnailUrl = await getDownloadURL(thumbRef);
  }

  return results;
}

function dataUrlToBlob(dataUrl) {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bstr = atob(parts[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

function getShareStyles() {
  return `
    .wc-share-overlay {
      position: fixed;
      inset: 0;
      background: rgba(8,5,16,0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 99999;
      padding: 16px;
      animation: wcFadeIn 0.3s ease;
    }
    @keyframes wcFadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes wcSlideUp {
      from { transform: translateY(30px); opacity: 0; }
      to { transform: translateY(0); opacity: 1; }
    }
    .wc-share-card {
      background: rgba(30, 20, 50, 0.9);
      border: 1px solid rgba(167,139,250,0.3);
      border-radius: 20px;
      padding: 32px 24px;
      max-width: 420px;
      width: 100%;
      text-align: center;
      position: relative;
      animation: wcSlideUp 0.4s ease;
      box-shadow: 0 20px 60px rgba(124,58,237,0.2);
    }
    .wc-share-close {
      position: absolute;
      top: 12px;
      right: 16px;
      background: none;
      border: none;
      color: rgba(255,255,255,0.6);
      font-size: 28px;
      cursor: pointer;
      line-height: 1;
    }
    .wc-share-close:hover { color: #fff; }
    .wc-share-success-icon {
      width: 56px;
      height: 56px;
      border-radius: 50%;
      background: linear-gradient(135deg, #7C3AED, #EC4899);
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 16px;
      font-size: 28px;
      color: white;
    }
    .wc-share-title {
      font-family: 'Outfit', sans-serif;
      font-size: 22px;
      font-weight: 700;
      color: #ffffff;
      margin: 0 0 8px;
    }
    .wc-share-subtitle {
      font-family: 'Outfit', sans-serif;
      font-size: 14px;
      color: rgba(255,255,255,0.7);
      margin: 0 0 24px;
    }
    .wc-share-link-box {
      display: flex;
      gap: 8px;
      margin-bottom: 20px;
    }
    .wc-share-link-input {
      flex: 1;
      background: rgba(255,255,255,0.08);
      border: 1px solid rgba(167,139,250,0.3);
      border-radius: 10px;
      padding: 10px 14px;
      color: #e2d9f3;
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      outline: none;
    }
    .wc-share-copy-btn {
      background: linear-gradient(135deg, #7C3AED, #EC4899);
      border: none;
      border-radius: 10px;
      padding: 10px 18px;
      color: white;
      font-family: 'Outfit', sans-serif;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      white-space: nowrap;
      transition: transform 0.15s;
    }
    .wc-share-copy-btn:active { transform: scale(0.95); }
    .wc-share-buttons {
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .wc-share-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      padding: 14px 20px;
      border-radius: 12px;
      font-family: 'Outfit', sans-serif;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      border: none;
      text-decoration: none;
      transition: transform 0.15s, box-shadow 0.15s;
    }
    .wc-share-btn:active { transform: scale(0.97); }
    .wc-share-btn-icon { font-size: 18px; }
    .wc-share-whatsapp {
      background: linear-gradient(135deg, #25D366, #128C7E);
      color: white;
    }
    .wc-share-download {
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(167,139,250,0.4);
      color: #e2d9f3;
    }
    .wc-share-back {
      background: transparent;
      color: rgba(255,255,255,0.6);
      font-size: 13px;
    }
    .wc-share-footer {
      font-family: 'Outfit', sans-serif;
      font-size: 12px;
      color: rgba(255,255,255,0.4);
      margin: 20px 0 0;
    }
    /* Progress UI */
    .wc-progress-card {
      max-width: 360px;
    }
    .wc-progress-steps {
      text-align: left;
      margin: 20px 0;
    }
    .wc-progress-step {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 0;
      font-family: 'Outfit', sans-serif;
      font-size: 14px;
      color: rgba(255,255,255,0.4);
      transition: all 0.3s;
    }
    .wc-progress-step.wc-step-active {
      color: #ffffff;
    }
    .wc-progress-step.wc-step-done {
      color: rgba(167,139,250,0.8);
    }
    .wc-step-indicator {
      width: 24px;
      height: 24px;
      display: flex;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      font-size: 12px;
      border: 2px solid rgba(255,255,255,0.2);
      flex-shrink: 0;
    }
    .wc-step-active .wc-step-indicator {
      border-color: #a78bfa;
      background: rgba(167,139,250,0.2);
      animation: wcPulse 1s infinite;
    }
    .wc-step-done .wc-step-indicator {
      border-color: #a78bfa;
      background: linear-gradient(135deg, #7C3AED, #EC4899);
      color: white;
    }
    @keyframes wcPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(167,139,250,0.4); }
      50% { box-shadow: 0 0 0 6px rgba(167,139,250,0); }
    }
    .wc-progress-spinner {
      width: 32px;
      height: 32px;
      border: 3px solid rgba(167,139,250,0.2);
      border-top-color: #a78bfa;
      border-radius: 50%;
      margin: 10px auto 0;
      animation: wcSpin 0.8s linear infinite;
    }
    @keyframes wcSpin {
      to { transform: rotate(360deg); }
    }
    /* Preview UI */
    .wc-preview-card {
      max-width: 400px;
      padding: 24px 20px;
    }
    .wc-preview-iframe-wrap {
      width: 100%;
      aspect-ratio: 9/16;
      max-height: 50vh;
      border-radius: 12px;
      overflow: hidden;
      margin: 16px 0;
      border: 1px solid rgba(167,139,250,0.3);
    }
    .wc-preview-iframe {
      width: 100%;
      height: 100%;
      border: none;
    }
  `;
}
