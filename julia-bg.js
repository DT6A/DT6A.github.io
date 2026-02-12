(() => {
  "use strict";

  const canvas = document.getElementById("julia-canvas");
  if (!canvas) {
    return;
  }

  const ctx = canvas.getContext("2d", { alpha: true, desynchronized: true });
  if (!ctx) {
    return;
  }

  const TAU = Math.PI * 2;
  const BASE_TARGET_PIXELS = 180000;
  const MIN_WIDTH = 140;
  const MIN_HEIGHT = 100;
  const BASE_MAX_ITER = 88;
  const MIN_ITER = 52;
  const FRAME_INTERVAL_MS = 70;
  const PALETTE_SIZE = 1024;

  let width = 0;
  let height = 0;
  let pixels8;
  let pixels32;
  let imageData;
  let rafId = 0;
  let lastFrameMs = 0;
  let resizeTimer = 0;
  let iterLimit = BASE_MAX_ITER;

  // Keep a fixed render budget and scale by DPR in a controlled way.
  let effectiveTargetPixels = BASE_TARGET_PIXELS;

  const palette = new Uint32Array(PALETTE_SIZE);
  const interiorColor = packRGBA(8, 10, 18, 255);

  const rand = (min, max) => min + Math.random() * (max - min);

  // Fresh random seed on every reload.
  const seed = {
    baseCr: rand(-0.82, 0.82),
    baseCi: rand(-0.82, 0.82),
    ampCr: rand(0.04, 0.18),
    ampCi: rand(0.04, 0.18),
    freqCr: rand(0.08, 0.2),
    freqCi: rand(0.08, 0.2),
    phaseCr: rand(0, TAU),
    phaseCi: rand(0, TAU),
    zoomBase: rand(1.05, 1.9),
    zoomAmp: rand(0.04, 0.18),
    zoomFreq: rand(0.05, 0.12),
    zoomPhase: rand(0, TAU),
    panX: rand(-0.2, 0.2),
    panY: rand(-0.2, 0.2),
    panAmpX: rand(0.01, 0.05),
    panAmpY: rand(0.01, 0.05),
    panFreqX: rand(0.03, 0.08),
    panFreqY: rand(0.03, 0.08),
    panPhaseX: rand(0, TAU),
    panPhaseY: rand(0, TAU),
    paletteShift: rand(0, 1)
  };

  function packRGBA(r, g, b, a) {
    // Browser ImageData buffers are little-endian in all mainstream targets.
    return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  }

  function updatePalette(seconds) {
    const basePhase = seed.paletteShift + seconds * 0.02;

    for (let i = 0; i < PALETTE_SIZE; i += 1) {
      const value = i / (PALETTE_SIZE - 1);
      const phase = basePhase + value * 0.7;
      const r = Math.floor(18 + (0.5 + 0.5 * Math.cos(TAU * (phase + 0.0))) * 205);
      const g = Math.floor(16 + (0.5 + 0.5 * Math.cos(TAU * (phase + 0.2))) * 195);
      const b = Math.floor(28 + (0.5 + 0.5 * Math.cos(TAU * (phase + 0.38))) * 210);
      palette[i] = packRGBA(r, g, b, 255);
    }
  }

  function resize() {
    const viewportW = Math.max(window.innerWidth, 1);
    const viewportH = Math.max(window.innerHeight, 1);

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    effectiveTargetPixels = BASE_TARGET_PIXELS * (dpr > 1.25 ? 0.82 : 1);

    const scale = Math.min(1, Math.sqrt(effectiveTargetPixels / (viewportW * viewportH)));

    width = Math.max(MIN_WIDTH, Math.floor(viewportW * scale));
    height = Math.max(MIN_HEIGHT, Math.floor(viewportH * scale));

    canvas.width = width;
    canvas.height = height;
    canvas.style.width = `${viewportW}px`;
    canvas.style.height = `${viewportH}px`;

    imageData = ctx.createImageData(width, height);
    pixels8 = imageData.data;
    pixels32 = new Uint32Array(pixels8.buffer);
  }

  function tuneQuality(renderMs) {
    if (renderMs > 56 && iterLimit > MIN_ITER) {
      iterLimit = Math.max(MIN_ITER, iterLimit - 2);
    } else if (renderMs < 30 && iterLimit < BASE_MAX_ITER) {
      iterLimit = Math.min(BASE_MAX_ITER, iterLimit + 1);
    }
  }

  function render(seconds) {
    if (!pixels32 || !imageData) {
      return;
    }

    updatePalette(seconds);

    const cRe = seed.baseCr + seed.ampCr * Math.sin(seconds * seed.freqCr + seed.phaseCr);
    const cIm = seed.baseCi + seed.ampCi * Math.cos(seconds * seed.freqCi + seed.phaseCi);
    const zoom = seed.zoomBase + seed.zoomAmp * Math.sin(seconds * seed.zoomFreq + seed.zoomPhase);

    const centerX = seed.panX + seed.panAmpX * Math.sin(seconds * seed.panFreqX + seed.panPhaseX);
    const centerY = seed.panY + seed.panAmpY * Math.cos(seconds * seed.panFreqY + seed.panPhaseY);

    const xSpan = 3.2 / zoom;
    const ySpan = 2.4 / zoom;
    const xStep = xSpan / width;
    const yStep = ySpan / height;
    const xStart = centerX - xSpan * 0.5;
    const yStart = centerY - ySpan * 0.5;

    const paletteScale = (PALETTE_SIZE - 1) / iterLimit;

    let p = 0;

    for (let y = 0; y < height; y += 1) {
      const zy0 = yStart + y * yStep;
      let zx0 = xStart;

      for (let x = 0; x < width; x += 1) {
        let zx = zx0;
        let zy = zy0;
        zx0 += xStep;

        let zx2 = 0;
        let zy2 = 0;
        let iteration = 0;

        while (iteration < iterLimit) {
          zx2 = zx * zx;
          zy2 = zy * zy;
          if (zx2 + zy2 > 4.0) {
            break;
          }

          zy = 2.0 * zx * zy + cIm;
          zx = zx2 - zy2 + cRe;
          iteration += 1;
        }

        if (iteration === iterLimit) {
          pixels32[p] = interiorColor;
          p += 1;
          continue;
        }

        // Fast smooth-ish coloring that avoids expensive log(log(.)) calls.
        const magnitude = zx2 + zy2;
        const smooth = iteration + 1 - (4 / Math.max(magnitude, 4.000001));
        let paletteIndex = (smooth * paletteScale) | 0;

        if (paletteIndex < 0) {
          paletteIndex = 0;
        } else if (paletteIndex >= PALETTE_SIZE) {
          paletteIndex = PALETTE_SIZE - 1;
        }

        pixels32[p] = palette[paletteIndex];
        p += 1;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  function frame(nowMs) {
    if (nowMs - lastFrameMs >= FRAME_INTERVAL_MS) {
      const seconds = nowMs * 0.001;
      const started = performance.now();
      render(seconds);
      tuneQuality(performance.now() - started);
      lastFrameMs = nowMs;
    }

    rafId = window.requestAnimationFrame(frame);
  }

  function onResize() {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      resize();
      render(performance.now() * 0.001);
    }, 80);
  }

  function onVisibilityChange() {
    if (document.hidden) {
      window.cancelAnimationFrame(rafId);
      rafId = 0;
      return;
    }

    if (!rafId) {
      lastFrameMs = 0;
      rafId = window.requestAnimationFrame(frame);
    }
  }

  resize();
  render(performance.now() * 0.001);
  rafId = window.requestAnimationFrame(frame);

  window.addEventListener("resize", onResize);
  document.addEventListener("visibilitychange", onVisibilityChange);
})();
