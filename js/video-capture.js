// Video Capture Module for WishCard.in
// Captures card animations as video using Canvas + MediaRecorder API

/**
 * Captures a card's visual essence as a video using canvas-based animation.
 * Creates a canvas animation with gradient background, particles, text, and photo
 * then records it using MediaRecorder API.
 *
 * @param {string} cardHtmlContent - The full HTML content of the card
 * @param {Object} options - Configuration options
 * @param {number} options.duration - Recording duration in ms (default: 10000)
 * @param {number} options.width - Canvas width (default: 1080)
 * @param {number} options.height - Canvas height (default: 1920)
 * @param {string|null} options.recipientName - Name to display on canvas
 * @param {string|null} options.photoDataUrl - Base64 photo to draw on canvas
 * @param {Object|null} options.colors - Color scheme { primary, secondary, accent }
 * @returns {Promise<{videoBlob: Blob|null, error: string|null}>}
 */
export async function captureCardVideo(cardHtmlContent, options = {}) {
  const {
    duration = 10000,
    width = 1080,
    height = 1920,
    recipientName = null,
    photoDataUrl = null,
    colors = null
  } = options;

  // Check MediaRecorder support
  if (typeof MediaRecorder === 'undefined') {
    return { videoBlob: null, error: 'MediaRecorder not supported in this browser' };
  }

  // Determine supported mime type
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    return { videoBlob: null, error: 'No supported video recording format found' };
  }

  // Parse card info from HTML if not provided via options
  const cardInfo = parseCardInfo(cardHtmlContent, { recipientName, colors });

  try {
    const videoBlob = await recordCanvasAnimation({
      width,
      height,
      duration,
      mimeType,
      cardInfo,
      photoDataUrl
    });
    return { videoBlob, error: null };
  } catch (err) {
    return { videoBlob: null, error: err.message || 'Video capture failed' };
  }
}

/**
 * Generate a static thumbnail image from the card content.
 * Draws a simplified card preview on canvas and returns as PNG Blob.
 *
 * @param {string} cardHtmlContent - The full HTML content of the card
 * @param {Object} options - Configuration options
 * @param {number} options.width - Thumbnail width (default: 540)
 * @param {number} options.height - Thumbnail height (default: 960)
 * @param {string|null} options.recipientName - Name to display
 * @param {string|null} options.photoDataUrl - Base64 photo
 * @param {Object|null} options.colors - Color scheme
 * @returns {Promise<Blob>}
 */
export async function generateThumbnail(cardHtmlContent, options = {}) {
  const {
    width = 540,
    height = 960,
    recipientName = null,
    photoDataUrl = null,
    colors = null
  } = options;

  const cardInfo = parseCardInfo(cardHtmlContent, { recipientName, colors });

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Draw background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, cardInfo.colors.primary || '#1a0533');
  bgGrad.addColorStop(0.5, cardInfo.colors.secondary || '#2d1b69');
  bgGrad.addColorStop(1, cardInfo.colors.accent || '#4c1d95');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Draw some decorative particles
  drawParticles(ctx, width, height, 30, cardInfo.colors);

  // Draw photo if available
  if (photoDataUrl) {
    try {
      const img = await loadImage(photoDataUrl);
      const photoSize = Math.min(width, height) * 0.4;
      const px = (width - photoSize) / 2;
      const py = height * 0.25;

      // Circular clip for photo
      ctx.save();
      ctx.beginPath();
      ctx.arc(px + photoSize / 2, py + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, px, py, photoSize, photoSize);
      ctx.restore();

      // Glow ring around photo
      ctx.beginPath();
      ctx.arc(px + photoSize / 2, py + photoSize / 2, photoSize / 2 + 4, 0, Math.PI * 2);
      ctx.strokeStyle = cardInfo.colors.glow || '#e879f9';
      ctx.lineWidth = 3;
      ctx.shadowColor = cardInfo.colors.glow || '#e879f9';
      ctx.shadowBlur = 15;
      ctx.stroke();
      ctx.shadowBlur = 0;
    } catch (e) {
      // Photo load failed, continue without it
    }
  }

  // Draw recipient name
  if (cardInfo.recipientName) {
    const fontSize = Math.floor(width * 0.08);
    ctx.font = `bold ${fontSize}px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = cardInfo.colors.glow || '#e879f9';
    ctx.shadowBlur = 20;
    ctx.fillText(cardInfo.recipientName, width / 2, height * 0.72);
    ctx.shadowBlur = 0;
  }

  // Draw "WishCard.in" branding
  const brandSize = Math.floor(width * 0.04);
  ctx.font = `${brandSize}px 'Outfit', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillText('WishCard.in', width / 2, height * 0.95);

  return new Promise((resolve) => {
    canvas.toBlob((blob) => {
      resolve(blob);
    }, 'image/png');
  });
}

