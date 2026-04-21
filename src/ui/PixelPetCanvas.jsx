import { useEffect, useRef } from "react";
import {
  getPixelPetAnimation,
  getPixelPetBitmap,
  getPixelPetPalette,
  getPixelPetRenderParts,
  PIXEL_PET_CANVAS_HEIGHT,
  PIXEL_PET_CANVAS_WIDTH,
  PIXEL_PET_DISPLAY_HEIGHT,
  PIXEL_PET_DISPLAY_WIDTH
} from "./pixel-pet-data";

function stampBitmap(grid, bitmap, offsetX, offsetY) {
  for (let y = 0; y < bitmap.length; y += 1) {
    const row = bitmap[y];

    for (let x = 0; x < row.length; x += 1) {
      const token = row[x];
      if (!token || token === ".") {
        continue;
      }

      const targetX = offsetX + x;
      const targetY = offsetY + y;

      if (
        targetX < 0
        || targetY < 0
        || targetX >= PIXEL_PET_CANVAS_WIDTH
        || targetY >= PIXEL_PET_CANVAS_HEIGHT
      ) {
        continue;
      }

      grid[targetY][targetX] = token;
    }
  }
}

function createGrid() {
  return Array.from(
    { length: PIXEL_PET_CANVAS_HEIGHT },
    () => Array.from({ length: PIXEL_PET_CANVAS_WIDTH }, () => null)
  );
}

function buildFrameGrid(presetId, motionModule, animationName, frameIndex) {
  const palette = getPixelPetPalette(presetId);
  const frames = getPixelPetAnimation(motionModule, animationName);
  const frame = frames[frameIndex] || frames[0];
  const grid = createGrid();

  for (const part of getPixelPetRenderParts()) {
    if (part.onlyWhen && part.onlyWhen !== animationName) {
      continue;
    }

    const offset = frame.parts[part.id] || {};
    const bitmap = getPixelPetBitmap(
      part.feature || part.asset,
      part.feature === "eyes" ? frame.eyes : part.feature === "mouth" ? frame.mouth : undefined
    );

    stampBitmap(
      grid,
      bitmap,
      part.x + frame.rootX + (offset.x || 0),
      part.y + frame.rootY + (offset.y || 0)
    );
  }

  return {
    frame,
    grid,
    palette
  };
}

function drawFrame(ctx, presetId, motionModule, animationName, frameIndex) {
  const { frame, grid, palette } = buildFrameGrid(presetId, motionModule, animationName, frameIndex);

  ctx.clearRect(0, 0, PIXEL_PET_CANVAS_WIDTH, PIXEL_PET_CANVAS_HEIGHT);

  if (frame.glow > 0) {
    ctx.save();
    ctx.globalAlpha = frame.glow;
    ctx.fillStyle = palette.D;
    ctx.fillRect(6, 6, 20, 28);
    ctx.restore();
  }

  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];

    for (let x = 0; x < row.length; x += 1) {
      const token = row[x];
      if (!token) {
        continue;
      }

      ctx.fillStyle = palette[token] || palette.o;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

export default function PixelPetCanvas({
  presetId,
  motionModule,
  state,
  animationCycle
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return undefined;
    }

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) {
      return undefined;
    }

    context.imageSmoothingEnabled = false;

    const animationName = state === "click"
      ? "click"
      : state === "reply"
        ? "reply"
        : "idle";
    const frames = getPixelPetAnimation(motionModule, animationName);

    let frameIndex = 0;
    let frameStartedAt = performance.now();
    let rafId = 0;

    const paint = (timestamp) => {
      const currentFrame = frames[frameIndex] || frames[0];
      if (timestamp - frameStartedAt >= currentFrame.duration) {
        frameStartedAt = timestamp;
        frameIndex = (frameIndex + 1) % frames.length;
      }

      drawFrame(context, presetId, motionModule, animationName, frameIndex);
      rafId = window.requestAnimationFrame(paint);
    };

    drawFrame(context, presetId, motionModule, animationName, 0);
    rafId = window.requestAnimationFrame(paint);

    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [animationCycle, motionModule, presetId, state]);

  return (
    <div className="pixel-frame-shell">
      <canvas
        ref={canvasRef}
        className="pixel-frame-canvas"
        width={PIXEL_PET_CANVAS_WIDTH}
        height={PIXEL_PET_CANVAS_HEIGHT}
        aria-hidden="true"
        style={{
          width: `${PIXEL_PET_DISPLAY_WIDTH}px`,
          height: `${PIXEL_PET_DISPLAY_HEIGHT}px`
        }}
      />
    </div>
  );
}
