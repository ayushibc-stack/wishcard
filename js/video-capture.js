// Video Capture Module for WishCard.in
// Records a 5-second animated canvas video with photo + text + particles

/**
 * Records a 5-second animated video of the card using Canvas + MediaRecorder.
 * Draws the photo as background, overlays text and animated particles,
 * then auto-downloads as WebM.
 *
 * @param {Object} options - Configuration
 * @param {string|null} options.photoDataUrl - Base64 photo data URL
 * @param {string} options.recipientName - Name to display
 * @param {string} options.wishText - Wish line text
 * @param {string} options.message - Message text
 * @param {Object} options.colors - { primary, secondary, glow, particles[] }
 * @param {number} [options.duration=5000] - Recording duration in ms
 * @param {string} [options.filename='wishcard_video.webm'] - Download filename
 * @param {string} [options.layout='circular'] - Layout mode: 'circular' or 'fullphoto'
 * @returns {Promise<void>}
 */
export async function recordCardVideo(options = {}) {
  const {
    photoDataUrl = null,
    recipientName = 'Friend',
    wishText = 'Happy Birthday',
    message = '',
    colors = {},
    duration = 5000,
    filename = 'wishcard_video.webm',
    layout = 'circular'
  } = options;

  const primary = colors.primary || '#1a0533';
  const secondary = colors.secondary || '#2d1b69';
  const glow = colors.glow || '#e879f9';
  const particleColors = colors.particles || ['#a78bfa', '#e879f9', '#38bdf8', '#f5c842'];

  // Check MediaRecorder support
  if (typeof MediaRecorder === 'undefined') {
    alert('Video recording is not supported in this browser. Please use Chrome or Firefox.');
    return;
  }

  // Determine supported mime type
  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    alert('No supported video format found. Please use Chrome or Firefox for video download.');
    return;
  }

  const W = 1080;
  const H = 1920;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // Load photo if available
  let photoImg = null;
  if (photoDataUrl) {
    try {
      photoImg = await loadImage(photoDataUrl);
    } catch (e) {
      // Continue without photo
    }
  }

  // Set up particles
  const particles = [];
  for (let i = 0; i < 60; i++) {
    particles.push({
      x: Math.random() * W,
      y: Math.random() * H,
      radius: Math.random() * 4 + 1.5,
      speedY: Math.random() * 2.5 + 0.8,
      speedX: (Math.random() - 0.5) * 1.2,
      alpha: Math.random() * 0.7 + 0.3,
      color: particleColors[i % particleColors.length]
    });
  }

  // Set up MediaRecorder
  const stream = canvas.captureStream(30);
  let recorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType });
  } catch (e) {
    alert('Failed to start video recording: ' + e.message);
    return;
  }

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const recordingDone = new Promise((resolve) => {
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      // Auto-download
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      resolve();
    };
  });

  // Animation loop
  const startTime = performance.now();
  let animFrame;

  function animate() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);

    // Clear
    ctx.clearRect(0, 0, W, H);

    if (layout === 'fullphoto') {
      renderFullphotoFrame(ctx, W, H, elapsed, photoImg, particles, particleColors, primary, secondary, glow, recipientName, wishText, message);
    } else {
      renderCircularFrame(ctx, W, H, elapsed, photoImg, particles, particleColors, primary, secondary, glow, recipientName, wishText, message);
    }

    // Branding (fade in from 3.5s)
    const brandAlpha = Math.min(0.5, Math.max(0, (elapsed - 3500) / 1000));
    if (brandAlpha > 0) {
      const brandSize = Math.floor(W * 0.035);
      ctx.save();
      ctx.globalAlpha = brandAlpha;
      ctx.font = `${brandSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fillText('WishCard.in', W / 2, H * 0.92);
      ctx.restore();
    }

    if (progress < 1) {
      animFrame = requestAnimationFrame(animate);
    }
  }

  // Start
  recorder.start();
  animate();

  // Stop after duration
  setTimeout(() => {
    if (animFrame) cancelAnimationFrame(animFrame);
    recorder.stop();
  }, duration);

  return recordingDone;
}

// --- Internal helpers ---

function renderCircularFrame(ctx, W, H, elapsed, photoImg, particles, particleColors, primary, secondary, glow, recipientName, wishText, message) {
  // Background gradient with subtle shift
  const bgGrad = ctx.createLinearGradient(0, 0, W * (0.5 + 0.3 * Math.sin(elapsed / 4000)), H);
  bgGrad.addColorStop(0, primary);
  bgGrad.addColorStop(0.5, secondary);
  bgGrad.addColorStop(1, primary);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Draw photo with fade-in (0s to 1s)
  if (photoImg) {
    const photoAlpha = Math.min(1, elapsed / 1000);
    if (photoAlpha > 0) {
      const photoSize = W * 0.5;
      const px = (W - photoSize) / 2;
      const py = H * 0.18;

      ctx.save();
      ctx.globalAlpha = photoAlpha;
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
      ctx.arc(px + photoSize / 2, py + photoSize / 2, photoSize / 2 + 5, 0, Math.PI * 2);
      ctx.strokeStyle = glow;
      ctx.lineWidth = 5;
      ctx.shadowColor = glow;
      ctx.shadowBlur = 25 + 12 * Math.sin(elapsed / 700);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // Animated particles
  drawParticles(ctx, W, H, elapsed, particles);

  // Name text (fade in from 1s to 2s)
  const nameAlpha = Math.min(1, Math.max(0, (elapsed - 1000) / 1000));
  if (nameAlpha > 0) {
    const fontSize = Math.floor(W * 0.09);
    ctx.save();
    ctx.globalAlpha = nameAlpha;
    ctx.font = `bold ${fontSize}px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 25;
    ctx.fillText(recipientName, W / 2, H * 0.62);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Wish text (fade in from 2s to 3s)
  const wishAlpha = Math.min(1, Math.max(0, (elapsed - 2000) / 1000));
  if (wishAlpha > 0) {
    const wishSize = Math.floor(W * 0.05);
    ctx.save();
    ctx.globalAlpha = wishAlpha;
    ctx.font = `italic ${wishSize}px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = glow;
    ctx.fillText(wishText, W / 2, H * 0.69);
    ctx.restore();
  }

  // Message text (fade in from 3s to 4s)
  if (message) {
    const msgAlpha = Math.min(1, Math.max(0, (elapsed - 3000) / 1000));
    if (msgAlpha > 0) {
      const msgSize = Math.floor(W * 0.038);
      ctx.save();
      ctx.globalAlpha = msgAlpha;
      ctx.font = `${msgSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      wrapText(ctx, message, W / 2, H * 0.76, W - 120, msgSize + 14);
      ctx.restore();
    }
  }
}

