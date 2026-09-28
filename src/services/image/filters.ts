/** Pure pixel filters on RGBA ImageData buffers (no canvas `filter`, which Safari lacks). */

export function grayscale(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    // Rec. 709 luma
    const y = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = y;
  }
}

/** Separable box blur; three passes approximate a Gaussian. */
export function boxBlur(src: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const r = Math.max(1, Math.round(radius / 2));
  const a = new Uint8ClampedArray(src);
  const b = new Uint8ClampedArray(src.length);
  for (let pass = 0; pass < 3; pass++) {
    blurLine(a, b, width, height, r, true);
    blurLine(b, a, width, height, r, false);
  }
  return a;
}

function blurLine(src: Uint8ClampedArray, dst: Uint8ClampedArray, w: number, h: number, r: number, horizontal: boolean): void {
  const outer = horizontal ? h : w;
  const inner = horizontal ? w : h;
  const window = r * 2 + 1;
  for (let o = 0; o < outer; o++) {
    const idx = (i: number) => {
      const c = Math.min(inner - 1, Math.max(0, i));
      return horizontal ? (o * w + c) * 4 : (c * w + o) * 4;
    };
    let sr = 0, sg = 0, sb = 0, sa = 0;
    for (let i = -r; i <= r; i++) {
      const p = idx(i);
      sr += src[p]; sg += src[p + 1]; sb += src[p + 2]; sa += src[p + 3];
    }
    for (let i = 0; i < inner; i++) {
      const d = idx(i);
      dst[d] = sr / window; dst[d + 1] = sg / window; dst[d + 2] = sb / window; dst[d + 3] = sa / window;
      const add = idx(i + r + 1);
      const sub = idx(i - r);
      sr += src[add] - src[sub]; sg += src[add + 1] - src[sub + 1]; sb += src[add + 2] - src[sub + 2]; sa += src[add + 3] - src[sub + 3];
    }
  }
}

/** Unsharp mask: original + amount × (original − blurred). */
export function sharpen(data: Uint8ClampedArray, width: number, height: number, amount: number): void {
  const blurred = boxBlur(data, width, height, 2);
  const k = amount * 1.5;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = data[i] + k * (data[i] - blurred[i]);
    data[i + 1] = data[i + 1] + k * (data[i + 1] - blurred[i + 1]);
    data[i + 2] = data[i + 2] + k * (data[i + 2] - blurred[i + 2]);
  }
}
