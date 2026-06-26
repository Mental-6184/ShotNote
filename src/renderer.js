const { ipcRenderer, clipboard, nativeImage } = require('electron');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const params = new URLSearchParams(window.location.search);
const mode = params.get('mode') || 'editor';
const captureToken = params.get('token') || '';
const captureDisplayId = params.get('displayId') || '';

const COLORS = ['#2f2a25', '#8a5b36', '#b55d39', '#c98b57', '#9a7c4f', '#566c5c', '#5f6f8f', '#c15c6f'];

const state = {
  mode,
  captureToken,
  captureDisplayId,
  image: null,
  imageDataUrl: '',
  imageWidth: 0,
  imageHeight: 0,
  baseComposite: null,
  compositeDirty: true,
  ops: [],
  redoOps: [],
  tool: 'pen',
  color: COLORS[3],
  size: 6,
  view: { scale: 1, offsetX: 0, offsetY: 0 },
  isPointerDown: false,
  isPanning: false,
  spaceDown: false,
  panStart: null,
  draftOp: null,
  history: [],
  ocrLang: 'chi_sim+eng',
  captureSelection: null,
  activeTextComposer: null,
  captureSnapshotDataUrl: '',
  captureDisplayInfo: null
};

const els = {};
let renderScheduled = false;
let toastTimer = null;
let ocrRecognizerPromise = null;

function $(selector) {
  return document.querySelector(selector);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function isRasterOp(op) {
  return op && (op.type === 'blur' || op.type === 'mosaic');
}

function createCanvas(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function roundRectPath(ctx, x, y, w, h, r = 12) {
  const radius = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function setStatus(text) {
  if (els.statusText) {
    els.statusText.textContent = text;
  }
}

function showToast(text, timeout = 2400) {
  if (!els.toast) {
    els.toast = document.createElement('div');
    els.toast.className = 'status-toast';
    document.body.appendChild(els.toast);
  }
  els.toast.textContent = text;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), timeout);
}

async function getRecognizer() {
  if (!ocrRecognizerPromise) {
    ocrRecognizerPromise = import('tesseract.js').then((mod) => {
      const recognize = mod.recognize || mod.default?.recognize;
      if (typeof recognize !== 'function') {
        throw new Error('OCR 引擎不可用');
      }
      return recognize;
    });
  }
  return ocrRecognizerPromise;
}

function scheduleRender() {
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    renderPreview();
  });
}

function imagePointToClient(point) {
  const rect = els.stage.getBoundingClientRect();
  return {
    x: rect.left + state.view.offsetX + point.x * state.view.scale,
    y: rect.top + state.view.offsetY + point.y * state.view.scale
  };
}

function clientPointToImage(clientX, clientY) {
  const rect = els.stage.getBoundingClientRect();
  return {
    x: (clientX - rect.left - state.view.offsetX) / state.view.scale,
    y: (clientY - rect.top - state.view.offsetY) / state.view.scale
  };
}

