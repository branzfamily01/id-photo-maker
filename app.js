const editor = document.getElementById('editor');
const ctx = editor.getContext('2d', { willReadFrequently: true });
const sheet = document.getElementById('sheet');
const sctx = sheet.getContext('2d');
const empty = document.getElementById('emptyState');

const zoom = document.getElementById('zoom');
const panX = document.getElementById('panX');
const panY = document.getElementById('panY');
const brightness = document.getElementById('brightness');
const bgTolerance = document.getElementById('bgTolerance');

let img = null;
let rotation = 0;
let photoW = 30;
let photoH = 40;
let bgMode = 'white';

function readFile(file) {
  if (!file) return;
  const r = new FileReader();
  r.onload = e => {
    const i = new Image();
    i.onload = () => {
      img = i;
      rotation = 0;
      resetControls();
      empty.style.display = 'none';
      drawEditor();
    };
    i.src = e.target.result;
  };
  r.readAsDataURL(file);
}

document.getElementById('cameraInput').addEventListener('change', e => readFile(e.target.files[0]));
document.getElementById('fileInput').addEventListener('change', e => readFile(e.target.files[0]));

function resetControls() {
  zoom.value = 1;
  panX.value = 0;
  panY.value = 0;
  brightness.value = 100;
  bgTolerance.value = 38;
}

[zoom, panX, panY, brightness, bgTolerance].forEach(el => el.addEventListener('input', drawEditor));
document.getElementById('rotateBtn').onclick = () => { rotation = (rotation + 90) % 360; drawEditor(); };
document.getElementById('resetBtn').onclick = () => { rotation = 0; resetControls(); drawEditor(); };

document.querySelectorAll('#bgPresetButtons button').forEach(btn => {
  btn.addEventListener('click', () => {
    bgMode = btn.dataset.bg;
    document.querySelectorAll('#bgPresetButtons button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    drawEditor();
  });
});

function composeCanvas(targetW, targetH, includeBg = true) {
  const c = document.createElement('canvas');
  c.width = targetW;
  c.height = targetH;
  const cctx = c.getContext('2d', { willReadFrequently: true });

  if (includeBg) {
    cctx.fillStyle = '#ffffff';
    cctx.fillRect(0, 0, targetW, targetH);
  } else {
    cctx.clearRect(0, 0, targetW, targetH);
  }

  if (!img) return c;

  const swap = rotation % 180 !== 0;
  const iw = swap ? img.height : img.width;
  const ih = swap ? img.width : img.height;
  const base = Math.max(targetW / iw, targetH / ih);
  const scale = base * parseFloat(zoom.value);
  const dw = img.width * scale;
  const dh = img.height * scale;

  const px = Number(panX.value) * (targetW / editor.width);
  const py = Number(panY.value) * (targetH / editor.height);

  cctx.save();
  cctx.filter = `brightness(${brightness.value}%)`;
  cctx.translate(targetW / 2 + px, targetH / 2 + py);
  cctx.rotate(rotation * Math.PI / 180);
  cctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
  cctx.restore();
  return c;
}

function getBgColor(mode) {
  if (mode === 'blue') return [206, 226, 255];
  if (mode === 'gray') return [242, 244, 247];
  return [255, 255, 255];
}

function averageBackgroundColor(data, width, height) {
  const band = Math.max(6, Math.round(Math.min(width, height) * 0.015));
  let r = 0, g = 0, b = 0, count = 0;
  const read = (x, y) => {
    const idx = (y * width + x) * 4;
    if (data[idx + 3] < 8) return;
    r += data[idx];
    g += data[idx + 1];
    b += data[idx + 2];
    count++;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < band; x++) read(x, y);
    for (let x = width - band; x < width; x++) read(x, y);
  }
  for (let x = band; x < width - band; x++) {
    for (let y = 0; y < band; y++) read(x, y);
    for (let y = height - band; y < height; y++) read(x, y);
  }

  if (!count) return [245, 245, 245];
  return [r / count, g / count, b / count];
}

function colorDistanceSq(data, idx, bg) {
  const dr = data[idx] - bg[0];
  const dg = data[idx + 1] - bg[1];
  const db = data[idx + 2] - bg[2];
  return dr * dr + dg * dg + db * db;
}

function buildBackgroundMask(imageData, tolerance) {
  const { data, width, height } = imageData;
  const bg = averageBackgroundColor(data, width, height);
  const threshold = tolerance * tolerance;
  const mask = new Uint8Array(width * height);
  const queue = new Uint32Array(width * height);
  let qh = 0, qt = 0;

  function maybePush(x, y) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (mask[p]) return;
    const idx = p * 4;
    if (data[idx + 3] < 8 || colorDistanceSq(data, idx, bg) <= threshold) {
      mask[p] = 1;
      queue[qt++] = p;
    }
  }

  for (let x = 0; x < width; x++) {
    maybePush(x, 0);
    maybePush(x, height - 1);
  }
  for (let y = 1; y < height - 1; y++) {
    maybePush(0, y);
    maybePush(width - 1, y);
  }

  while (qh < qt) {
    const p = queue[qh++];
    const x = p % width;
    const y = (p / width) | 0;
    maybePush(x + 1, y);
    maybePush(x - 1, y);
    maybePush(x, y + 1);
    maybePush(x, y - 1);
  }
  return mask;
}

