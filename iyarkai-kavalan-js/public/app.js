const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
let dashboard = null;
let toastTimer;

function escapeHTML(value = '') {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function showToast(message) {
  const toast = $('#toast'); toast.textContent = message; toast.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}
function pad(value) { return String(value).padStart(2, '0'); }
function fillMetric(selector, value) { const el = $(selector); if (el) el.textContent = pad(value); }
function formatDate() { const now = new Date(); $('#todayDate').textContent = now.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); }
function binStatusClass(bin) {
  if (bin.status === 'Animal alert') return 'animal';
  if (bin.status === 'Sensor warning') return 'sensor';
  if (bin.fill >= 80) return 'high';
  if (bin.fill >= 65) return 'attention';
  return 'normal';
}
function renderBins(bins) {
  $('#binList').innerHTML = bins.map(bin => {
    const cls = binStatusClass(bin);
    const fillClass = bin.fill >= 80 ? 'fill-high' : bin.fill >= 65 ? 'fill-attention' : 'fill-normal';
    const statusLabel = bin.status === 'Animal alert' ? 'Animal alert' : bin.status === 'Sensor warning' ? 'Sensor warning' : bin.fill >= 80 ? 'Collect soon' : bin.fill >= 65 ? 'Attention' : 'Normal';
    return `<div class="bin-row"><div class="bin-symbol ${cls}">${bin.type.includes('Organic') ? '♧' : bin.type.includes('Recyclables') ? '♻' : '▤'}</div><div class="bin-info"><div class="bin-title-line"><b>${escapeHTML(bin.name)}</b><span class="bin-id">${escapeHTML(bin.id)}</span></div><span class="bin-subtitle">${escapeHTML(bin.zone)} · ${escapeHTML(bin.type)}</span><div class="progress-track"><div class="progress-fill ${fillClass}" style="width:${Math.max(0, Math.min(100, bin.fill))}%"></div></div></div><div class="bin-level"><b>${bin.fill}%</b><span class="bin-status ${cls}"><i></i>${statusLabel}</span></div></div>`;
  }).join('');
}
function activityIcon(item) {
  if (item.type === 'Animal alert') return ['activity-animal', '♡'];
  if (item.type === 'Sensor') return ['activity-sensor', '⌁'];
  if (item.type === 'Collection' || item.type === 'Bin status') return ['activity-bin', '▤'];
  return ['activity-report', '☷'];
}
function renderActivity(items) {
  const shown = items.slice(0, 5);
  $('#activityList').innerHTML = shown.map(item => {
    const [iconClass, icon] = activityIcon(item);
    const statusClass = item.status === 'Resolved' ? 'resolved' : item.status === 'Active' ? 'active' : 'open';
    const action = item.status === 'Resolved' ? '<span class="resolved-label">✓ Resolved</span>' : `<button class="resolve-btn" data-resolve="${escapeHTML(item.id)}">Resolve</button>`;
    return `<div class="activity-row"><div class="activity-icon ${iconClass}">${icon}</div><div class="activity-copy"><div class="activity-title">${escapeHTML(item.title)}</div><div class="activity-detail">${escapeHTML(item.detail)}</div><div class="activity-meta"><span>${escapeHTML(item.time)}</span><span class="activity-status ${statusClass}">${escapeHTML(item.status)}</span></div></div><div class="activity-action">${action}</div></div>`;
  }).join('') || '<div class="empty-state">No activity to show.</div>';
  $('#activityList').querySelectorAll('[data-resolve]').forEach(button => button.addEventListener('click', () => resolveActivity(button.dataset.resolve)));
}
function renderComplaints(items) {
  const list = $('#complaintsList');
  if (!items.length) { list.innerHTML = ''; return; }
  list.innerHTML = `<div class="complaint-list-heading">Recent reports <span>${items.length}</span></div>` + items.slice(0, 3).map(item => `<div class="complaint-item"><div><b>${escapeHTML(item.category)}</b><span>${escapeHTML(item.location)} · ${new Date(item.createdAt).toLocaleString()}</span></div><span class="complaint-status">${escapeHTML(item.status)}</span></div>`).join('');
}
function updateMetrics(metrics) {
  fillMetric('#metricBins', metrics.totalBins); fillMetric('#metricCollection', metrics.collectionNeeded); fillMetric('#metricAlerts', metrics.activeAlerts); fillMetric('#metricAnimals', metrics.animalAlerts);
  $('#navBinCount').textContent = metrics.totalBins; $('#navAlertCount').textContent = metrics.activeAlerts;
}
function renderDashboard(data) {
  dashboard = data; updateMetrics(data.metrics); renderBins(data.bins); renderActivity(data.activity); renderComplaints(data.complaints);
}
async function loadDashboard({ quiet = false } = {}) {
  try {
    const response = await fetch('/api/dashboard');
    if (response.status === 401) { window.location.href = '/login.html'; return; }
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Unable to load dashboard.');
    renderDashboard(data); if (!quiet) showToast('Dashboard data refreshed.');
  } catch (error) { showToast(error.message || 'Could not load dashboard data.'); }
}
async function resolveActivity(id) {
  try {
    const response = await fetch(`/api/activity/${encodeURIComponent(id)}/resolve`, { method: 'POST' });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not resolve alert.');
    if (dashboard) { dashboard.activity = data.activity; dashboard.metrics.activeAlerts = data.activity.filter(a => a.status !== 'Resolved').length; dashboard.metrics.animalAlerts = data.activity.filter(a => a.type === 'Animal alert' && a.status !== 'Resolved').length; updateMetrics(dashboard.metrics); renderActivity(dashboard.activity); }
    showToast('Activity marked as resolved.');
  } catch (error) { showToast(error.message); }
}
async function recalculateRoute() {
  const button = $('#recalculateBtn'); button.disabled = true; button.textContent = '↻ Calculating…';
  try {
    const response = await fetch('/api/route/recalculate', { method: 'POST' }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to recalculate route.');
    $('#routeStops').textContent = pad(data.stops.length); $('#routeDistance').innerHTML = `${data.distanceKm} <small>km</small>`; $('#routeTime').innerHTML = `${data.estimatedMinutes} <small>min</small>`;
    $('#routeSteps').innerHTML = data.stops.length ? data.stops.map((bin, i) => `<div class="route-step"><span class="step-number">${i + 1}</span><div><b>${escapeHTML(bin.name)}</b><small>Bin ${escapeHTML(bin.id)} · ${bin.fill}% full</small></div><span class="step-priority">Priority</span></div>`).join('') : '<div class="empty-state">No bins currently need priority collection.</div>';
    showToast('Suggested route updated.');
  } catch (error) { showToast(error.message); }
  finally { button.disabled = false; button.innerHTML = '↻ Recalculate route'; }
}

let selectedWasteImages = [];
const MAX_WASTE_IMAGES = 8;
const MAX_WASTE_IMAGE_BYTES = 8 * 1024 * 1024;

function setupYolo() {
  const form = $('#yoloForm');
  const fileInput = $('#wasteImage');
  if (!form || !fileInput) return;
  const status = $('#yoloStatus');
  const previewWrap = $('#yoloPreviewWrap');
  const previewGrid = $('#yoloPreviewGrid');
  const results = $('#yoloResults');
  const detectButton = $('#yoloDetectBtn');

  fetch('/api/yolo-status').then(r => r.json()).then(data => {
    if (data.ready) {
      status.textContent = 'MIRA ready';
      status.classList.add('ready'); status.classList.remove('missing');
    } else {
      status.textContent = 'Model setup needed';
      status.classList.add('missing'); status.classList.remove('ready');
    }
  }).catch(() => { status.textContent = 'Status unavailable'; });

  fileInput.addEventListener('change', () => {
    selectedWasteImages = [...(fileInput.files || [])];
    if (!selectedWasteImages.length) {
      previewWrap.hidden = true; previewGrid.innerHTML = '';
      results.innerHTML = '<p class="yolo-empty">Choose one or more images to begin.</p>';
      detectButton.disabled = false;
      return;
    }
    if (selectedWasteImages.length > MAX_WASTE_IMAGES) {
      selectedWasteImages = []; fileInput.value = '';
      previewWrap.hidden = true; previewGrid.innerHTML = '';
      results.innerHTML = `<p class="yolo-error">Choose up to ${MAX_WASTE_IMAGES} images at a time.</p>`;
      return;
    }
    const unsupported = selectedWasteImages.find(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type));
    const tooLarge = selectedWasteImages.find(file => file.size > MAX_WASTE_IMAGE_BYTES);
    if (unsupported || tooLarge) {
      const message = unsupported ? `${unsupported.name} is not a supported image. Use JPG, PNG or WebP.` : `${tooLarge.name} is larger than 8 MB. Choose a smaller image.`;
      selectedWasteImages = []; fileInput.value = '';
      previewWrap.hidden = true; previewGrid.innerHTML = '';
      results.innerHTML = `<p class="yolo-error">${escapeHTML(message)}</p>`;
      return;
    }

    previewWrap.hidden = false;
    previewGrid.innerHTML = selectedWasteImages.map((file, index) => `
      <article class="yolo-image-card" id="yolo-card-${index}">
        <div class="yolo-image-heading"><b title="${escapeHTML(file.name)}">${escapeHTML(file.name)}</b><span id="yolo-card-status-${index}" class="yolo-image-status">Ready to analyse</span></div>
        <canvas id="yolo-canvas-${index}" aria-label="${escapeHTML(file.name)} preview with detection boxes"></canvas>
        <div class="yolo-image-results" id="yolo-card-results-${index}"><p class="yolo-empty">Waiting for detection.</p></div>
      </article>`).join('');
    selectedWasteImages.forEach((file, index) => renderWastePreview(file, index));
    results.innerHTML = `<p class="yolo-empty">${selectedWasteImages.length} image${selectedWasteImages.length === 1 ? '' : 's'} selected. Click <b>Detect waste</b> to analyse them one by one.</p>`;
    detectButton.disabled = false;
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!selectedWasteImages.length) {
      results.innerHTML = '<p class="yolo-error">Choose at least one image first.</p>';
      return;
    }

    const files = [...selectedWasteImages];
    detectButton.disabled = true;
    detectButton.textContent = `Analysing 0/${files.length} images…`;
    results.innerHTML = `<p class="yolo-empty">MIRA YOLO11n is analysing ${files.length} image${files.length === 1 ? '' : 's'}. Images are processed sequentially to keep memory use low.</p>`;
    status.textContent = 'Analysing…';
    let completed = 0, failed = 0, totalDetections = 0;
    const categoryTotals = {};

    for (let index = 0; index < files.length; index++) {
      const file = files[index];
      const cardStatus = $(`#yolo-card-status-${index}`);
      const cardResults = $(`#yolo-card-results-${index}`);
      cardStatus.textContent = `Analysing ${index + 1}/${files.length}`;
      cardStatus.classList.remove('done', 'failed');
      cardResults.innerHTML = '<p class="yolo-empty">Running the model…</p>';
      detectButton.textContent = `Analysing ${index + 1}/${files.length} images…`;
      results.innerHTML = `<p class="yolo-empty">Analysing image ${index + 1} of ${files.length}: ${escapeHTML(file.name)}</p>`;

      try {
        const payload = new FormData();
        payload.append('image', file);
        const response = await fetch('/api/detect-waste', { method: 'POST', body: payload });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Image detection failed.');

        const canvas = $(`#yolo-canvas-${index}`);
        const ctx = canvas.getContext('2d');
        const imageBitmap = await createImageBitmap(file);
        const displayScale = Math.min(1, 960 / imageBitmap.width);
        canvas.width = Math.max(1, Math.round(imageBitmap.width * displayScale));
        canvas.height = Math.max(1, Math.round(imageBitmap.height * displayScale));
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(imageBitmap, 0, 0, canvas.width, canvas.height);
        const sx = canvas.width / (data.imageWidth || imageBitmap.width);
        const sy = canvas.height / (data.imageHeight || imageBitmap.height);
        ctx.lineWidth = Math.max(2, canvas.width / 320);
        ctx.font = `bold ${Math.max(12, canvas.width / 38)}px sans-serif`;

        for (const item of data.detections) {
          const x = item.x1 * sx, y = item.y1 * sy;
          const w = Math.max(1, (item.x2 - item.x1) * sx), h = Math.max(1, (item.y2 - item.y1) * sy);
          const label = `${item.label} ${(item.confidence * 100).toFixed(0)}%`;
          const textWidth = ctx.measureText(label).width;
          const labelHeight = Math.max(18, canvas.width / 28);
          ctx.strokeStyle = '#20a35a'; ctx.fillStyle = '#178044'; ctx.strokeRect(x, y, w, h);
          const labelY = Math.max(0, y - labelHeight);
          ctx.fillRect(Math.min(x, Math.max(0, canvas.width - textWidth - 10)), labelY, textWidth + 10, labelHeight);
          ctx.fillStyle = '#fff';
          ctx.fillText(label, Math.min(x + 5, Math.max(5, canvas.width - textWidth - 5)), Math.max(labelHeight - 4, y - 5));
        }
        imageBitmap.close();

        const count = data.detections.length;
        totalDetections += count;
        for (const [name, quantity] of Object.entries(data.summary || {})) categoryTotals[name] = (categoryTotals[name] || 0) + quantity;
        if (!count) {
          cardResults.innerHTML = '<p class="yolo-empty">No objects passed the confidence threshold. Try a clearer photo with the waste item more visible.</p>';
        } else {
          const rows = data.detections.map(item => `<div class="yolo-detection-row"><b>${escapeHTML(item.label)}</b><span class="yolo-confidence">${(item.confidence * 100).toFixed(1)}%</span></div>`).join('');
          const counts = Object.entries(data.summary || {}).map(([name, qty]) => `${escapeHTML(name)}${qty > 1 ? ` × ${qty}` : ''}`).join(', ');
          cardResults.innerHTML = `<div class="yolo-result-title">${count} detection${count === 1 ? '' : 's'} · ${counts}</div>${rows}`;
        }
        cardStatus.textContent = `${count} detected`;
        cardStatus.classList.add('done');
        completed++;
      } catch (error) {
        cardStatus.textContent = 'Failed'; cardStatus.classList.add('failed');
        const suffix = error.message.includes('npm run setup-model') ? '<br>Run <b>npm run setup-model</b> in the project folder with internet access.' : '';
        cardResults.innerHTML = `<p class="yolo-error">${escapeHTML(error.message)}${suffix}</p>`;
        failed++;
        if (/model is not installed|model setup needed/i.test(error.message)) {
          for (let rest = index + 1; rest < files.length; rest++) {
            const restStatus = $(`#yolo-card-status-${rest}`);
            const restResults = $(`#yolo-card-results-${rest}`);
            if (restStatus) { restStatus.textContent = 'Skipped'; restStatus.classList.add('failed'); }
            if (restResults) restResults.innerHTML = '<p class="yolo-empty">Skipped because the model is not installed.</p>';
            failed++;
          }
          break;
        }
      }
    }

    const summaryText = Object.entries(categoryTotals).map(([name, count]) => `${escapeHTML(name)}${count > 1 ? ` × ${count}` : ''}`).join(' · ');
    results.innerHTML = `<div class="yolo-result-title">Batch complete · ${completed}/${files.length} images processed · ${totalDetections} object${totalDetections === 1 ? '' : 's'} detected${failed ? ` · ${failed} failed/skipped` : ''}</div>${summaryText ? `<p class="yolo-batch-summary">${summaryText}</p>` : '<p class="yolo-empty">No detections to summarise.</p>'}<p class="yolo-empty">Model predictions can be wrong. Review the bounding boxes before acting on the result.</p>`;
    status.textContent = failed === files.length ? 'Model unavailable' : 'MIRA ready';
    status.classList.toggle('ready', failed !== files.length);
    status.classList.toggle('missing', failed === files.length);
    detectButton.disabled = false;
    detectButton.textContent = 'Detect waste in selected images';
  });
}