function loadImageElement(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function loadFileDataUrl(filePath) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

function drawPenStroke(ctx, op) {
  if (!op.points || op.points.length < 2) return;
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.globalAlpha = op.opacity ?? 1;
  ctx.beginPath();
  ctx.moveTo(op.points[0].x, op.points[0].y);
  for (let i = 1; i < op.points.length; i += 1) {
    ctx.lineTo(op.points[i].x, op.points[i].y);
  }
  ctx.stroke();
  ctx.restore();
}

function drawRect(ctx, op) {
  const x = Math.min(op.x1, op.x2);
  const y = Math.min(op.y1, op.y2);
  const w = Math.abs(op.x2 - op.x1);
  const h = Math.abs(op.y2 - op.y1);
  ctx.save();
  ctx.strokeStyle = op.color;
  ctx.lineWidth = op.size;
  ctx.lineJoin = 'round';
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawArrow(ctx, x1, y1, x2, y2, color, width) {
  const angle = Math.atan2(y2 - y1, x2 - x1);
  const head = Math.max(10, width * 2.4);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - head * Math.cos(angle - Math.PI / 6), y2 - head * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - head * Math.cos(angle + Math.PI / 6), y2 - head * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawTextBlock(ctx, op) {
  const text = String(op.text || '').trim();
  if (!text) return;

  const fontSize = op.size || 24;
  const lines = text.split(/\r?\n/).slice(0, 20);
  const paddingX = 14;
  const paddingY = 12;
  const lineGap = Math.max(4, Math.round(fontSize * 0.16));

  ctx.save();
  ctx.font = `600 ${fontSize}px "Segoe UI", "Microsoft YaHei UI", sans-serif`;
  let maxWidth = 0;
  for (const line of lines) {
    maxWidth = Math.max(maxWidth, ctx.measureText(line).width);
  }

  const boxWidth = maxWidth + paddingX * 2;
  const boxHeight = lines.length * fontSize + (lines.length - 1) * lineGap + paddingY * 2;
  ctx.shadowColor = 'rgba(79, 57, 38, 0.12)';
  ctx.shadowBlur = 10;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(255, 253, 248, 0.94)';
  ctx.strokeStyle = 'rgba(209, 189, 167, 0.95)';
  ctx.lineWidth = 1;
  roundRectPath(ctx, op.x, op.y, boxWidth, boxHeight, 14);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = op.color || state.color;
  ctx.textBaseline = 'top';
  lines.forEach((line, index) => {
    ctx.fillText(line, op.x + paddingX, op.y + paddingY + index * (fontSize + lineGap));
  });
  ctx.restore();
}

function drawEffectPreview(ctx, op) {
  const x = Math.min(op.x1, op.x2);
  const y = Math.min(op.y1, op.y2);
  const w = Math.abs(op.x2 - op.x1);
  const h = Math.abs(op.y2 - op.y1);
  if (!w || !h) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(141, 112, 82, 0.62)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.strokeRect(x, y, w, h);
  ctx.restore();
}

function drawOp(ctx, op) {
  if (!op) return;
  switch (op.type) {
    case 'pen':
    case 'highlighter':
      drawPenStroke(ctx, op);
      break;
    case 'rect':
      drawRect(ctx, op);
      break;
    case 'arrow':
      drawArrow(ctx, op.x1, op.y1, op.x2, op.y2, op.color, op.size);
      break;
    case 'text':
      drawTextBlock(ctx, op);
      break;
    case 'blur':
    case 'mosaic':
      drawEffectPreview(ctx, op);
      break;
  }
}

function applyEffectToCanvas(canvas, op) {
  const x = Math.floor(Math.min(op.x1, op.x2));
  const y = Math.floor(Math.min(op.y1, op.y2));
  const w = Math.max(1, Math.ceil(Math.abs(op.x2 - op.x1)));
  const h = Math.max(1, Math.ceil(Math.abs(op.y2 - op.y1)));
  const ctx = canvas.getContext('2d');
  const temp = createCanvas(w, h);
  const tempCtx = temp.getContext('2d');
  tempCtx.drawImage(canvas, x, y, w, h, 0, 0, w, h);

  if (op.type === 'blur') {
    const blurred = createCanvas(w, h);
    const blurredCtx = blurred.getContext('2d');
    blurredCtx.filter = `blur(${op.radius || 8}px)`;
    blurredCtx.drawImage(temp, 0, 0);
    tempCtx.clearRect(0, 0, w, h);
    tempCtx.drawImage(blurred, 0, 0);
  } else if (op.type === 'mosaic') {
    const block = Math.max(6, op.blockSize || 12);
    const sampleW = Math.max(1, Math.ceil(w / block));
    const sampleH = Math.max(1, Math.ceil(h / block));
    const small = createCanvas(sampleW, sampleH);
    const smallCtx = small.getContext('2d');
    smallCtx.imageSmoothingEnabled = false;
    smallCtx.drawImage(temp, 0, 0, w, h, 0, 0, sampleW, sampleH);
    tempCtx.clearRect(0, 0, w, h);
    tempCtx.imageSmoothingEnabled = false;
    tempCtx.drawImage(small, 0, 0, sampleW, sampleH, 0, 0, w, h);
  }

  ctx.clearRect(x, y, w, h);
  ctx.drawImage(temp, x, y);
}

function ensureCompositeCanvas() {
  if (!state.image) return null;
  if (!state.baseComposite || state.compositeDirty) {
    const canvas = createCanvas(state.imageWidth, state.imageHeight);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(state.image, 0, 0);
    for (const op of state.ops) {
      if (isRasterOp(op)) {
        applyEffectToCanvas(canvas, op);
      }
    }
    state.baseComposite = canvas;
    state.compositeDirty = false;
  }
  return state.baseComposite;
}

function resizePreviewCanvas() {
  const rect = els.stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  els.previewCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  els.previewCanvas.height = Math.max(1, Math.round(rect.height * dpr));
  els.previewCanvas.style.width = `${rect.width}px`;
  els.previewCanvas.style.height = `${rect.height}px`;
}

function updateZoomPill() {
  els.zoomPill.textContent = `${Math.round(state.view.scale * 100)}%`;
}

function fitToScreen() {
  if (!state.image) return;
  const rect = els.stage.getBoundingClientRect();
  const padding = 36;
  const scale = Math.min(
    (rect.width - padding * 2) / state.imageWidth,
    (rect.height - padding * 2) / state.imageHeight,
    1
  );
  state.view.scale = Math.max(scale, 0.05);
  state.view.offsetX = Math.round((rect.width - state.imageWidth * state.view.scale) / 2);
  state.view.offsetY = Math.round((rect.height - state.imageHeight * state.view.scale) / 2);
  updateZoomPill();
  scheduleRender();
}

function zoomAt(factor, clientX, clientY) {
  if (!state.image) return;
  const rect = els.stage.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const imageX = (x - state.view.offsetX) / state.view.scale;
  const imageY = (y - state.view.offsetY) / state.view.scale;
  state.view.scale = clamp(state.view.scale * factor, 0.1, 8);
  state.view.offsetX = x - imageX * state.view.scale;
  state.view.offsetY = y - imageY * state.view.scale;
  updateZoomPill();
  scheduleRender();
}

function resetEditorState() {
  state.ops = [];
  state.redoOps = [];
  state.baseComposite = null;
  state.compositeDirty = true;
}

async function loadImageFromDataUrl(dataUrl, meta = {}) {
  const img = await loadImageElement(dataUrl);
  state.image = img;
  state.imageDataUrl = dataUrl;
  state.imageWidth = img.naturalWidth;
  state.imageHeight = img.naturalHeight;
  resetEditorState();
  els.emptyState.classList.add('hidden');
  setStatus(meta.title ? `已打开：${meta.title}` : '截图已载入，可以开始批注。');
  fitToScreen();
}

async function loadLocalImage(filePath, meta = {}) {
  const dataUrl = loadFileDataUrl(filePath);
  await loadImageFromDataUrl(dataUrl, { title: meta.title || path.basename(filePath) });
}

function pushOp(op) {
  state.ops.push(op);
  state.redoOps = [];
  if (isRasterOp(op)) {
    state.compositeDirty = true;
  }
  scheduleRender();
}

function undo() {
  const op = state.ops.pop();
  if (!op) return;
  state.redoOps.push(op);
  if (isRasterOp(op)) {
    state.compositeDirty = true;
  }
  scheduleRender();
}

function redo() {
  const op = state.redoOps.pop();
  if (!op) return;
  state.ops.push(op);
  if (isRasterOp(op)) {
    state.compositeDirty = true;
  }
  scheduleRender();
}

function exportCurrentCanvas() {
  if (!state.image) return null;
  const canvas = createCanvas(state.imageWidth, state.imageHeight);
  const ctx = canvas.getContext('2d');
  const base = ensureCompositeCanvas();
  ctx.drawImage(base, 0, 0);
  for (const op of state.ops) {
    if (!isRasterOp(op)) {
      drawOp(ctx, op);
    }
  }
  return canvas;
}

function canvasToDataUrl(canvas) {
  return canvas.toDataURL('image/png');
}

function copyCurrentImageToClipboard() {
  const canvas = exportCurrentCanvas();
  if (!canvas) return;
  clipboard.writeImage(nativeImage.createFromDataURL(canvasToDataUrl(canvas)));
  showToast('已复制到剪贴板');
}

async function saveCurrentImage() {
  const canvas = exportCurrentCanvas();
  if (!canvas) return;
  const dataUrl = canvasToDataUrl(canvas);
  const record = await ipcRenderer.invoke('app:save-export', {
    dataUrl,
    meta: { toolCount: state.ops.length, source: 'editor' }
  });
  showToast('已导出到历史记录');
  await refreshHistory();
  return record;
}

function setTool(tool) {
  state.tool = tool;
  for (const button of els.toolbar.querySelectorAll('.tool-btn[data-tool]')) {
    button.classList.toggle('active', button.dataset.tool === tool);
  }
  els.previewCanvas.style.cursor = tool === 'hand' ? 'grab' : 'crosshair';
}

function setColor(color) {
  state.color = color;
  for (const swatch of els.colorSwatches.querySelectorAll('.swatch')) {
    swatch.classList.toggle('active', swatch.dataset.color === color);
  }
}

function setSize(size) {
  state.size = Number(size);
  els.sizeRange.value = String(size);
}

function closeTextComposer() {
  if (state.activeTextComposer && state.activeTextComposer.parentElement) {
    state.activeTextComposer.parentElement.removeChild(state.activeTextComposer);
  }
  state.activeTextComposer = null;
}

function openTextComposer({ title, text = '', clientX, clientY, onCommit }) {
  closeTextComposer();
  const composer = document.createElement('div');
  composer.className = 'text-composer';
  composer.innerHTML = `
    <div class="composer-card">
      <div class="composer-title">${title || '文字'}</div>
      <textarea class="text-floating-input" rows="5"></textarea>
      <div class="composer-actions">
        <button class="tool-btn" data-action="cancel">取消</button>
        <button class="tool-btn primary" data-action="commit">插入</button>
      </div>
    </div>
  `;
  const textarea = composer.querySelector('textarea');
  textarea.value = text;
  const card = composer.querySelector('.composer-card');
  const stageRect = els.stage.getBoundingClientRect();
  card.style.left = `${clamp(clientX - stageRect.left + 16, 16, stageRect.width - 470)}px`;
  card.style.top = `${clamp(clientY - stageRect.top + 16, 16, stageRect.height - 260)}px`;

  const commit = () => {
    const value = textarea.value.trim();
    if (value) onCommit(value);
    closeTextComposer();
  };

  composer.querySelector('[data-action="commit"]').addEventListener('click', commit);
  composer.querySelector('[data-action="cancel"]').addEventListener('click', closeTextComposer);
  textarea.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      closeTextComposer();
    }
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      commit();
    }
  });

  els.stage.appendChild(composer);
  state.activeTextComposer = composer;
  textarea.focus();
  textarea.select();
}

