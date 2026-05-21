function clamp(value, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

function workAreaForDisplay(display) {
  return display?.workArea || display?.bounds || null;
}

function virtualWorkAreaBounds(displays = []) {
  const areas = displays
    .map(workAreaForDisplay)
    .filter((area) => (
      area
      && Number.isFinite(area.x)
      && Number.isFinite(area.y)
      && Number.isFinite(area.width)
      && Number.isFinite(area.height)
      && area.width > 0
      && area.height > 0
    ));

  if (areas.length === 0) return null;

  const left = Math.min(...areas.map((area) => area.x));
  const top = Math.min(...areas.map((area) => area.y));
  const right = Math.max(...areas.map((area) => area.x + area.width));
  const bottom = Math.max(...areas.map((area) => area.y + area.height));
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top
  };
}

function clampWindowPosition(bounds, area) {
  if (!bounds || !area) return null;
  const maxX = area.x + area.width - bounds.width;
  const maxY = area.y + area.height - bounds.height;
  return {
    x: Math.round(clamp(bounds.x, area.x, maxX)),
    y: Math.round(clamp(bounds.y, area.y, maxY))
  };
}

function clampWindowBounds(bounds, area) {
  if (!bounds || !area) return null;
  const width = Math.round(Math.min(bounds.width, area.width));
  const height = Math.round(Math.min(bounds.height, area.height));
  const position = clampWindowPosition({ ...bounds, width, height }, area);
  if (!position) return null;
  return {
    ...position,
    width,
    height
  };
}

module.exports = {
  clampWindowBounds,
  clampWindowPosition,
  virtualWorkAreaBounds
};