function renderWastePreview(file, index) {
  const canvas = $(`#yolo-canvas-${index}`);
  const url = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    if (canvas) {
      const scale = Math.min(1, 960 / image.naturalWidth);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
    }
    URL.revokeObjectURL(url);
  };
  image.onerror = () => URL.revokeObjectURL(url);
  image.src = url;
}

async function classifyWaste(event) {
  event.preventDefault(); const input = $('#wasteItem'); const result = $('#classificationResult');
  result.innerHTML = '<div class="result-placeholder"><span>…</span><p>Checking the demo guidance…</p></div>';
  try {
    const response = await fetch('/api/classify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: input.value }) }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Unable to classify item.');
    const special = data.category === 'Special handling';
    result.innerHTML = `<div class="result-card ${special ? 'result-warning' : ''}"><span class="result-kicker">SUGGESTED CATEGORY</span><b class="result-category">${escapeHTML(data.category)}</b><p>${escapeHTML(data.advice)}</p><span class="result-demo">✳ Rule-based demo</span></div>`;
  } catch (error) { result.innerHTML = `<p class="inline-error">${escapeHTML(error.message)}</p>`; }
}
async function submitComplaint(event) {
  event.preventDefault(); const form = event.currentTarget; const message = $('#complaintMessage'); const button = form.querySelector('button[type="submit"]');
  message.textContent = ''; message.className = 'form-message'; button.disabled = true; button.textContent = 'Submitting…';
  const payload = Object.fromEntries(new FormData(form).entries());
  try {
    const response = await fetch('/api/complaints', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }); const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Could not submit report.');
    message.textContent = `Report ${data.complaint.id} submitted successfully.`; message.classList.add('success'); form.reset(); await loadDashboard({ quiet: true }); showToast('Thank you for helping your community.');
  } catch (error) { message.textContent = error.message; message.classList.add('error'); }
  finally { button.disabled = false; button.innerHTML = 'Submit report <span>↗</span>'; }
}
async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } finally { window.location.href = '/login.html'; }
}
function setupNavigation() {
  $$('.nav-link').forEach(link => link.addEventListener('click', () => {
    $$('.nav-link').forEach(item => item.classList.remove('active')); link.classList.add('active'); $('#sidebar').classList.remove('sidebar-open');
  }));
  $('#menuBtn').addEventListener('click', () => $('#sidebar').classList.toggle('sidebar-open'));
  $('#dismissNotice').addEventListener('click', () => $('.notice-bar').remove());
  $('#refreshBtn').addEventListener('click', () => loadDashboard());
  $('#exportBtn').addEventListener('click', () => { window.location.href = '/api/export.csv'; });
  $('#recalculateBtn').addEventListener('click', recalculateRoute);
  $('#classifyForm').addEventListener('submit', classifyWaste);
  $('#complaintForm').addEventListener('submit', submitComplaint);
  $('#logoutBtn').addEventListener('click', logout);
  $('#showAllActivity').addEventListener('click', event => { event.preventDefault(); if (dashboard) { $('#activityList').innerHTML = dashboard.activity.map(item => { const [iconClass, icon] = activityIcon(item); const statusClass = item.status === 'Resolved' ? 'resolved' : item.status === 'Active' ? 'active' : 'open'; return `<div class="activity-row"><div class="activity-icon ${iconClass}">${icon}</div><div class="activity-copy"><div class="activity-title">${escapeHTML(item.title)}</div><div class="activity-detail">${escapeHTML(item.detail)}</div><div class="activity-meta"><span>${escapeHTML(item.time)}</span><span class="activity-status ${statusClass}">${escapeHTML(item.status)}</span></div></div>${item.status === 'Resolved' ? '' : `<div class="activity-action"><button class="resolve-btn" data-resolve="${escapeHTML(item.id)}">Resolve</button></div>`}</div>`; }).join(''); $('#activityList').querySelectorAll('[data-resolve]').forEach(button => button.addEventListener('click', () => resolveActivity(button.dataset.resolve))); } });
}
(async function init() {
  formatDate(); setupNavigation(); setupYolo();
  try { const response = await fetch('/api/session'); const data = await response.json(); if (!data.authenticated) { window.location.href = '/login.html'; return; } if (data.user) { $('#userName').textContent = data.user.name; $('#welcomeName').textContent = data.user.name.split(' ')[0]; } }
  catch { window.location.href = '/login.html'; return; }
  await loadDashboard({ quiet: true });
})();