async function runOcr() {
  if (!state.image) {
    showToast('先打开一张截图再 OCR');
    return;
  }

  try {
    setStatus('OCR 识别中...');
    const recognize = await getRecognizer();
    const result = await recognize(canvasToDataUrl(exportCurrentCanvas()), els.ocrLang.value || state.ocrLang, {
      logger: (message) => {
        if (message && message.status) {
          const percent = typeof message.progress === 'number' ? ' ' + (message.progress * 100).toFixed(0) + '%' : '';
          setStatus('OCR：' + message.status + percent);
        }
      }
    });
    const text = String(result?.data?.text || '').trim();
    if (!text) {
      showToast('没有识别到文字');
      setStatus('OCR 完成');
      return;
    }

    const center = {
      x: Math.round(state.imageWidth / 2),
      y: Math.round(state.imageHeight / 2)
    };
    const client = imagePointToClient({ x: center.x - 160, y: center.y - 60 });
    openTextComposer({
      title: 'OCR 结果',
      text,
      clientX: client.x,
      clientY: client.y,
      onCommit: (value) => {
        pushOp({
          type: 'text',
          x: center.x,
          y: center.y,
          text: value,
          color: state.color,
          size: 22
        });
      }
    });
    setStatus('OCR 完成，可以编辑结果');
  } catch (error) {
    console.error(error);
    showToast('OCR 失败：' + error.message);
    setStatus('OCR 失败');
  }
}

