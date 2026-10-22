/**
 * MakeIcons.mjs — generates the extension icon set with zero native deps.
 *
 * Chrome wants PNGs at 16/32/48/128. Two sources are supported, in order:
 *
 *   1. `public/icon-source.png` — the real artwork. It is decoded here (PNG
 *      parser + unfilter + premultiplied-alpha resampler), cropped to its
 *      opaque bounding box so the glyph fills the frame at every size, then
 *      area-averaged down to each target.
 *   2. The analytic owl drawn below — only used when no source file exists, so
 *      `npm run icons` never breaks on a fresh checkout.
 *
 * Everything is hand-rolled (zlib is built into Node) because the project
 * deliberately ships without sharp/canvas/PIL.
 */
import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const OUT = join(ROOT, 'public', 'icons');
const SOURCE = join(ROOT, 'public', 'icon-source.png');
const SIZES = [16, 32, 48, 128];
/** Transparent margin around the artwork, as a fraction of its longest side. */
const MARGIN = 0.04;

/* ------------------------------------------------------------------ *
 * PNG decoding
 * ------------------------------------------------------------------ */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function readChunks(buffer) {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('Not a PNG file.');
  const chunks = [];
  let offset = 8;
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

/** Decode a non-interlaced 8-bit PNG into straight RGBA. */
function decodePng(buffer) {
  const chunks = readChunks(buffer);
  const ihdr = chunks.find((chunk) => chunk.type === 'IHDR');
  if (!ihdr) throw new Error('PNG has no IHDR.');

  const width = ihdr.data.readUInt32BE(0);
  const height = ihdr.data.readUInt32BE(4);
  const bitDepth = ihdr.data[8];
  const colorType = ihdr.data[9];
  const interlace = ihdr.data[12];

  if (bitDepth !== 8) throw new Error(`Unsupported PNG bit depth: ${bitDepth}`);
  if (interlace !== 0) throw new Error('Interlaced PNGs are not supported.');

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`Unsupported PNG color type: ${colorType}`);

  // Palette images carry their colours in PLTE — expand them up front.
  const palette = colorType === 3 ? chunks.find((chunk) => chunk.type === 'PLTE')?.data : null;
  const trns = colorType === 3 ? chunks.find((chunk) => chunk.type === 'tRNS')?.data : null;
  const channelsPerPixel = colorType === 3 ? 1 : channels;

  const raw = inflateSync(Buffer.concat(chunks.filter((chunk) => chunk.type === 'IDAT').map((chunk) => chunk.data)));
  const stride = width * channelsPerPixel;
  const flat = Buffer.alloc(stride * height);

  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const value = raw[rowStart + x];
      const left = x >= channelsPerPixel ? flat[y * stride + x - channelsPerPixel] : 0;
      const up = y > 0 ? flat[(y - 1) * stride + x] : 0;
      const upLeft = x >= channelsPerPixel && y > 0 ? flat[(y - 1) * stride + x - channelsPerPixel] : 0;
      let out;
      switch (filter) {
        case 0:
          out = value;
          break;
        case 1:
          out = value + left;
          break;
        case 2:
          out = value + up;
          break;
        case 3:
          out = value + ((left + up) >> 1);
          break;
        case 4:
          out = value + paeth(left, up, upLeft);
          break;
        default:
          throw new Error(`Unknown PNG filter type: ${filter}`);
      }
      flat[y * stride + x] = out & 0xff;
    }
  }

  const rgba = Buffer.alloc(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const src = index * channelsPerPixel;
    const dst = index * 4;

    if (colorType === 3 && palette) {
      const entry = flat[src];
      rgba[dst] = palette[entry * 3] ?? 0;
      rgba[dst + 1] = palette[entry * 3 + 1] ?? 0;
      rgba[dst + 2] = palette[entry * 3 + 2] ?? 0;
      rgba[dst + 3] = trns && entry < trns.length ? trns[entry] : 255;
      continue;
    }

    if (colorType === 6) {
      rgba[dst] = flat[src];
      rgba[dst + 1] = flat[src + 1];
      rgba[dst + 2] = flat[src + 2];
      rgba[dst + 3] = flat[src + 3];
    } else if (colorType === 2) {
      rgba[dst] = flat[src];
      rgba[dst + 1] = flat[src + 1];
      rgba[dst + 2] = flat[src + 2];
      rgba[dst + 3] = 255;
    } else if (colorType === 4) {
      rgba[dst] = flat[src];
      rgba[dst + 1] = flat[src];
      rgba[dst + 2] = flat[src];
      rgba[dst + 3] = flat[src + 1];
    } else {
      rgba[dst] = flat[src];
      rgba[dst + 1] = flat[src];
      rgba[dst + 2] = flat[src];
      rgba[dst + 3] = 255;
    }
  }

  return { width, height, rgba };
}