// --- Internal helpers ---

function getSupportedMimeType() {
  const types = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  for (const type of types) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }
  return null;
}

function parseCardInfo(htmlContent, overrides = {}) {
  let recipientName = overrides.recipientName || null;
  let colors = overrides.colors || null;

  // Try to extract name from HTML content
  if (!recipientName && htmlContent) {
    const nameMatch = htmlContent.match(/class="[^"]*name[^"]*"[^>]*>([^<]+)</i);
    if (nameMatch) {
      recipientName = nameMatch[1].trim();
    }
  }

  // Default color scheme if not provided
  if (!colors) {
    colors = {
      primary: '#1a0533',
      secondary: '#2d1b69',
      accent: '#4c1d95',
      glow: '#e879f9',
      particles: '#a78bfa'
    };

    // Try to extract colors from HTML
    if (htmlContent) {
      const bgMatch = htmlContent.match(/background[^:]*:\s*(#[0-9a-fA-F]{6}|#[0-9a-fA-F]{3})/);
      if (bgMatch) {
        colors.primary = bgMatch[1];
      }
    }
  }

  return { recipientName, colors };
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function drawParticles(ctx, width, height, count, colors) {
  for (let i = 0; i < count; i++) {
    const x = Math.random() * width;
    const y = Math.random() * height;
    const radius = Math.random() * 4 + 1;
    const alpha = Math.random() * 0.6 + 0.2;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(colors.particles || '#a78bfa', alpha);
    ctx.fill();
  }
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

function recordCanvasAnimation({ width, height, duration, mimeType, cardInfo, photoDataUrl }) {
  return new Promise(async (resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Load photo image if available
    let photoImg = null;
    if (photoDataUrl) {
      try {
        photoImg = await loadImage(photoDataUrl);
      } catch (e) {
        // Continue without photo
      }
    }

    // Set up MediaRecorder
    const stream = canvas.captureStream(30);
    let recorder;
    try {
      recorder = new MediaRecorder(stream, { mimeType });
    } catch (e) {
      reject(new Error('Failed to create MediaRecorder: ' + e.message));
      return;
    }

    const chunks = [];
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunks.push(e.data);
      }
    };

    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };

    recorder.onerror = (e) => {
      reject(new Error('MediaRecorder error: ' + (e.error?.message || 'unknown')));
    };

    // Particle state for animation
    const particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        radius: Math.random() * 4 + 1,
        speedY: Math.random() * 2 + 0.5,
        speedX: (Math.random() - 0.5) * 0.8,
        alpha: Math.random() * 0.7 + 0.3,
        color: Math.random() > 0.5
          ? (cardInfo.colors.glow || '#e879f9')
          : (cardInfo.colors.particles || '#a78bfa')
      });
    }

    const startTime = performance.now();
    let animFrame;

    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      // Animated background gradient (slight shift over time)
      const bgGrad = ctx.createLinearGradient(0, 0, width * (0.5 + 0.5 * Math.sin(elapsed / 5000)), height);
      bgGrad.addColorStop(0, cardInfo.colors.primary || '#1a0533');
      bgGrad.addColorStop(0.5, cardInfo.colors.secondary || '#2d1b69');
      bgGrad.addColorStop(1, cardInfo.colors.accent || '#4c1d95');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Animated particles falling down
      for (const p of particles) {
        p.y += p.speedY;
        p.x += p.speedX;
        if (p.y > height + 10) {
          p.y = -10;
          p.x = Math.random() * width;
        }
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fillStyle = hexToRgba(p.color, p.alpha * (0.5 + 0.5 * Math.sin(elapsed / 500 + p.x)));
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }

      // Photo with fade-in (appears from 1s to 2s)
      if (photoImg) {
        const photoAlpha = Math.min(1, Math.max(0, (elapsed - 1000) / 1000));
        if (photoAlpha > 0) {
          const photoSize = Math.min(width, height) * 0.4;
          const px = (width - photoSize) / 2;
          const py = height * 0.2;

          ctx.save();
          ctx.globalAlpha = photoAlpha;

          // Circular clip
          ctx.beginPath();
          ctx.arc(px + photoSize / 2, py + photoSize / 2, photoSize / 2, 0, Math.PI * 2);
          ctx.closePath();
          ctx.clip();
          ctx.drawImage(photoImg, px, py, photoSize, photoSize);
          ctx.restore();

          // Glow ring
          ctx.save();
          ctx.globalAlpha = photoAlpha;
          ctx.beginPath();
          ctx.arc(px + photoSize / 2, py + photoSize / 2, photoSize / 2 + 4, 0, Math.PI * 2);
          ctx.strokeStyle = cardInfo.colors.glow || '#e879f9';
          ctx.lineWidth = 4;
          ctx.shadowColor = cardInfo.colors.glow || '#e879f9';
          ctx.shadowBlur = 20 + 10 * Math.sin(elapsed / 800);
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }

      // Recipient name with fade-in and glow (appears from 2s to 3s)
      if (cardInfo.recipientName) {
        const textAlpha = Math.min(1, Math.max(0, (elapsed - 2000) / 1000));
        if (textAlpha > 0) {
          const fontSize = Math.floor(width * 0.09);
          ctx.save();
          ctx.globalAlpha = textAlpha;
          ctx.font = `bold ${fontSize}px 'Cormorant Garamond', serif`;
          ctx.textAlign = 'center';
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = cardInfo.colors.glow || '#e879f9';
          ctx.shadowBlur = 25 + 10 * Math.sin(elapsed / 600);
          ctx.fillText(cardInfo.recipientName, width / 2, height * 0.68);
          ctx.shadowBlur = 0;
          ctx.restore();
        }
      }

      // "Happy Birthday" / occasion text (appears from 3s to 4s)
      const msgAlpha = Math.min(1, Math.max(0, (elapsed - 3000) / 1000));
      if (msgAlpha > 0) {
        const msgSize = Math.floor(width * 0.055);
        ctx.save();
        ctx.globalAlpha = msgAlpha;
        ctx.font = `${msgSize}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.shadowColor = cardInfo.colors.glow || '#e879f9';
        ctx.shadowBlur = 15;
        ctx.fillText('Made with love on WishCard.in', width / 2, height * 0.82);
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      // Branding watermark
      const brandAlpha = Math.min(0.5, Math.max(0, (elapsed - 4000) / 1000));
      if (brandAlpha > 0) {
        const brandSize = Math.floor(width * 0.035);
        ctx.save();
        ctx.globalAlpha = brandAlpha;
        ctx.font = `${brandSize}px 'Outfit', sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillText('WishCard.in', width / 2, height * 0.95);
        ctx.restore();
      }

      if (progress < 1) {
        animFrame = requestAnimationFrame(animate);
      }
    }

    // Start recording
    recorder.start();
    animate();

    // Stop after duration
    setTimeout(() => {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
      }
      recorder.stop();
    }, duration);
  });
}
