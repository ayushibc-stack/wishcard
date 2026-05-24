// Video Capture Module for WishCard.in
// Records card animations as WebM video using Canvas + MediaRecorder API

/**
 * Records a card video animation and auto-downloads it as WebM.
 *
 * @param {Object} options - Configuration options
 * @param {string|null} options.photoDataUrl - Base64 photo data URL
 * @param {string} options.recipientName - Name to display
 * @param {string} options.wishText - Wish line text
 * @param {string} options.message - Message text
 * @param {Object} options.colors - Color scheme
 * @param {string} options.colors.primary - Primary background color
 * @param {string} options.colors.secondary - Secondary background color
 * @param {string} options.colors.glow - Glow color for accents
 * @param {string[]} options.colors.particles - Array of particle colors
 * @param {number} [options.duration=5000] - Recording duration in ms
 * @param {string} [options.filename='wishcard_video.webm'] - Output filename
 * @param {string} [options.layout='circular'] - Layout mode: 'circular' or 'fullphoto'
 * @returns {Promise<{success: boolean, error: string|null}>}
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
    return { success: false, error: 'MediaRecorder is not supported in this browser. Safari pe video download available nahi hai.' };
  }

  const mimeType = getSupportedMimeType();
  if (!mimeType) {
    return { success: false, error: 'No supported video format found. Please use Chrome or Firefox.' };
  }

  const W = 1080, H = 1920;

  try {
    // Load photo if provided
    let photoImg = null;
    if (photoDataUrl) {
      try {
        photoImg = await loadImage(photoDataUrl, 5000);
      } catch (e) {
        // Continue without photo
      }
    }

    const videoBlob = await doRecord({ W, H, duration, mimeType, photoImg, recipientName, wishText, message, primary, secondary, glow, particleColors, layout });

    // Auto download
    const url = URL.createObjectURL(videoBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: err.message || 'Video recording failed' };
  }
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

function loadImage(src, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const timer = setTimeout(() => reject(new Error('Image load timeout')), timeout);
    img.onload = () => { clearTimeout(timer); resolve(img); };
    img.onerror = () => { clearTimeout(timer); reject(new Error('Image load failed')); };
    img.src = src;
  });
}

function hexToRgba(hex, alpha) {
  if (!hex || hex.charAt(0) !== '#') return `rgba(200,150,250,${alpha})`;
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return `rgba(${r},${g},${b},${alpha})`;
}

function wrapText(ctx, text, x, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let y = 0;
  const lines = [];
  for (let n = 0; n < words.length; n++) {
    const testLine = line + words[n] + ' ';
    if (ctx.measureText(testLine).width > maxWidth && n > 0) {
      lines.push(line.trim());
      line = words[n] + ' ';
    } else {
      line = testLine;
    }
  }
  lines.push(line.trim());
  return lines;
}

function drawParticles(ctx, particles, elapsed, W, H) {
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
    ctx.shadowBlur = 6;
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function doRecord({ W, H, duration, mimeType, photoImg, recipientName, wishText, message, primary, secondary, glow, particleColors, layout }) {
  return new Promise((resolve, reject) => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Setup particles
    const particles = [];
    for (let i = 0; i < 50; i++) {
      particles.push({
        x: Math.random() * W,
        y: Math.random() * H,
        radius: Math.random() * 4 + 1.5,
        speedY: Math.random() * 2.5 + 0.8,
        speedX: (Math.random() - 0.5) * 1,
        alpha: Math.random() * 0.6 + 0.3,
        color: particleColors[i % particleColors.length]
      });
    }

    // Setup MediaRecorder
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
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    recorder.onstop = () => {
      const blob = new Blob(chunks, { type: mimeType });
      resolve(blob);
    };
    recorder.onerror = (e) => {
      reject(new Error('MediaRecorder error'));
    };

    const startTime = performance.now();
    let animFrame;

    function animate() {
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      ctx.clearRect(0, 0, W, H);

      if (layout === 'fullphoto') {
        drawFullphotoFrame(ctx, W, H, elapsed, duration, photoImg, recipientName, wishText, message, primary, secondary, glow, particleColors, particles);
      } else {
        drawCircularFrame(ctx, W, H, elapsed, duration, photoImg, recipientName, wishText, message, primary, secondary, glow, particleColors, particles);
      }

      if (progress < 1) {
        animFrame = requestAnimationFrame(animate);
      }
    }

    recorder.start();
    animate();

    setTimeout(() => {
      if (animFrame) cancelAnimationFrame(animFrame);
      recorder.stop();
    }, duration);
  });
}

function drawCircularFrame(ctx, W, H, elapsed, duration, photoImg, recipientName, wishText, message, primary, secondary, glow, particleColors, particles) {
  // Animated gradient background
  const shift = 0.5 + 0.5 * Math.sin(elapsed / 4000);
  const bgGrad = ctx.createLinearGradient(0, 0, W * shift, H);
  bgGrad.addColorStop(0, primary);
  bgGrad.addColorStop(0.5, secondary);
  bgGrad.addColorStop(1, primary);
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Particles
  drawParticles(ctx, particles, elapsed, W, H);

  // Photo fade in (0.5s - 1.5s)
  if (photoImg) {
    const photoAlpha = Math.min(1, Math.max(0, (elapsed - 500) / 1000));
    if (photoAlpha > 0) {
      const photoSize = W * 0.45;
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
      ctx.shadowBlur = 20 + 10 * Math.sin(elapsed / 700);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // Name fade in (1.5s - 2.5s)
  const nameAlpha = Math.min(1, Math.max(0, (elapsed - 1500) / 1000));
  if (nameAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = nameAlpha;
    ctx.font = "bold 90px 'Cormorant Garamond', serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 25 + 10 * Math.sin(elapsed / 600);
    ctx.fillText(recipientName, W / 2, H * 0.62);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Wish text fade in (2.5s - 3.5s)
  const wishAlpha = Math.min(1, Math.max(0, (elapsed - 2500) / 1000));
  if (wishAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = wishAlpha;
    ctx.font = "italic 54px 'Cormorant Garamond', serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = glow;
    ctx.fillText(wishText, W / 2, H * 0.70);
    ctx.restore();
  }

  // Message fade in (3s - 4s)
  if (message) {
    const msgAlpha = Math.min(1, Math.max(0, (elapsed - 3000) / 1000));
    if (msgAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = msgAlpha;
      ctx.font = "400 38px 'Outfit', sans-serif";
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(255,255,255,0.6)';
      const lines = wrapText(ctx, message, W / 2, W * 0.75, 52);
      let startY = H * 0.78;
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, startY + i * 52);
      });
      ctx.restore();
    }
  }

  // Branding
  const brandAlpha = Math.min(0.5, Math.max(0, (elapsed - 4000) / 1000));
  if (brandAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = brandAlpha;
    ctx.font = "400 32px 'Outfit', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('WishCard.in', W / 2, H * 0.94);
    ctx.restore();
  }
}

function drawFullphotoFrame(ctx, W, H, elapsed, duration, photoImg, recipientName, wishText, message, primary, secondary, glow, particleColors, particles) {
  // Full bleed photo or solid bg
  if (photoImg) {
    ctx.drawImage(photoImg, 0, 0, W, H);
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
  fade.addColorStop(1, 'rgba(0,0,0,0.92)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);

  // Particles
  drawParticles(ctx, particles, elapsed, W, H);

  // Glass panel area
  const pX = 70, pY = H - 660, pW = W - 140, pH = 540, pR = 32;

  // Glass panel fade in (1s - 2s)
  const panelAlpha = Math.min(1, Math.max(0, (elapsed - 1000) / 1000));
  if (panelAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = panelAlpha * 0.45;
    ctx.beginPath();
    ctx.moveTo(pX + pR, pY); ctx.lineTo(pX + pW - pR, pY); ctx.quadraticCurveTo(pX + pW, pY, pX + pW, pY + pR);
    ctx.lineTo(pX + pW, pY + pH - pR); ctx.quadraticCurveTo(pX + pW, pY + pH, pX + pW - pR, pY + pH);
    ctx.lineTo(pX + pR, pY + pH); ctx.quadraticCurveTo(pX, pY + pH, pX, pY + pH - pR);
    ctx.lineTo(pX, pY + pR); ctx.quadraticCurveTo(pX, pY, pX + pR, pY);
    ctx.closePath();
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  // Name fade in (1.5s - 2.5s)
  const nameAlpha = Math.min(1, Math.max(0, (elapsed - 1500) / 1000));
  if (nameAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = nameAlpha;
    ctx.textAlign = 'center';

    // Tag
    ctx.font = "600 26px 'Outfit', sans-serif";
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('\u2726   SPECIAL DAY   \u2726', W / 2, pY + 80);

    // Name
    ctx.font = "700 90px 'Cormorant Garamond', serif";
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = glow;
    ctx.shadowBlur = 25;
    ctx.fillText(recipientName, W / 2, pY + 195);
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  // Wish fade in (2s - 3s)
  const wishAlpha = Math.min(1, Math.max(0, (elapsed - 2000) / 1000));
  if (wishAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = wishAlpha;
    ctx.textAlign = 'center';
    ctx.font = "italic 600 46px 'Cormorant Garamond', serif";
    ctx.fillStyle = glow;
    ctx.fillText(wishText, W / 2, pY + 280);
    ctx.restore();
  }

  // Message fade in (3s - 4s)
  if (message) {
    const msgAlpha = Math.min(1, Math.max(0, (elapsed - 3000) / 1000));
    if (msgAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = msgAlpha;
      ctx.textAlign = 'center';
      ctx.font = "400 34px 'Outfit', sans-serif";
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const lines = wrapText(ctx, message, W / 2, pW - 80, 48);
      let startY = pY + 390;
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, startY + i * 48);
      });
      ctx.restore();
    }
  }

  // Branding
  const brandAlpha = Math.min(0.4, Math.max(0, (elapsed - 4000) / 1000));
  if (brandAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = brandAlpha;
    ctx.font = "400 30px 'Outfit', sans-serif";
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.fillText('WishCard.in', W / 2, H * 0.95);
    ctx.restore();
  }
}
