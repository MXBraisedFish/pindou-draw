import { state } from './state.js';

export function computeHighlightRegions(selectedColors) {
  if (!selectedColors || selectedColors.size === 0) return [];
  if (!state.width || !state.height) return [];

  const visited = new Set();
  const regions = [];

  for (let y = 0; y < state.height; y += 1) {
    for (let x = 0; x < state.width; x += 1) {
      const cell = state.grid[y]?.[x];
      if (!cell || !selectedColors.has(cell.code)) continue;

      const key = `${x},${y}`;
      if (visited.has(key)) continue;

      const region = floodFillRegion(x, y, selectedColors, visited);
      if (region.length > 0) {
        regions.push(region);
      }
    }
  }

  return regions;
}

export function drawHighlightRegionOutline(ctx, region, originX, originY, cellSize) {
  if (!ctx || !Array.isArray(region) || region.length === 0) return;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  region.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  const width = maxX - minX + 1;
  const height = maxY - minY + 1;
  const mask = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => false)
  );

  region.forEach(([x, y]) => {
    mask[y - minY][x - minX] = true;
  });

  ctx.beginPath();
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      if (!mask[y - minY][x - minX]) continue;

      const pixelX = originX + x * cellSize;
      const pixelY = originY + y * cellSize;
      const hasLeft = x > minX && mask[y - minY][x - minX - 1];
      const hasRight = x < maxX && mask[y - minY][x - minX + 1];
      const hasTop = y > minY && mask[y - minY - 1][x - minX];
      const hasBottom = y < maxY && mask[y - minY + 1][x - minX];

      if (!hasTop) {
        ctx.moveTo(pixelX, pixelY);
        ctx.lineTo(pixelX + cellSize, pixelY);
      }
      if (!hasBottom) {
        ctx.moveTo(pixelX, pixelY + cellSize);
        ctx.lineTo(pixelX + cellSize, pixelY + cellSize);
      }
      if (!hasLeft) {
        ctx.moveTo(pixelX, pixelY);
        ctx.lineTo(pixelX, pixelY + cellSize);
      }
      if (!hasRight) {
        ctx.moveTo(pixelX + cellSize, pixelY);
        ctx.lineTo(pixelX + cellSize, pixelY + cellSize);
      }
    }
  }

  ctx.stroke();
}

function floodFillRegion(startX, startY, selectedColors, visited) {
  const region = [];
  const queue = [[startX, startY]];
  const targetCode = state.grid[startY][startX]?.code;

  while (queue.length > 0) {
    const [x, y] = queue.shift();
    const key = `${x},${y}`;
    if (visited.has(key)) continue;

    const cell = state.grid[y]?.[x];
    if (!cell || cell.code !== targetCode || !selectedColors.has(cell.code)) continue;

    visited.add(key);
    region.push([x, y]);

    const neighbors = [
      [x + 1, y],
      [x - 1, y],
      [x, y + 1],
      [x, y - 1]
    ];

    neighbors.forEach(([nx, ny]) => {
      if (nx < 0 || ny < 0 || nx >= state.width || ny >= state.height) return;
      const neighborKey = `${nx},${ny}`;
      if (!visited.has(neighborKey)) queue.push([nx, ny]);
    });
  }

  return region;
}
