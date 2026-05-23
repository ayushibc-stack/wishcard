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

const FRAMES_DIR = "/tmp/frames";
const OUTPUT_PATH = "/tmp/output.mp4";
const FPS = 30;
const DURATION_SECONDS = 10;
const TOTAL_FRAMES = FPS * DURATION_SECONDS;
const FRAME_INTERVAL = 1000 / FPS;

/**
 * Encodes captured frames into an MP4 video using FFmpeg.
 * @return {Promise<void>} Resolves when encoding is complete.
 */
function encodeFramesToVideo() {
  return new Promise((resolve, reject) => {
    ffmpeg.setFfmpegPath(ffmpegPath);

    ffmpeg()
        .input(path.join(FRAMES_DIR, "frame-%03d.png"))
        .inputFPS(FPS)
        .videoCodec("libx264")
        .size("1080x1920")
        .outputOptions([
          "-pix_fmt yuv420p",
          `-r ${FPS}`,
        ])
        .output(OUTPUT_PATH)
        .on("end", () => resolve())
        .on("error", (err) => reject(err))
        .run();
  });
}

/**
 * Cleans up temporary files created during video rendering.
 */
function cleanup() {
  try {
    if (fs.existsSync(FRAMES_DIR)) {
      const files = fs.readdirSync(FRAMES_DIR);
      for (const file of files) {
        fs.unlinkSync(path.join(FRAMES_DIR, file));
      }
      fs.rmdirSync(FRAMES_DIR);
    }
    if (fs.existsSync(OUTPUT_PATH)) {
      fs.unlinkSync(OUTPUT_PATH);
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
      timeoutSeconds: 300,
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
        if (!fs.existsSync(FRAMES_DIR)) {
          fs.mkdirSync(FRAMES_DIR, {recursive: true});
        }

        // Capture screenshots (30fps for 10 seconds = 300 frames)
        for (let i = 1; i <= TOTAL_FRAMES; i++) {
          const frameNumber = String(i).padStart(3, "0");
          await page.screenshot({
            path: path.join(FRAMES_DIR, `frame-${frameNumber}.png`),
            type: "png",
          });

          if (i < TOTAL_FRAMES) {
            await delay(FRAME_INTERVAL);
          }
        }

        // Close browser
        await browser.close();
        browser = null;

        // Encode frames to MP4
        await encodeFramesToVideo();

        // Upload MP4 to Firebase Storage
        const bucket = getStorage().bucket();
        const storagePath = `cards/${cardId}/video.mp4`;

        await bucket.upload(OUTPUT_PATH, {
          destination: storagePath,
          metadata: {
            contentType: "video/mp4",
          },
        });

        // Make the file publicly accessible
        const file = bucket.file(storagePath);
        await file.makePublic();

        // Get public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${storagePath}`;

        // Update Firestore with video URL and status
        await docRef.update({
          videoUrl: publicUrl,
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
        cleanup();
      }
    },
);
