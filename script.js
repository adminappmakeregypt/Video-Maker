// ===== Image Slideshow Video Maker (with voice-over) =====
// Pure HTML/CSS/JS. Records a canvas + mixed audio with MediaRecorder.

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
  card._audio = null; // voice-over Blob (uploaded or recorded)

  card.innerHTML = `
    <label class="thumb">Click to choose image
      <input type="file" accept="image/*" class="imgFile">
    </label>
    <div>
      <div class="num"></div>
      <textarea dir="auto" placeholder="Caption text..."></textarea>
      <div class="voice">
        <div class="voice-row">
          <label class="btn small">Upload voice-over
            <input type="file" accept="audio/*" class="audioFile">
          </label>
          <button class="btn small recBtn" type="button">Record voice</button>
          <button class="btn small clearAudio hidden" type="button">Clear voice</button>
        </div>
        <audio controls class="audioPrev hidden"></audio>
      </div>
    </div>
    <div class="actions">
      <button class="btn small up" type="button">Up</button>
      <button class="btn small down" type="button">Down</button>
      <button class="btn small danger remove" type="button">Remove</button>
    </div>`;

  const input = card.querySelector('.imgFile');
  const thumb = card.querySelector('.thumb');
  const audioFile = card.querySelector('.audioFile');
  const recBtn = card.querySelector('.recBtn');
  const clearBtn = card.querySelector('.clearAudio');
  const prev = card.querySelector('.audioPrev');

  // image
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

  // voice-over helpers
  function setAudio(blob) {
    if (prev.src) URL.revokeObjectURL(prev.src);
    card._audio = blob;
    prev.src = URL.createObjectURL(blob);
    prev.classList.remove('hidden');
    clearBtn.classList.remove('hidden');
  }
  function clearAudio() {
    if (prev.src) URL.revokeObjectURL(prev.src);
    prev.removeAttribute('src');
    prev.load();
    prev.classList.add('hidden');
    clearBtn.classList.add('hidden');
    card._audio = null;
    audioFile.value = '';
  }

  audioFile.addEventListener('change', () => {
    if (audioFile.files[0]) setAudio(audioFile.files[0]);
  });
  clearBtn.addEventListener('click', clearAudio);

  // record from microphone
  let rec = null, chunks = [], micStream = null;
  recBtn.addEventListener('click', async () => {
    if (rec && rec.state === 'recording') { rec.stop(); return; }
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      $('error').textContent = 'Microphone access was denied or is unavailable.';
      return;
    }
    $('error').textContent = '';
    chunks = [];
    rec = new MediaRecorder(micStream);
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = () => {
      micStream.getTracks().forEach((t) => t.stop());
      setAudio(new Blob(chunks, { type: rec.mimeType }));
      recBtn.textContent = 'Record voice';
      recBtn.classList.remove('rec');
    };
    rec.start();
    recBtn.textContent = 'Stop recording';
    recBtn.classList.add('rec');
  });

  // reorder / remove
  card.querySelector('.remove').addEventListener('click', () => {
    if (card.dataset.url) URL.revokeObjectURL(card.dataset.url);
    if (prev.src) URL.revokeObjectURL(prev.src);
    card.remove();
    renumber();
  });
  card.querySelector('.up').addEventListener('click', () => {
    const p = card.previousElementSibling;
    if (p) slidesEl.insertBefore(card, p);
    renumber();
  });
  card.querySelector('.down').addEventListener('click', () => {
    const n = card.nextElementSibling;
    if (n) slidesEl.insertBefore(n, card);
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

function pickMimeType(withAudio) {
  const types = withAudio
    ? [
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4;codecs=avc1,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9,opus',
        'video/webm;codecs=vp8,opus',
        'video/webm'
      ]
    : [
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

  const img = slide.img;
  const scale = opts.fit === 'cover'
    ? Math.max(W / img.width, H / img.height)
    : Math.min(W / img.width, H / img.height);
  const w = img.width * scale, h = img.height * scale;
  ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);

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
  $('status').textContent = 'Loading images and audio...';
  $('bar').style.width = '0%';

  let audioCtx = null;

  try {
    const baseMs = Math.max(1, Number($('duration').value) || 5) * 1000;
    const autoDur = $('autoDur').checked;
    const anyAudio = withImages.some((c) => c._audio);

    if (anyAudio) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtx = new AC();
      await audioCtx.resume();
    }

    // Build slide list (image, text, decoded audio, duration, start time)
    const slides = [];
    let cursor = 0;
    for (const c of withImages) {
      const slide = {
        img: await loadImage(c.dataset.url),
        text: c.querySelector('textarea').value,
        buffer: null,
        durMs: baseMs,
        startMs: 0
      };
      if (c._audio && audioCtx) {
        try {
          const data = await c._audio.arrayBuffer();
          slide.buffer = await audioCtx.decodeAudioData(data);
        } catch (e) {
          throw new Error('Could not read the audio of one slide. Try another audio file.');
        }
        if (autoDur) {
          slide.durMs = Math.max(baseMs, Math.ceil(slide.buffer.duration * 1000) + 300);
        }
      }
      slide.startMs = cursor;
      cursor += slide.durMs;
      slides.push(slide);
    }
    const totalMs = cursor;

    const [cw, ch] = $('resolution').value.split('x').map(Number);
    canvas.width = cw;
    canvas.height = ch;

    const opts = {
      fit: $('fit').value,
      fontSize: Number($('fontSize').value) || 48,
      color: $('textColor').value,
      pos: $('textPos').value,
      bg: $('textBg').checked,
      fade: $('fade').checked,
      fadeMs: 500
    };

    drawFrame(slides, 0, opts, opts.fadeMs);

    // Stream: canvas video + (optional) mixed audio track
    const stream = canvas.captureStream(30);
    let audioDest = null;
    if (audioCtx) {
      audioDest = audioCtx.createMediaStreamDestination();
      audioDest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
    }

    const mimeType = pickMimeType(!!audioCtx);
    const recorder = new MediaRecorder(
      stream,
      mimeType ? { mimeType, videoBitsPerSecond: 5000000 } : undefined
    );
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    const finished = new Promise((resolve) => { recorder.onstop = resolve; });
    recorder.start(500);

    // Schedule voice-overs on the audio clock
    const LEAD = 0.05; // seconds
    if (audioCtx) {
      const t0 = audioCtx.currentTime + LEAD;
      slides.forEach((s) => {
        if (!s.buffer) return;
        const src = audioCtx.createBufferSource();
        src.buffer = s.buffer;
        src.connect(audioDest);
        const at = t0 + s.startMs / 1000;
        src.start(at);
        src.stop(at + s.durMs / 1000);
      });
    }

    // Video timing loop
    const startTime = performance.now() + LEAD * 1000;
    await new Promise((resolve) => {
      function tick() {
        const elapsed = Math.max(0, performance.now() - startTime);
        if (elapsed >= totalMs) {
          drawFrame(slides, slides.length - 1, opts, slides[slides.length - 1].durMs);
          resolve();
          return;
        }
        let idx = slides.length - 1;
        for (let i = 0; i < slides.length; i++) {
          if (elapsed < slides[i].startMs + slides[i].durMs) { idx = i; break; }
        }
        drawFrame(slides, idx, opts, elapsed - slides[idx].startMs);
        $('bar').style.width = (elapsed / totalMs * 100).toFixed(1) + '%';
        $('status').textContent = `Recording slide ${idx + 1} of ${slides.length}...`;
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });

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
    if (audioCtx) audioCtx.close();
    busy = false;
    $('generateBtn').disabled = false;
  }
}

// ---------- Init ----------
$('addSlideBtn').addEventListener('click', addSlide);
$('generateBtn').addEventListener('click', generate);
addSlide();
