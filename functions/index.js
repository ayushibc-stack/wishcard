const {onDocumentCreated} = require("firebase-functions/v2/firestore");
const {initializeApp} = require("firebase-admin/app");
const {getFirestore} = require("firebase-admin/firestore");
const {getStorage} = require("firebase-admin/storage");
const chromium = require("@sparticuz/chromium");
const puppeteer = require("puppeteer-core");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const fs = require("fs");
const path = require("path");

initializeApp();

const FPS = 10;
const DURATION_SECONDS = 10;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;

/**
 * Encodes captured frames into an MP4 video using FFmpeg.
 * @param {string} framesDir - Path to directory containing frame PNGs.
 * @param {string} outputPath - Path for the output MP4 file.
 * @return {Promise<void>} Resolves when encoding is complete.
 */
function encodeFramesToVideo(framesDir, outputPath) {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(ffmpegPath)) {
      reject(new Error(`ffmpeg binary not found at: ${ffmpegPath}`));
      return;
    }

    ffmpeg.setFfmpegPath(ffmpegPath);

    ffmpeg()
        .input(path.join(framesDir, "frame-%03d.png"))
        .inputFPS(FPS)
        .videoCodec("libx264")
        .size("1080x1920")
        .outputOptions([
          "-pix_fmt yuv420p",
          `-r ${FPS}`,
        ])
        .output(outputPath)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
  });
}

/**
 * Cleans up temporary files created during video rendering.
 * @param {string} framesDir - Path to the frames directory.
 * @param {string} outputPath - Path to the output MP4 file.
 */
function cleanup(framesDir, outputPath) {
  try {
    if (fs.existsSync(framesDir)) {
      const files = fs.readdirSync(framesDir);
      for (const file of files) {
        fs.unlinkSync(path.join(framesDir, file));
      }
      fs.rmdirSync(framesDir);
    }
    // Remove the cardId-specific directory
    const cardDir = path.dirname(framesDir);
    if (fs.existsSync(cardDir) && cardDir !== "/tmp") {
      fs.rmdirSync(cardDir);
    }
    if (fs.existsSync(outputPath)) {
      fs.unlinkSync(outputPath);
    }
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

/**
 * Helper to pause execution for a given number of milliseconds.
 * @param {number} ms - Milliseconds to wait.
 * @return {Promise<void>}
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

exports.renderCardVideo = onDocumentCreated(
    {
      document: "cards/{cardId}",
      memory: "2GiB",
      timeoutSeconds: 540,
      region: "us-central1",
    },
    async (event) => {
      const snapshot = event.data;
      if (!snapshot) {
        console.log("No data associated with the event");
        return;
      }

      const data = snapshot.data();
      const cardId = event.params.cardId;

      // Use cardId-based paths to avoid collisions between concurrent invocations
      const framesDir = `/tmp/${cardId}/frames`;
      const outputPath = `/tmp/${cardId}/output.mp4`;

      if (!data.htmlUrl) {
        console.log(`Card ${cardId} has no htmlUrl, skipping video render`);
        return;
      }

      const db = getFirestore();
      const docRef = db.collection("cards").doc(cardId);

      let browser = null;

      try {
        // Mark as processing
        await docRef.update({videoStatus: "processing"});

        // Launch Puppeteer with @sparticuz/chromium
        browser = await puppeteer.launch({
          args: chromium.args,
          defaultViewport: null,
          executablePath: await chromium.executablePath(),
          headless: "new",
        });

        const page = await browser.newPage();
        await page.setViewport({width: 1080, height: 1920});

        // Navigate to the card HTML
        await page.goto(data.htmlUrl, {waitUntil: "networkidle0", timeout: 30000});

        // Wait 2 seconds for animations to load
        await delay(2000);

        // Create frames directory
        if (!fs.existsSync(framesDir)) {
          fs.mkdirSync(framesDir, {recursive: true});
        }

        // Capture screenshots as fast as possible (no inter-frame delay)
        // At 10fps output, 100 frames produces a 10-second video
        for (let i = 1; i <= TOTAL_FRAMES; i++) {
          const frameNumber = String(i).padStart(3, "0");
          await page.screenshot({
            path: path.join(framesDir, `frame-${frameNumber}.png`),
            type: "png",
          });
        }

        // Close browser
        await browser.close();
        browser = null;

        // Encode frames to MP4
        await encodeFramesToVideo(framesDir, outputPath);

        // Upload MP4 to Firebase Storage
        const bucket = getStorage().bucket();
        const storagePath = `cards/${cardId}/video.mp4`;

        await bucket.upload(outputPath, {
          destination: storagePath,
          metadata: {
            contentType: "video/mp4",
          },
        });

        // Get a signed URL (works with uniform bucket-level access)
        const file = bucket.file(storagePath);
        const [signedUrl] = await file.getSignedUrl({
          action: "read",
          expires: "2099-12-31",
        });

        // Update Firestore with video URL and status
        await docRef.update({
          videoUrl: signedUrl,
          videoStatus: "ready",
        });

        console.log(`Video rendering complete for card ${cardId}`);
      } catch (error) {
        console.error(`Error rendering video for card ${cardId}:`, error);

        // Update status to failed
        try {
          await docRef.update({videoStatus: "failed"});
        } catch (updateError) {
          console.error("Failed to update videoStatus to failed:", updateError);
        }
      } finally {
        // Close browser if still open
        if (browser) {
          try {
            await browser.close();
          } catch (closeError) {
            console.error("Error closing browser:", closeError);
          }
        }

        // Clean up temporary files
        cleanup(framesDir, outputPath);
      }
    },
);