async function refreshHistory() {
  try {
    const records = await ipcRenderer.invoke('app:get-history');
    state.history = Array.isArray(records)
      ? records.filter((record) => record && typeof record.pngPath === 'string' && record.pngPath.trim())
      : [];
  } catch (error) {
    console.error(error);
    state.history = [];
  }
  renderHistoryList();
}

function renderHistoryList() {
  els.historyList.innerHTML = '';

  if (!state.history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-subtitle';
    empty.style.padding = '8px 6px';
    empty.textContent = '还没有导出记录。';
    els.historyList.appendChild(empty);
    return;
  }

  for (const record of state.history) {
    if (!record?.pngPath || !fs.existsSync(record.pngPath)) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    const title = record.meta?.title || path.basename(record.pngPath);
    const subtitle = new Date(record.createdAt || Date.now()).toLocaleString('zh-CN');
    const thumbUrl = pathToFileURL(record.pngPath).href;
    item.innerHTML = `
      <img class="history-thumb" src="${thumbUrl}" alt="" />
      <div class="history-meta">
        <div class="history-title">${title}</div>
        <div class="history-subtitle">${subtitle}</div>
      </div>
    `;
    item.addEventListener('click', async () => {
      await loadLocalImage(record.pngPath, { title });
      showToast('已打开历史记录：' + title);
    });
    item.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await ipcRenderer.invoke('app:show-in-folder', record.pngPath);
    });
    els.historyList.appendChild(item);
  }
}