/* ------------------------------------------------------------------ *
 * Resampling
 * ------------------------------------------------------------------ */

/** Bounding box of everything with meaningful alpha. */
function contentBounds({ width, height, rgba }) {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (rgba[(y * width + x) * 4 + 3] <= 8) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  if (maxX < minX) return { x: 0, y: 0, width, height };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

/**
 * Square crop centred on the artwork, padded by `MARGIN`.
 * Keeping it square is what stops the glyph from stretching at 16×16.
 */
function squareCrop(bounds, canvas) {
  const side = Math.max(bounds.width, bounds.height) * (1 + MARGIN * 2);
  const cx = bounds.x + bounds.width / 2;
  const cy = bounds.y + bounds.height / 2;
  const x = Math.max(0, Math.min(canvas.width - side, cx - side / 2));
  const y = Math.max(0, Math.min(canvas.height - side, cy - side / 2));
  return { x, y, side };
}

/** Premultiply once so bilinear filtering never bleeds black into edges. */
function premultiply({ width, height, rgba }) {
  const out = new Float32Array(width * height * 4);
  for (let index = 0; index < width * height; index += 1) {
    const alpha = rgba[index * 4 + 3] / 255;
    out[index * 4] = rgba[index * 4] * alpha;
    out[index * 4 + 1] = rgba[index * 4 + 1] * alpha;
    out[index * 4 + 2] = rgba[index * 4 + 2] * alpha;
    out[index * 4 + 3] = rgba[index * 4 + 3];
  }
  return out;
}

function bilinear(px, width, height, u, v, channel) {
  const x = Math.min(width - 1, Math.max(0, u - 0.5));
  const y = Math.min(height - 1, Math.max(0, v - 0.5));
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = x - x0;
  const fy = y - y0;

  const a = px[(y0 * width + x0) * 4 + channel];
  const b = px[(y0 * width + x1) * 4 + channel];
  const c = px[(y1 * width + x0) * 4 + channel];
  const d = px[(y1 * width + x1) * 4 + channel];

  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

/**
 * Area-average the crop down to `size`, by supersampling each destination
 * pixel. Supersampling (instead of a fixed integer box) is what keeps 16×16
 * and 48×48 equally clean when the crop is not a power-of-two multiple.
 */
function resample(image, crop, size, samples = 6) {
  const px = premultiply(image);
  const out = Buffer.alloc(size * size * 4);
  const step = 1 / samples;

  for (let ty = 0; ty < size; ty += 1) {
    for (let tx = 0; tx < size; tx += 1) {
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;

      for (let sy = 0; sy < samples; sy += 1) {
        const v = crop.y + ((ty + (sy + 0.5) * step) / size) * crop.side;
        for (let sx = 0; sx < samples; sx += 1) {
          const u = crop.x + ((tx + (sx + 0.5) * step) / size) * crop.side;
          r += bilinear(px, image.width, image.height, u, v, 0);
          g += bilinear(px, image.width, image.height, u, v, 1);
          b += bilinear(px, image.width, image.height, u, v, 2);
          a += bilinear(px, image.width, image.height, u, v, 3);
        }
      }

      const total = samples * samples;
      const alpha = a / total;
      const dst = (ty * size + tx) * 4;
      const scale = alpha > 0 ? 255 / alpha : 0;

      out[dst] = Math.max(0, Math.min(255, Math.round((r / total) * scale)));
      out[dst + 1] = Math.max(0, Math.min(255, Math.round((g / total) * scale)));
      out[dst + 2] = Math.max(0, Math.min(255, Math.round((b / total) * scale)));
      out[dst + 3] = Math.max(0, Math.min(255, Math.round(alpha)));
    }
  }

  return out;
}

/* ------------------------------------------------------------------ *
 * PNG encoding
 * ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (const byte of buffer) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(size, rgba) {
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/* ------------------------------------------------------------------ *
 * Fallback artwork (used only when public/icon-source.png is absent)
 * ------------------------------------------------------------------ */

const SIZE = 512;
const BRAND = {
  featherGreen: [0x58, 0xcc, 0x02],
  maskGreen: [0x58, 0xa7, 0x00],
  snow: [0xff, 0xff, 0xff],
  fox: [0xff, 0x96, 0x00],
  night: [0x13, 0x1f, 0x24],
};

function drawFallbackOwl() {
  const canvas = new Uint8Array(SIZE * SIZE * 4);

  const put = (x, y, [r, g, b]) => {
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) return;
    const i = (y * SIZE + x) * 4;
    canvas[i] = r;
    canvas[i + 1] = g;
    canvas[i + 2] = b;
    canvas[i + 3] = 255;
  };

  const roundedRect = (x0, y0, w, h, radius, color) => {
    const x1 = x0 + w;
    const y1 = y0 + h;
    for (let y = Math.floor(y0); y < Math.ceil(y1); y += 1) {
      for (let x = Math.floor(x0); x < Math.ceil(x1); x += 1) {
        const dx = Math.max(x0 + radius - x, 0, x - (x1 - radius));
        const dy = Math.max(y0 + radius - y, 0, y - (y1 - radius));
        if (dx * dx + dy * dy <= radius * radius) put(x, y, color);
      }
    }
  };

  const ellipse = (cx, cy, rx, ry, color) => {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1) put(x, y, color);
      }
    }
  };

  const circle = (cx, cy, r, color) => ellipse(cx, cy, r, r, color);

  const triangle = (a, b, c, color) => {
    const sign = (p, q, r) => (p[0] - r[0]) * (q[1] - r[1]) - (q[0] - r[0]) * (p[1] - r[1]);
    for (let y = Math.floor(Math.min(a[1], b[1], c[1])); y <= Math.ceil(Math.max(a[1], b[1], c[1])); y += 1) {
      for (let x = Math.floor(Math.min(a[0], b[0], c[0])); x <= Math.ceil(Math.max(a[0], b[0], c[0])); x += 1) {
        const p = [x, y];
        const d1 = sign(p, a, b);
        const d2 = sign(p, b, c);
        const d3 = sign(p, c, a);
        const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
        const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
        if (!(hasNeg && hasPos)) put(x, y, color);
      }
    }
  };

  roundedRect(0, 0, SIZE, SIZE, 112, BRAND.featherGreen);
  roundedRect(24, 24, SIZE - 48, SIZE - 48, 92, BRAND.maskGreen);
  roundedRect(30, 26, SIZE - 60, SIZE - 60, 88, BRAND.featherGreen);

  triangle([128, 128], [206, 96], [196, 200], BRAND.snow);
  triangle([384, 128], [306, 96], [316, 200], BRAND.snow);

  roundedRect(112, 104, 288, 300, 140, BRAND.snow);

  circle(200, 232, 74, BRAND.featherGreen);
  circle(312, 232, 74, BRAND.featherGreen);
  circle(200, 232, 60, BRAND.snow);
  circle(312, 232, 60, BRAND.snow);
  circle(206, 242, 32, BRAND.night);
  circle(306, 242, 32, BRAND.night);
  circle(194, 228, 11, BRAND.snow);
  circle(294, 228, 11, BRAND.snow);

  triangle([256, 276], [214, 320], [298, 320], BRAND.fox);
  triangle([256, 348], [222, 314], [290, 314], BRAND.fox);

  return { width: SIZE, height: SIZE, rgba: Buffer.from(canvas) };
}

/* ------------------------------------------------------------------ *
 * Entry
 * ------------------------------------------------------------------ */

const usingSource = existsSync(SOURCE);
const image = usingSource ? decodePng(readFileSync(SOURCE)) : drawFallbackOwl();
const crop = usingSource ? squareCrop(contentBounds(image), image) : { x: 0, y: 0, side: image.width };

mkdirSync(OUT, { recursive: true });
console.log(`[icons] source: ${usingSource ? 'public/icon-source.png' : 'built-in fallback owl'} (${image.width}×${image.height})`);

for (const size of SIZES) {
  const png = encodePng(size, resample(image, crop, size));
  writeFileSync(join(OUT, `icon${size}.png`), png);
  console.log(`[icons] icon${size}.png — ${(png.length / 1024).toFixed(1)} kB`);
}