function renderFullphotoFrame(ctx, W, H, elapsed, photoImg, particles, particleColors, primary, secondary, glow, recipientName, wishText, message) {
  // Full-bleed photo background
  if (photoImg) {
    const imgAsp = photoImg.width / photoImg.height;
    const canAsp = W / H;
    let dw, dh, dx, dy;
    if (imgAsp > canAsp) { dh = H; dw = dh * imgAsp; } else { dw = W; dh = dw / imgAsp; }
    dx = (W - dw) / 2;
    dy = (H - dh) / 2;
    // Subtle Ken Burns zoom
    const scale = 1 + 0.04 * (elapsed / 5000);
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.scale(scale, scale);
    ctx.translate(-W / 2, -H / 2);
    ctx.drawImage(photoImg, dx, dy, dw, dh);
    ctx.restore();
  } else {
    const bgGrad = ctx.createLinearGradient(0, 0, W, H);
    bgGrad.addColorStop(0, primary);
    bgGrad.addColorStop(1, secondary);
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, W, H);
  }

  // Vignette
  const vign = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, H * 0.7);
  vign.addColorStop(0, 'transparent');
  vign.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vign;
  ctx.fillRect(0, 0, W, H);

  // Bottom gradient fade
  const fade = ctx.createLinearGradient(0, H * 0.35, 0, H);
  fade.addColorStop(0, 'transparent');
  fade.addColorStop(0.5, 'rgba(0,0,0,0.4)');
  fade.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  // Animated particles
  drawParticles(ctx, W, H, elapsed, particles);

  // Glass panel area
  const pX = 70, pY = H - 620, pW = W - 140, pH = 480, pR = 32;
  const panelAlpha = Math.min(1, Math.max(0, (elapsed - 500) / 1000));
  if (panelAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = panelAlpha;
    ctx.beginPath();
    ctx.moveTo(pX + pR, pY); ctx.lineTo(pX + pW - pR, pY);
    ctx.quadraticCurveTo(pX + pW, pY, pX + pW, pY + pR);
    ctx.lineTo(pX + pW, pY + pH - pR);
    ctx.quadraticCurveTo(pX + pW, pY + pH, pX + pW - pR, pY + pH);
    ctx.lineTo(pX + pR, pY + pH);
    ctx.quadraticCurveTo(pX, pY + pH, pX, pY + pH - pR);
    ctx.lineTo(pX, pY + pR);
    ctx.quadraticCurveTo(pX, pY, pX + pR, pY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 2;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // Name text (fade in from 1s to 2s)
  const nameAlpha = Math.min(1, Math.max(0, (elapsed - 1000) / 1000));
  if (nameAlpha > 0) {
    const fontSize = Math.floor(W * 0.088);
    ctx.save();
    ctx.globalAlpha = nameAlpha;
    ctx.font = `bold ${fontSize}px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 30;
    ctx.fillText(recipientName, W / 2, pY + 160);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Wish text (fade in from 2s to 3s)
  const wishAlpha = Math.min(1, Math.max(0, (elapsed - 2000) / 1000));
  if (wishAlpha > 0) {
    const wishSize = Math.floor(W * 0.044);
    ctx.save();
    ctx.globalAlpha = wishAlpha;
    ctx.font = `italic ${wishSize}px 'Cormorant Garamond', serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = glow;
    ctx.fillText(wishText, W / 2, pY + 240);
    ctx.restore();
  }

  // Message text with word-wrap (fade in from 3s to 4s)
  if (message) {
    const msgAlpha = Math.min(1, Math.max(0, (elapsed - 3000) / 1000));
    if (msgAlpha > 0) {
      const msgSize = Math.floor(W * 0.034);
      ctx.save();
      ctx.globalAlpha = msgAlpha;
      ctx.font = `${msgSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      wrapText(ctx, message, W / 2, pY + 340, pW - 80, msgSize + 16);
      ctx.restore();
    }
  }
}

function drawParticles(ctx, W, H, elapsed, particles) {
  for (const p of particles) {
    p.y += p.speedY;
    p.x += p.speedX;
    if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
    if (p.x < 0) p.x = W;
    if (p.x > W) p.x = 0;

    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fillStyle = hexToRgba(p.color, p.alpha * (0.5 + 0.5 * Math.sin(elapsed / 500 + p.x)));
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 8;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let lineY = y;
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      ctx.fillText(line.trim(), x, lineY);
      line = words[n] + ' ';
      lineY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, lineY);
}

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

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    let done = false;
    const timeout = setTimeout(() => {
      if (!done) { done = true; resolve(null); }
    }, 5000);
    img.onload = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      resolve(null);
    };
    img.src = src;
  });
}

function hexToRgba(hex, alpha) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