function renderPreview() {
  resizePreviewCanvas();
  const canvas = els.previewCanvas;
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;
  const cssWidth = canvas.clientWidth;
  const cssHeight = canvas.clientHeight;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  if (!state.image) {
    els.emptyState.classList.remove('hidden');
    return;
  }

  els.emptyState.classList.add('hidden');
  const base = ensureCompositeCanvas();
  ctx.save();
  ctx.translate(state.view.offsetX, state.view.offsetY);
  ctx.scale(state.view.scale, state.view.scale);
  ctx.drawImage(base, 0, 0);
  for (const op of state.ops) {
    if (!isRasterOp(op)) drawOp(ctx, op);
  }
  if (state.draftOp) drawOp(ctx, state.draftOp);
  ctx.restore();
}

function currentPoint(event) {
  return clientPointToImage(event.clientX, event.clientY);
}

function beginDrawing(event) {
  if (!state.image) return;
  const point = currentPoint(event);
  state.isPointerDown = true;
  state.captureSelection = null;

  if (state.tool === 'hand' || state.spaceDown) {
    state.isPanning = true;
    state.panStart = {
      x: event.clientX,
      y: event.clientY,
      offsetX: state.view.offsetX,
      offsetY: state.view.offsetY
    };
    els.previewCanvas.style.cursor = 'grabbing';
    return;
  }

  if (state.tool === 'pen' || state.tool === 'highlighter') {
    state.draftOp = {
      type: state.tool,
      points: [point],
      color: state.color,
      size: state.tool === 'highlighter' ? Math.max(10, state.size * 2) : state.size,
      opacity: state.tool === 'highlighter' ? 0.34 : 1
    };
    scheduleRender();
    return;
  }

  if (state.tool === 'text') {
    openTextComposer({
      title: '插入文字',
      text: '',
      clientX: event.clientX,
      clientY: event.clientY,
      onCommit: (value) => {
        pushOp({
          type: 'text',
          x: point.x,
          y: point.y,
          text: value,
          color: state.color,
          size: Math.max(18, state.size * 2)
        });
      }
    });
    state.isPointerDown = false;
    return;
  }

  if (['rect', 'arrow', 'blur', 'mosaic'].includes(state.tool)) {
    state.draftOp = {
      type: state.tool,
      x1: point.x,
      y1: point.y,
      x2: point.x,
      y2: point.y,
      color: state.color,
      size: state.tool === 'blur' ? 1 : Math.max(2, state.size),
      radius: state.tool === 'blur' ? 10 : undefined,
      blockSize: state.tool === 'mosaic' ? Math.max(8, Math.round(state.size * 2)) : undefined
    };
    scheduleRender();
  }
}

function updateDrawing(event) {
  if (!state.isPointerDown) return;

  if (state.isPanning && state.panStart) {
    const dx = event.clientX - state.panStart.x;
    const dy = event.clientY - state.panStart.y;
    state.view.offsetX = state.panStart.offsetX + dx;
    state.view.offsetY = state.panStart.offsetY + dy;
    updateZoomPill();
    scheduleRender();
    return;
  }

  if (!state.draftOp) return;
  const point = currentPoint(event);
  if (state.draftOp.type === 'pen' || state.draftOp.type === 'highlighter') {
    state.draftOp.points.push(point);
  } else {
    state.draftOp.x2 = point.x;
    state.draftOp.y2 = point.y;
  }
  scheduleRender();
}

function finishDrawing() {
  if (!state.isPointerDown) return;
  state.isPointerDown = false;

  if (state.isPanning) {
    state.isPanning = false;
    state.panStart = null;
    els.previewCanvas.style.cursor = state.tool === 'hand' ? 'grab' : 'crosshair';
    return;
  }

  if (!state.draftOp) return;

  if (state.draftOp.type === 'pen' || state.draftOp.type === 'highlighter') {
    if (state.draftOp.points.length > 1) {
      pushOp(state.draftOp);
    }
    state.draftOp = null;
    scheduleRender();
    return;
  }

  const op = state.draftOp;
  state.draftOp = null;
  if (Math.abs(op.x2 - op.x1) < 3 || Math.abs(op.y2 - op.y1) < 3) {
    scheduleRender();
    return;
  }
  pushOp(op);
}

