#!/usr/bin/env node
// Encodes the real screenshots recorded by
// tests-e2e/media-specs/record-desktop-capture.spec.ts into looping GIFs for
// the onboarding Method/First-Value screens. Run after
// `npx playwright test --config=playwright.media.config.ts`.
//
// Requires `ffmpeg` on PATH. Not part of any release gate -- this is a
// content-generation utility, run manually and the output committed as a
// static asset (public/onboarding/*.gif), the same way any other image
// asset in public/ is committed rather than generated at build time.
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const MEDIA_ROOT = path.join(REPO_ROOT, "tests-e2e/.media");
const OUT_DIR = path.join(REPO_ROOT, "public/onboarding");

function requireFrame(framesDir, name) {
  const file = path.join(framesDir, name);
  if (!fs.existsSync(file)) {
    throw new Error(`Missing recorded frame: ${file} -- run the media-recording specs first:\n  npx playwright test --config=playwright.media.config.ts`);
  }
  return file;
}

/** Builds an ffmpeg concat-demuxer list file for a sequence of (frame, durationSeconds) pairs. */
function writeConcatList(framesDir, sequence, listPath) {
  const lines = [];
  for (const [frame, duration] of sequence) {
    const file = requireFrame(framesDir, frame);
    lines.push(`file '${file.replace(/\\/g, "/")}'`);
    lines.push(`duration ${duration}`);
  }
  // The concat demuxer ignores the last entry's duration, so the last frame
  // is repeated once without a duration line -- a documented ffmpeg quirk,
  // not a bug here.
  const [lastFrame] = sequence[sequence.length - 1];
  lines.push(`file '${requireFrame(framesDir, lastFrame).replace(/\\/g, "/")}'`);
  fs.writeFileSync(listPath, lines.join("\n"));
}

function encodeGif(framesDir, sequence, outName, width) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const listPath = path.join(framesDir, `${outName}.concat.txt`);
  writeConcatList(framesDir, sequence, listPath);
  const outPath = path.join(OUT_DIR, outName);
  const filter = `scale=${width}:-1:flags=lanczos,fps=8,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=bayer`;
  execFileSync("ffmpeg", ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-vf", filter, "-loop", "0", outPath], {
    stdio: "inherit",
  });
  console.log(`Wrote ${outPath}`);
}

/**
 * A static screenshot scaled down, not an animated GIF: 03-sidepanel-captured
 * (380x760) and 04-dashboard-item-landed (1280x800) have too different an
 * aspect ratio to animate between without ugly letterboxing or a multi-MB
 * file (an earlier version tried this and produced an 8.8MB GIF). The real
 * dashboard screenshot alone already tells "it lands in your workspace"
 * clearly.
 */
function encodeStillPng(framesDir, frame, outName, width) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, outName);
  execFileSync("ffmpeg", ["-y", "-i", requireFrame(framesDir, frame), "-vf", `scale=${width}:-1:flags=lanczos`, "-update", "1", "-frames:v", "1", outPath], {
    stdio: "inherit",
  });
  console.log(`Wrote ${outPath}`);
}

const DESKTOP_CAPTURE_FRAMES = path.join(MEDIA_ROOT, "desktop-capture");
const CAPTURE_MODES_FRAMES = path.join(MEDIA_ROOT, "capture-modes");

encodeGif(
  DESKTOP_CAPTURE_FRAMES,
  [
    ["01-sidepanel-ready.png", 1.6],
    ["02-sidepanel-capturing.png", 0.9],
    ["03-sidepanel-captured.png", 2.2],
  ],
  "desktop-capture.gif",
  320,
);

encodeStillPng(DESKTOP_CAPTURE_FRAMES, "04-dashboard-item-landed.png", "first-value.png", 900);

encodeGif(
  CAPTURE_MODES_FRAMES,
  [
    ["00-element-hover.png", 1.8],
    ["01-element-captured.png", 2.0],
  ],
  "mode-element.gif",
  420,
);

encodeGif(
  CAPTURE_MODES_FRAMES,
  [
    ["02-snip-dragging.png", 1.6],
    ["03-snip-captured.png", 2.0],
  ],
  "mode-snip.gif",
  420,
);
