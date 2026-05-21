const test = require('node:test');
const assert = require('node:assert/strict');
const { clampWindowPosition, virtualWorkArea } = require('../src/window-bounds');

test('virtualWorkArea spans displays on either side of the primary display', () => {
  const area = virtualWorkArea([
    { workArea: { x: 0, y: 0, width: 1440, height: 900 } },
    { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } },
    { workArea: { x: -1280, y: 120, width: 1280, height: 800 } }
  ]);

  assert.deepEqual(area, {
    x: -1280,
    y: 0,
    width: 4640,
    height: 1080
  });
});

test('clampWindowPosition lets a pet window move onto an external display', () => {
  const area = virtualWorkArea([
    { workArea: { x: 0, y: 0, width: 1440, height: 900 } },
    { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } }
  ]);

  const position = clampWindowPosition({
    x: 1500,
    y: 40,
    width: 430,
    height: 292
  }, area);

  assert.deepEqual(position, { x: 1500, y: 40 });
});

test('clampWindowPosition still prevents losing the pet beyond all displays', () => {
  const area = virtualWorkArea([
    { workArea: { x: 0, y: 0, width: 1440, height: 900 } },
    { workArea: { x: 1440, y: 0, width: 1920, height: 1080 } }
  ]);

  const position = clampWindowPosition({
    x: 5000,
    y: 2000,
    width: 430,
    height: 292
  }, area);

  assert.deepEqual(position, { x: 2930, y: 788 });
});