function handleWheel(event) {
  if (!state.image || !event.ctrlKey) return;
  event.preventDefault();
  zoomAt(event.deltaY > 0 ? 0.92 : 1.08, event.clientX, event.clientY);
}

function bindUi() {
  for (const button of els.toolbar.querySelectorAll('.tool-btn[data-tool]')) {
    button.addEventListener('click', () => setTool(button.dataset.tool));
  }

  els.fitBtn.addEventListener('click', fitToScreen);
  els.zoomInBtn.addEventListener('click', () => zoomAt(1.12, els.stage.getBoundingClientRect().left + els.stage.clientWidth / 2, els.stage.getBoundingClientRect().top + els.stage.clientHeight / 2));
  els.zoomOutBtn.addEventListener('click', () => zoomAt(0.88, els.stage.getBoundingClientRect().left + els.stage.clientWidth / 2, els.stage.getBoundingClientRect().top + els.stage.clientHeight / 2));
  els.undoBtn.addEventListener('click', undo);
  els.redoBtn.addEventListener('click', redo);
  els.copyBtn.addEventListener('click', copyCurrentImageToClipboard);
  els.saveBtn.addEventListener('click', saveCurrentImage);
  els.newShotBtn.addEventListener('click', () => ipcRenderer.send('app:request-capture'));
  els.ocrBtn.addEventListener('click', runOcr);
  els.refreshHistoryBtn.addEventListener('click', refreshHistory);
  els.sizeRange.addEventListener('input', (event) => setSize(event.target.value));
  els.ocrLang.addEventListener('change', (event) => {
    state.ocrLang = event.target.value;
  });

  els.colorSwatches.innerHTML = COLORS.map((color, index) => `<button class="swatch ${index === 3 ? 'active' : ''}" data-color="${color}" style="background:${color}" title="${color}"></button>`).join('');
  for (const swatch of els.colorSwatches.querySelectorAll('.swatch')) {
    swatch.addEventListener('click', () => setColor(swatch.dataset.color));
  }

  els.previewCanvas.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    els.previewCanvas.setPointerCapture(event.pointerId);
    beginDrawing(event);
  });
  els.previewCanvas.addEventListener('pointermove', updateDrawing);
  els.previewCanvas.addEventListener('pointerup', finishDrawing);
  els.previewCanvas.addEventListener('pointercancel', () => {
    state.isPointerDown = false;
    state.isPanning = false;
    state.draftOp = null;
    state.panStart = null;
    scheduleRender();
  });
  els.previewCanvas.addEventListener('wheel', handleWheel, { passive: false });

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (state.activeTextComposer) {
        closeTextComposer();
        return;
      }
      if (state.mode === 'capture') {
        ipcRenderer.send('app:capture-cancelled', state.captureToken);
        window.close();
      }
      return;
    }

    if (event.code === 'Space') {
      state.spaceDown = true;
    }

    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      event.shiftKey ? redo() : undo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      redo();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '0') {
      event.preventDefault();
      fitToScreen();
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '=') {
      event.preventDefault();
      zoomAt(1.12, els.stage.getBoundingClientRect().left + els.stage.clientWidth / 2, els.stage.getBoundingClientRect().top + els.stage.clientHeight / 2);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === '-') {
      event.preventDefault();
      zoomAt(0.88, els.stage.getBoundingClientRect().left + els.stage.clientWidth / 2, els.stage.getBoundingClientRect().top + els.stage.clientHeight / 2);
    }
  });

  window.addEventListener('keyup', (event) => {
    if (event.code === 'Space') {
      state.spaceDown = false;
      els.previewCanvas.style.cursor = state.tool === 'hand' ? 'grab' : 'crosshair';
    }
  });

  window.addEventListener('resize', () => {
    resizePreviewCanvas();
    scheduleRender();
  });

  window.addEventListener('dragover', (event) => event.preventDefault());
  window.addEventListener('drop', async (event) => {
    event.preventDefault();
    const file = event.dataTransfer.files && event.dataTransfer.files[0];
    if (!file) return;
    const ext = path.extname(file.path).toLowerCase();
    if (!['.png', '.jpg', '.jpeg', '.webp', '.bmp'].includes(ext)) return;
    await loadLocalImage(file.path, { title: file.name });
  });

  ipcRenderer.on('history:changed', (_event, records) => {
    state.history = Array.isArray(records) ? records : [];
    renderHistoryList();
  });

  ipcRenderer.on('capture:open-image', async (_event, payload) => {
    if (!payload?.dataUrl) return;
    await loadImageFromDataUrl(payload.dataUrl, { title: payload.displayLabel || '新截图' });
    showToast('截图已载入');
  });
}

