import { crc32, deflateSync } from "node:zlib";

/**
 * Demo photos for the demo-data loader: small PNG illustrations of the appliances (drawn in code, no stock photos),
 * in a few colour variants and with an optional toolbox, so the job pages and photo grids do not look empty.
 */
const W = 640;
const H = 480;
type Color = [number, number, number];

class Canvas {
  readonly data = new Uint8Array(W * H * 4);
  fillRect(x: number, y: number, w: number, h: number, c: Color) {
    for (let j = Math.max(0, Math.round(y)); j < Math.min(H, Math.round(y + h)); j += 1) {
      for (let i = Math.max(0, Math.round(x)); i < Math.min(W, Math.round(x + w)); i += 1) this.px(i, j, c);
    }
  }
  roundRect(x: number, y: number, w: number, h: number, r: number, c: Color) {
    for (let j = Math.max(0, Math.round(y)); j < Math.min(H, Math.round(y + h)); j += 1) {
      for (let i = Math.max(0, Math.round(x)); i < Math.min(W, Math.round(x + w)); i += 1) {
        const dx = Math.max(x + r - i, 0, i - (x + w - r));
        const dy = Math.max(y + r - j, 0, j - (y + h - r));
        if (dx * dx + dy * dy <= r * r) this.px(i, j, c);
      }
    }
  }
  circle(cx: number, cy: number, r: number, c: Color) {
    for (let j = Math.max(0, Math.floor(cy - r)); j <= Math.min(H - 1, Math.ceil(cy + r)); j += 1) {
      for (let i = Math.max(0, Math.floor(cx - r)); i <= Math.min(W - 1, Math.ceil(cx + r)); i += 1) {
        if ((i - cx) ** 2 + (j - cy) ** 2 <= r * r) this.px(i, j, c);
      }
    }
  }
  gradient(top: Color, bottom: Color) {
    for (let j = 0; j < H; j += 1) {
      const t = j / (H - 1);
      const c: Color = [0, 1, 2].map((k) => Math.round(top[k] + (bottom[k] - top[k]) * t)) as Color;
      for (let i = 0; i < W; i += 1) this.px(i, j, c);
    }
  }
  px(i: number, j: number, c: Color) {
    const o = (j * W + i) * 4;
    this.data[o] = c[0];
    this.data[o + 1] = c[1];
    this.data[o + 2] = c[2];
    this.data[o + 3] = 255;
  }
  png(): Buffer {
    const raw = Buffer.alloc((W * 4 + 1) * H);
    for (let j = 0; j < H; j += 1) {
      raw[j * (W * 4 + 1)] = 0;
      Buffer.from(this.data.buffer, j * W * 4, W * 4).copy(raw, j * (W * 4 + 1) + 1);
    }
    const chunk = (type: string, body: Buffer) => {
      const head = Buffer.alloc(4);
      head.writeUInt32BE(body.length);
      const tail = Buffer.alloc(4);
      tail.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type), body])) >>> 0);
      return Buffer.concat([head, Buffer.from(type), body, tail]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(W, 0);
    ihdr.writeUInt32BE(H, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
  }
}

const WALLS: Color[][] = [
  [[238, 232, 222], [214, 205, 190]],
  [[226, 234, 240], [196, 208, 220]],
  [[240, 236, 228], [222, 214, 200]],
  [[232, 226, 238], [206, 198, 218]],
];
const BODIES: Color[] = [[246, 246, 248], [208, 212, 220], [58, 62, 74], [186, 190, 198], [240, 232, 220]];
const darker = (c: Color, k: number): Color => [Math.round(c[0] * k), Math.round(c[1] * k), Math.round(c[2] * k)];

function scene(kind: "fridge" | "ac" | "tv" | "washer", variant: number, toolbox: boolean) {
  const cv = new Canvas();
  const wall = WALLS[variant % WALLS.length];
  cv.gradient(wall[0], wall[1]);
  cv.fillRect(0, 392, W, 88, [166, 150, 128]); // floor
  cv.fillRect(0, 386, W, 8, [128, 114, 96]); // skirting
  const body = BODIES[variant % BODIES.length];
  const edge = darker(body, 0.78);
  const shade = darker(body, 0.9);
  if (kind === "fridge") {
    cv.roundRect(232, 40, 190, 352, 14, [120, 110, 98]); // shadow
    cv.roundRect(226, 30, 188, 356, 14, edge);
    cv.roundRect(232, 36, 176, 344, 10, body);
    cv.fillRect(232, 150, 176, 6, edge); // freezer / fridge split
    cv.roundRect(244, 84, 8, 54, 4, edge); // handles
    cv.roundRect(244, 190, 8, 96, 4, edge);
    cv.circle(330, 64, 6, [90, 200, 120]); // status light
  } else if (kind === "ac") {
    cv.roundRect(110, 80, 420, 110, 18, [150, 150, 156]); // shadow
    cv.roundRect(104, 70, 428, 112, 18, edge);
    cv.roundRect(110, 76, 416, 100, 14, body);
    cv.fillRect(124, 146, 388, 8, shade); // vent slot
    for (let i = 0; i < 12; i += 1) cv.fillRect(130 + i * 31, 156, 22, 3, edge);
    cv.circle(482, 100, 5, [90, 200, 120]);
    cv.fillRect(150, 100, 90, 12, shade);
  } else if (kind === "tv") {
    cv.fillRect(150, 70, 340, 210, [28, 30, 36]); // frame
    const hue: Color = [[40, 90, 170], [150, 60, 130], [30, 130, 120], [190, 110, 40]][variant % 4] as Color;
    cv.fillRect(160, 80, 320, 190, hue);
    cv.circle(260, 160, 34, darker(hue, 1.4));
    cv.fillRect(300, 150, 150, 14, darker(hue, 1.3));
    cv.fillRect(300, 176, 110, 10, darker(hue, 1.2));
    cv.fillRect(300, 280, 40, 70, [60, 62, 70]); // stand
    cv.roundRect(250, 340, 140, 14, 6, [70, 72, 80]);
  } else {
    cv.roundRect(206, 80, 244, 310, 14, [130, 120, 108]); // shadow
    cv.roundRect(200, 70, 244, 312, 14, edge);
    cv.roundRect(206, 76, 232, 300, 10, body);
    cv.fillRect(206, 120, 232, 5, edge);
    cv.circle(222, 98, 6, [90, 200, 120]);
    cv.circle(260, 98, 6, edge);
    cv.circle(322, 252, 86, edge); // door ring
    cv.circle(322, 252, 74, [60, 80, 100]); // glass
    cv.circle(322, 252, 56, [84, 112, 140]);
    cv.circle(300, 232, 14, [150, 180, 205]);
  }
  if (toolbox) {
    cv.roundRect(470, 340, 130, 62, 8, [188, 52, 40]);
    cv.roundRect(486, 326, 98, 22, 8, [150, 40, 32]);
    cv.fillRect(520, 362, 30, 8, [230, 200, 80]);
  }
  return cv.png();
}

const cache = new Map<string, Buffer>();

/** A demo photo for a product category; deterministic per (category, variant). */
export function demoImage(category: string, variant: number, toolbox: boolean): Buffer {
  const c = category.toLowerCase();
  const kind = /refrig|fridge|sovut/.test(c) ? "fridge" : /air|cond|konditsioner|ac\b/.test(c) ? "ac" : /tv|televis/.test(c) ? "tv" : "washer";
  const key = `${kind}-${variant % 8}-${toolbox}`;
  let image = cache.get(key);
  if (!image) {
    image = scene(kind, variant, toolbox);
    cache.set(key, image);
  }
  return image;
}