function replaceBackground(baseCanvas, mode, tolerance) {
  if (mode === 'original') return composeCanvas(baseCanvas.width, baseCanvas.height, true);

  const temp = document.createElement('canvas');
  temp.width = baseCanvas.width;
  temp.height = baseCanvas.height;
  const tctx = temp.getContext('2d', { willReadFrequently: true });
  tctx.drawImage(baseCanvas, 0, 0);

  const imageData = tctx.getImageData(0, 0, temp.width, temp.height);
  const { data, width, height } = imageData;
  const mask = buildBackgroundMask(imageData, tolerance);
  const [br, bg, bb] = getBgColor(mode);

  for (let p = 0; p < mask.length; p++) {
    const idx = p * 4;
    if (mask[p]) {
      data[idx] = br;
      data[idx + 1] = bg;
      data[idx + 2] = bb;
      data[idx + 3] = 255;
      continue;
    }

    const x = p % width;
    const y = (p / width) | 0;
    let bgNeighbors = 0;
    for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
      for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
        if (nx === x && ny === y) continue;
        if (mask[ny * width + nx]) bgNeighbors++;
      }
    }
    if (bgNeighbors > 0) {
      const mix = Math.min(0.42, bgNeighbors / 16);
      data[idx] = Math.round(data[idx] * (1 - mix) + br * mix);
      data[idx + 1] = Math.round(data[idx + 1] * (1 - mix) + bg * mix);
      data[idx + 2] = Math.round(data[idx + 2] * (1 - mix) + bb * mix);
    }
  }

  tctx.putImageData(imageData, 0, 0);
  return temp;
}

function drawGuide() {
  const W = editor.width;
  const H = editor.height;
  ctx.save();
  ctx.strokeStyle = '#20a464';
  ctx.lineWidth = 5;
  ctx.setLineDash([12, 10]);
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.43, W * 0.27, H * 0.31, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.9;
  ctx.strokeStyle = '#20a464';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(W * 0.24, H * 0.39);
  ctx.lineTo(W * 0.76, H * 0.39);
  ctx.stroke();
  ctx.fillStyle = '#20a464';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText('目のライン', W * 0.38, H * 0.375);
  ctx.restore();
}

function drawEditor() {
  ctx.clearRect(0, 0, editor.width, editor.height);
  ctx.fillStyle = '#e8ebf2';
  ctx.fillRect(0, 0, editor.width, editor.height);
  if (!img) return;

  const raw = composeCanvas(editor.width, editor.height, false);
  const processed = replaceBackground(raw, bgMode, Number(bgTolerance.value));
  ctx.drawImage(processed, 0, 0, editor.width, editor.height);
  drawGuide();
}

function cleanPhotoCanvas() {
  const width = 600;
  const height = Math.round(600 * photoH / photoW);
  const raw = composeCanvas(width, height, false);
  return replaceBackground(raw, bgMode, Number(bgTolerance.value));
}

function setPreset(w, h, btn) {
  photoW = w;
  photoH = h;
  document.getElementById('sizeLabel').textContent = `${w}×${h}mm`;
  document.querySelectorAll('#presetButtons button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}

document.querySelectorAll('#presetButtons button[data-w]').forEach(b => {
  b.onclick = () => {
    document.getElementById('customSizeBox').hidden = true;
    setPreset(Number(b.dataset.w), Number(b.dataset.h), b);
  };
});
document.querySelector('#presetButtons button[data-w]').classList.add('active');

document.getElementById('customPreset').onclick = () => {
  document.getElementById('customSizeBox').hidden = false;
};

document.getElementById('applyCustom').onclick = () => {
  setPreset(Number(document.getElementById('customW').value), Number(document.getElementById('customH').value), document.getElementById('customPreset'));
};

const papers = { L: [89, 127], '2L': [127, 178], A4: [210, 297] };

function generateSheet() {
  if (!img) {
    alert('先に写真を選んでください');
    return;
  }
  const [pw, ph] = papers[document.getElementById('paperSize').value];
  const margin = Number(document.getElementById('marginMm').value) || 0;
  const dpi = 300;
  const pxmm = dpi / 25.4;
  sheet.width = Math.round(pw * pxmm);
  sheet.height = Math.round(ph * pxmm);
  sctx.fillStyle = '#fff';
  sctx.fillRect(0, 0, sheet.width, sheet.height);
  const w = Math.round(photoW * pxmm);
  const h = Math.round(photoH * pxmm);
  const m = Math.round(margin * pxmm);
  const cols = Math.max(1, Math.floor((sheet.width - 2 * m) / w));
  const rows = Math.max(1, Math.floor((sheet.height - 2 * m) / h));
  const totalW = cols * w;
  const totalH = rows * h;
  const startX = Math.floor((sheet.width - totalW) / 2);
  const startY = Math.floor((sheet.height - totalH) / 2);
  const p = cleanPhotoCanvas();

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = startX + c * w;
      const y = startY + r * h;
      sctx.drawImage(p, x, y, w, h);
      sctx.strokeStyle = '#bbb';
      sctx.lineWidth = 1;
      sctx.strokeRect(x, y, w, h);
    }
  }
  sheet.style.display = 'block';
}

document.getElementById('generateSheet').onclick = generateSheet;

function downloadCanvas(canvas, name) {
  const a = document.createElement('a');
  a.download = name;
  a.href = canvas.toDataURL('image/jpeg', 0.95);
  a.click();
}

document.getElementById('downloadSingle').onclick = () => {
  if (!img) {
    alert('先に写真を選んでください');
    return;
  }
  downloadCanvas(cleanPhotoCanvas(), `証明写真_${photoW}x${photoH}mm.jpg`);
};

document.getElementById('downloadSheet').onclick = () => {
  if (!sheet.width) {
    generateSheet();
    if (!sheet.width) return;
  }
  downloadCanvas(sheet, `証明写真_印刷シート_${document.getElementById('paperSize').value}.jpg`);
};

drawEditor();