async function refreshHistory() {
  try {
    const records = await ipcRenderer.invoke('app:get-history');
    state.history = Array.isArray(records)
      ? records.filter((record) => record && typeof record.pngPath === 'string' && record.pngPath.trim())
      : [];
  } catch (error) {
    console.error(error);
    state.history = [];
  }
  renderHistoryList();
}

function renderHistoryList() {
  els.historyList.innerHTML = '';
  if (!state.history.length) {
    const empty = document.createElement('div');
    empty.className = 'history-subtitle';
    empty.style.padding = '8px 6px';
    empty.textContent = '还没有导出记录。';
    els.historyList.appendChild(empty);
    return;
  }

  for (const record of state.history) {
    if (!record?.pngPath || !fs.existsSync(record.pngPath)) continue;
    const item = document.createElement('button');
    item.type = 'button';
    item.className = 'history-item';
    const title = record.meta?.title || path.basename(record.pngPath);
    const subtitle = new Date(record.createdAt || Date.now()).toLocaleString('zh-CN');
    const thumbUrl = pathToFileURL(record.pngPath).href;
    item.innerHTML = `
      <img class="history-thumb" src="${thumbUrl}" alt="" />
      <div class="history-meta">
        <div class="history-title">${title}</div>
        <div class="history-subtitle">${subtitle}</div>
      </div>
    `;
    item.addEventListener('click', async () => {
      await loadLocalImage(record.pngPath, { title });
      showToast('已打开历史记录：' + title);
    });
    item.addEventListener('contextmenu', async (event) => {
      event.preventDefault();
      await ipcRenderer.invoke('app:show-in-folder', record.pngPath);
    });
    els.historyList.appendChild(item);
  }
}

async function initEditorMode() {
  document.body.classList.add('editor-mode');
  els.editorShell.classList.remove('hidden');
  els.captureShell.classList.add('hidden');
  setTool('pen');
  setColor(state.color);
  setSize(state.size);
  state.ocrLang = els.ocrLang.value;
  resizePreviewCanvas();
  setTimeout(() => {
    refreshHistory().catch((error) => console.error(error));
  }, 0);
  scheduleRender();
  setStatus('选择“新建截图”开始，或拖入图片直接编辑。');
}

function currentSelectionBounds() {
  if (!state.captureSelection) return null;
  const { x1, y1, x2, y2 } = state.captureSelection;
  return {
    left: Math.min(x1, x2),
    top: Math.min(y1, y2),
    width: Math.abs(x2 - x1),
    height: Math.abs(y2 - y1)
  };
}

function updateSelectionElement(startX, startY, currentX, currentY) {
  const left = Math.min(startX, currentX);
  const top = Math.min(startY, currentY);
  const width = Math.abs(currentX - startX);
  const height = Math.abs(currentY - startY);
  els.captureSelection.style.left = `${left}px`;
  els.captureSelection.style.top = `${top}px`;
  els.captureSelection.style.width = `${width}px`;
  els.captureSelection.style.height = `${height}px`;
  els.captureSelection.classList.toggle('hidden', width < 1 || height < 1);
  state.captureSelection = { x1: startX, y1: startY, x2: currentX, y2: currentY };
}

async function finishCaptureFlow() {
  const bounds = currentSelectionBounds();
  if (!bounds || bounds.width < 6 || bounds.height < 6) {
    ipcRenderer.send('app:capture-cancelled', state.captureToken);
    window.close();
    return;
  }

  if (!state.captureSnapshotDataUrl) {
    state.captureSnapshotDataUrl = await ipcRenderer.invoke('app:get-capture-snapshot', state.captureDisplayId);
  }

  if (!state.captureDisplayInfo) {
    state.captureDisplayInfo = await ipcRenderer.invoke('app:get-display-info', state.captureDisplayId);
  }

  const display = state.captureDisplayInfo;
  if (!display?.bounds) {
    throw new Error('Display information unavailable');
  }

  const image = await loadImageElement(state.captureSnapshotDataUrl);
  const scaleX = image.naturalWidth / display.bounds.width;
  const scaleY = image.naturalHeight / display.bounds.height;
  const crop = createCanvas(Math.round(bounds.width * scaleX), Math.round(bounds.height * scaleY));
  const cropCtx = crop.getContext('2d');
  cropCtx.drawImage(
    image,
    Math.round(bounds.left * scaleX),
    Math.round(bounds.top * scaleY),
    Math.round(bounds.width * scaleX),
    Math.round(bounds.height * scaleY),
    0,
    0,
    crop.width,
    crop.height
  );

  ipcRenderer.send('app:capture-complete', {
    token: state.captureToken,
    displayId: state.captureDisplayId,
    displayLabel: '显示器 ' + display.id,
    dataUrl: crop.toDataURL('image/png'),
    bounds
  });
  setTimeout(() => {
    window.close();
  }, 150);
}

