// ===== Image Slideshow Video Maker =====
// Pure HTML/CSS/JS. Records a canvas with MediaRecorder.

const $ = (id) => document.getElementById(id);
const slidesEl = $('slides');
const canvas = $('canvas');
const ctx = canvas.getContext('2d');

let currentVideoUrl = null;
let busy = false;

// ---------- Slide cards ----------
function addSlide() {
  const card = document.createElement('div');
  card.className = 'slide';
  card.innerHTML = `
    <label class="thumb">Click to choose image
      <input type="file" accept="image/*">
    </label>
    <div>
      <div class="num"></div>
      <textarea dir="auto" placeholder="Caption text..."></textarea>
    </div>
    <div class="actions">
      <button class="btn small up" type="button">Up</button>
      <button class="btn small down" type="button">Down</button>
      <button class="btn small danger remove" type="button">Remove</button>
    </div>`;

  const input = card.querySelector('input[type=file]');
  const thumb = card.querySelector('.thumb');

  input.addEventListener('change', () => {
    const file = input.files[0];
    if (!file) return;
    if (card.dataset.url) URL.revokeObjectURL(card.dataset.url);
    const url = URL.createObjectURL(file);
    card.dataset.url = url;
    thumb.innerHTML = '';
    const img = document.createElement('img');
    img.src = url;
    thumb.appendChild(img);
    thumb.appendChild(input);
  });

  card.querySelector('.remove').addEventListener('click', () => {
    if (card.dataset.url) URL.revokeObjectURL(card.dataset.url);
    card.remove();
    renumber();
  });
  card.querySelector('.up').addEventListener('click', () => {
    const prev = card.previousElementSibling;
    if (prev) slidesEl.insertBefore(card, prev);
    renumber();
  });
  card.querySelector('.down').addEventListener('click', () => {
    const next = card.nextElementSibling;
    if (next) slidesEl.insertBefore(next, card);
    renumber();
  });

  slidesEl.appendChild(card);
  renumber();
}

function renumber() {
  [...slidesEl.children].forEach((c, i) => {
    c.querySelector('.num').textContent = 'Slide ' + (i + 1);
  });
}

// ---------- Helpers ----------
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load an image.'));
    img.src = url;
  });
}

function pickMimeType() {
  const types = [
    'video/mp4;codecs=avc1',
    'video/mp4',
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm'
  ];
  return types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
}

function hasRTL(text) {
  return /[\u0590-\u08FF]/.test(text);
}

function wrapLines(text, maxWidth) {
  const lines = [];
  text.split('\n').forEach((para) => {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); return; }
    let line = words[0];
    for (let i = 1; i < words.length; i++) {
      const test = line + ' ' + words[i];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else { lines.push(line); line = words[i]; }
    }
    lines.push(line);
  });
  return lines;
}

// ---------- Drawing ----------
function drawSlide(slide, opts, alpha) {
  const W = canvas.width, H = canvas.height;
  ctx.save();
  ctx.globalAlpha = alpha;

  // image
  const img = slide.img;
  const scale = opts.fit === 'cover'
    ? Math.max(W / img.width, H / img.height)
    : Math.min(W / img.width, H / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);

  // caption
  const text = slide.text.trim();
  if (text) {
    const fs = opts.fontSize;
    ctx.font = `bold ${fs}px system-ui, "Segoe UI", Tahoma, Arial, sans-serif`;
    ctx.direction = hasRTL(text) ? 'rtl' : 'ltr';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const pad = fs * 0.5;
    const lineH = fs * 1.3;
    const lines = wrapLines(text, W * 0.86);
    const boxH = lines.length * lineH + pad * 2;
    let y;
    if (opts.pos === 'top') y = H * 0.05;
    else if (opts.pos === 'center') y = (H - boxH) / 2;
    else y = H - boxH - H * 0.05;

    if (opts.bg) {
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(0, y, W, boxH);
    }
    ctx.fillStyle = opts.color;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y + pad + i * lineH));
  }
  ctx.restore();
}

function drawFrame(slides, idx, opts, tInSlide) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (opts.fade && idx > 0 && tInSlide < opts.fadeMs) {
    drawSlide(slides[idx - 1], opts, 1);
    drawSlide(slides[idx], opts, tInSlide / opts.fadeMs);
  } else {
    drawSlide(slides[idx], opts, 1);
  }
}

// ---------- Generate ----------
async function generate() {
  if (busy) return;
  $('error').textContent = '';

  const cards = [...slidesEl.children];
  const withImages = cards.filter((c) => c.dataset.url);
  if (!withImages.length) {
    $('error').textContent = 'Please add at least one slide with an image.';
    return;
  }
  if (!window.MediaRecorder || !canvas.captureStream) {
    $('error').textContent = 'Your browser does not support video recording. Use Chrome, Edge or Firefox.';
    return;
  }

  busy = true;
  $('generateBtn').disabled = true;
  $('progressWrap').classList.remove('hidden');
  $('result').classList.add('hidden');
  $('status').textContent = 'Loading images...';
  $('bar').style.width = '0%';

  try {
    const slides = [];
    for (const c of withImages) {
      slides.push({
        img: await loadImage(c.dataset.url),
        text: c.querySelector('textarea').value
      });
    }

    const [cw, ch] = $('resolution').value.split('x').map(Number);
    canvas.width = cw;
    canvas.height = ch;

    const durMs = Math.max(1, Number($('duration').value) || 5) * 1000;
    const opts = {
      fit: $('fit').value,
      fontSize: Number($('fontSize').value) || 48,
      color: $('textColor').value,
      pos: $('textPos').value,
      bg: $('textBg').checked,
      fade: $('fade').checked,
      fadeMs: 500
    };
    const totalMs = durMs * slides.length;

    // draw first frame before recording starts
    drawFrame(slides, 0, opts, durMs);

    const mimeType = pickMimeType();
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType, videoBitsPerSecond: 5000000 } : undefined);
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(500);

    const startTime = performance.now();
    await new Promise((resolve) => {
      function tick() {
        const elapsed = performance.now() - startTime;
        if (elapsed >= totalMs) {
          drawFrame(slides, slides.length - 1, opts, durMs);
          resolve();
          return;
        }
        const idx = Math.min(Math.floor(elapsed / durMs), slides.length - 1);
        drawFrame(slides, idx, opts, elapsed - idx * durMs);
        $('bar').style.width = (elapsed / totalMs * 100).toFixed(1) + '%';
        $('status').textContent = `Recording slide ${idx + 1} of ${slides.length}...`;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

    // small delay so the last frame is captured
    await new Promise((r) => setTimeout(r, 300));
    recorder.stop();
    await finished;

    const type = recorder.mimeType || mimeType || 'video/webm';
    const ext = type.includes('mp4') ? 'mp4' : 'webm';
    const blob = new Blob(chunks, { type });

    if (currentVideoUrl) URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = URL.createObjectURL(blob);

    $('player').src = currentVideoUrl;
    $('downloadBtn').href = currentVideoUrl;
    $('downloadBtn').download = 'slideshow.' + ext;
    $('result').classList.remove('hidden');
    $('bar').style.width = '100%';
    $('status').textContent = 'Done! Format: ' + ext.toUpperCase();
  } catch (err) {
    $('error').textContent = err.message || 'Something went wrong.';
  } finally {
    busy = false;
    $('generateBtn').disabled = false;
  }
}

// ---------- Init ----------
$('addSlideBtn').addEventListener('click', addSlide);
$('generateBtn').addEventListener('click', generate);
addSlide();