async function initCaptureMode() {
  document.body.classList.add('capture-mode');
  els.editorShell.classList.add('hidden');
  els.captureShell.classList.remove('hidden');
  els.captureSelection.style.display = 'block';

  try {
    const [snapshotDataUrl, displayInfo] = await Promise.all([
      ipcRenderer.invoke('app:get-capture-snapshot', state.captureDisplayId),
      ipcRenderer.invoke('app:get-display-info', state.captureDisplayId)
    ]);
    state.captureSnapshotDataUrl = snapshotDataUrl;
    state.captureDisplayInfo = displayInfo;
    setCaptureBackdropPreview(state.captureSnapshotDataUrl);
    ipcRenderer.send('app:show-capture-window');
  } catch (error) {
    console.error(error);
    ipcRenderer.send('app:show-capture-window');
  }

  let dragging = false;
  let startX = 0;
  let startY = 0;

  const onDown = (event) => {
    if (event.button !== 0) return;
    dragging = true;
    startX = event.clientX;
    startY = event.clientY;
    updateSelectionElement(startX, startY, startX, startY);
  };

  const onMove = (event) => {
    if (!dragging) return;
    updateSelectionElement(startX, startY, event.clientX, event.clientY);
  };

  const onUp = async (event) => {
    if (!dragging) return;
    dragging = false;
    updateSelectionElement(startX, startY, event.clientX, event.clientY);
    try {
      await finishCaptureFlow();
    } catch (error) {
      console.error(error);
      showToast('截图失败：' + error.message, 5000);
      ipcRenderer.send('app:log', 'capture failed: ' + error.message);
    }
  };

  window.addEventListener('mousedown', onDown);
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      ipcRenderer.send('app:capture-cancelled', state.captureToken);
      window.close();
    }
  });
}

function collectElements() {
  els.editorShell = $('#editorShell');
  els.captureShell = $('#captureShell');
  els.captureBackdrop = $('#captureShell .capture-backdrop');
  els.captureSelection = $('#captureSelection');
  els.captureCrosshair = $('#captureCrosshair');
  els.toolbar = $('#toolbar');
  els.stage = $('#stage');
  els.previewCanvas = $('#previewCanvas');
  els.emptyState = $('#emptyState');
  els.colorSwatches = $('#colorSwatches');
  els.sizeRange = $('#sizeRange');
  els.ocrLang = $('#ocrLang');
  els.historyList = $('#historyList');
  els.statusText = $('#statusText');
  els.zoomPill = $('#zoomPill');
  els.fitBtn = $('#fitBtn');
  els.zoomOutBtn = $('#zoomOutBtn');
  els.zoomInBtn = $('#zoomInBtn');
  els.undoBtn = $('#undoBtn');
  els.redoBtn = $('#redoBtn');
  els.copyBtn = $('#copyBtn');
  els.saveBtn = $('#saveBtn');
  els.newShotBtn = $('#newShotBtn');
  els.refreshHistoryBtn = $('#refreshHistoryBtn');
  els.ocrBtn = $('#ocrBtn');
}

function setCaptureBackdropPreview(dataUrl) {
  if (!els.captureBackdrop) return;
  els.captureBackdrop.style.background = `url("${dataUrl}") center center / 100% 100% no-repeat`;
}

async function main() {
  collectElements();
  bindUi();
  if (state.mode === 'capture') {
    await initCaptureMode();
  } else {
    await initEditorMode();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  main().catch((error) => {
    console.error(error);
    setStatus('初始化失败：' + error.message);
    showToast('初始化失败：' + error.message);
  });
});

window.addEventListener('error', (event) => {
  console.error(event.error || event.message);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error(event.reason);
});
