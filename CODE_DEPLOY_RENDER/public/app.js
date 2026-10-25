/**
 * Phòng IoT - Smart Room Dashboard Client
 * Local-first, zero-dependency, modern UI controller
 */
const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

// App State
let state = null;
let historyData = [];
let chartDevice = null;
let stream = null;
let toastTimer = null;
let historyPage = 1;
const HISTORY_PAGE_SIZE = 15;

// Chart series visibility
const activeSeries = {
  temperature: true,
  humidity: true,
  airQuality: true,
  light: true
};

const SERIES_INFO = {
  temperature: { label: 'Nhiệt độ', unit: '°C', color: '#e88b57', max: 60 },
  humidity: { label: 'Độ ẩm', unit: '%', color: '#6b9ce4', max: 100 },
  airQuality: { label: 'Chỉ số khí', unit: 'điểm', color: '#9880d8', max: 100 },
  light: { label: 'Ánh sáng', unit: '%', color: '#c69a3f', max: 100 }
};

// UI Notifications
function toast(text) {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 4500);
}

// Safe API caller
async function api(url, data) {
  const opts = data === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  };
  const res = await fetch(url, opts);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && $('login')) $('login').classList.remove('hidden');
    throw new Error(json.error || `Lỗi máy chủ (${res.status})`);
  }
  return json;
}

const settings = async patch => {
  const p = await api('/api/settings', patch);
  render(p);
  return p;
};

function guard(fn) {
  return async e => {
    try {
      await fn(e);
    } catch (err) {
      toast(err.message || 'Có lỗi xảy ra');
    }
  };
}

// -------------------------------------------------------------
// Gauge Component with Needle (Kim xoay)
// -------------------------------------------------------------
function drawGauge(id, value, max, color) {
  const canvas = $(id);
  if (!canvas) return;

  const width = canvas.clientWidth || 180;
  const height = canvas.clientHeight || 75;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const cx = width / 2;
  const cy = height - 8;
  const radius = Math.min(width * 0.44, height - 12);
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

  // 1. Background Arc (Track)
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(cx, cy, radius, Math.PI, Math.PI * 2);
  ctx.strokeStyle = isDark ? '#262c40' : '#e9edf5';
  ctx.stroke();

  // 2. Value Arc (Filled progress)
  const fraction = value !== null && value !== undefined 
    ? Math.max(0, Math.min(1, Number(value) / max)) 
    : 0;

  if (value !== null && value !== undefined) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI, Math.PI + fraction * Math.PI);
    ctx.strokeStyle = color;
    ctx.stroke();
  }

  // 3. Ticks
  ctx.lineWidth = 1.2;
  for (let i = 0; i <= 4; i++) {
    const angle = Math.PI + (i * Math.PI) / 4;
    const innerR = radius - 7;
    const outerR = radius - 12;
    ctx.beginPath();
    ctx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
    ctx.lineTo(cx + outerR * Math.cos(angle), cy + outerR * Math.sin(angle));
    ctx.strokeStyle = isDark ? '#434b66' : '#c8cfdf';
    ctx.stroke();
  }

  // 4. Needle (Kim xoay)
  if (value !== null && value !== undefined) {
    const needleAngle = Math.PI + fraction * Math.PI;
    const needleLen = radius - 5;
    const needleColor = isDark ? '#f0f3fa' : '#262940';

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(needleAngle);

    // Needle blade
    ctx.beginPath();
    ctx.moveTo(0, -2);
    ctx.lineTo(needleLen, 0);
    ctx.lineTo(0, 2);
    ctx.closePath();
    ctx.fillStyle = needleColor;
    ctx.fill();

    // Center pivot
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#1a1d2d' : '#ffffff';
    ctx.fill();

    ctx.restore();
  } else {
    // Center point placeholder when offline
    ctx.beginPath();
    ctx.arc(cx, cy, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = isDark ? '#434b66' : '#c8cfdf';
    ctx.fill();
  }
}

// -------------------------------------------------------------
// Interactive History Chart
// -------------------------------------------------------------
function drawChart() {
  const canvas = $('history-chart');
  if (!canvas || !canvas.clientWidth) return;

  const w = canvas.clientWidth;
  const h = canvas.clientHeight || 200;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const padLeft = 36;
  const padRight = 16;
  const padTop = 16;
  const padBottom = 26;
  const pw = w - padLeft - padRight;
  const ph = h - padTop - padBottom;

  // Grid lines
  ctx.font = '10px Inter, Segoe UI, sans-serif';
  for (let v = 0; v <= 100; v += 25) {
    const y = padTop + ph * (1 - v / 100);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(w - padRight, y);
    ctx.strokeStyle = isDark ? '#22273b' : '#edf0f7';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
    ctx.textAlign = 'right';
    ctx.fillText(v, padLeft - 6, y + 3.5);
  }

  if (!historyData.length) {
    ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
    ctx.textAlign = 'center';
    ctx.fillText('Đang thu thập dữ liệu cảm biến…', w / 2, h / 2);
    return;
  }

  const firstTime = Date.parse(historyData[0].at);
  const lastTime = Date.parse(historyData[historyData.length - 1].at);
  const timeSpan = Math.max(10000, lastTime - firstTime);

  // Draw each active series
  for (const [key, info] of Object.entries(SERIES_INFO)) {
    if (!activeSeries[key]) continue;

    ctx.beginPath();
    ctx.strokeStyle = info.color;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    let started = false;
    for (const point of historyData) {
      const val = point[key];
      if (val === null || val === undefined) {
        started = false;
        continue;
      }
      const ptTime = Date.parse(point.at);
      const x = padLeft + ((ptTime - firstTime) / timeSpan) * pw;
      const fraction = Math.max(0, Math.min(1, val / info.max));
      const y = padTop + ph * (1 - fraction);

      if (started) {
        ctx.lineTo(x, y);
      } else {
        ctx.moveTo(x, y);
        started = true;
      }
    }
    ctx.stroke();

    // If only 1 point, draw a dot
    if (historyData.length === 1 && historyData[0][key] != null) {
      const fraction = Math.max(0, Math.min(1, historyData[0][key] / info.max));
      ctx.beginPath();
      ctx.arc(padLeft, padTop + ph * (1 - fraction), 3, 0, Math.PI * 2);
      ctx.fillStyle = info.color;
      ctx.fill();
    }
  }

  // Time labels
  ctx.fillStyle = isDark ? '#6b7280' : '#9ca3af';
  ctx.textAlign = 'left';
  ctx.fillText(new Date(firstTime).toLocaleTimeString('vi-VN'), padLeft, h - 8);
  ctx.textAlign = 'right';
  ctx.fillText(new Date(lastTime).toLocaleTimeString('vi-VN'), w - padRight, h - 8);
}

// -------------------------------------------------------------
// History Tab & Pagination
// -------------------------------------------------------------
function renderHistoryTable() {
  const tbody = $('history-rows');
  const label = $('history-page-label');
  const prevBtn = $('history-prev');
  const nextBtn = $('history-next');
  const summaryEl = $('history-summary');
  if (!tbody) return;

  const period = $('history-period')?.value || '24';
  const now = Date.now();
  const maxAge = period === 'all' ? Infinity : Number(period) * 3600000;

  const filtered = historyData.filter(r => (now - Date.parse(r.at)) <= maxAge);
  const total = filtered.length;
  const maxPage = Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE));

  if (historyPage > maxPage) historyPage = maxPage;
  if (historyPage < 1) historyPage = 1;

  if (summaryEl) {
    summaryEl.textContent = `${total} bản ghi (${period === 'all' ? 'Toàn bộ' : period + ' giờ gần nhất'})`;
  }
  if (label) {
    label.textContent = `Trang ${historyPage} / ${maxPage} (${total} bản ghi)`;
  }
  if (prevBtn) prevBtn.disabled = historyPage <= 1;
  if (nextBtn) nextBtn.disabled = historyPage >= maxPage;

  tbody.innerHTML = '';
  if (!total) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:24px;color:var(--muted)">Không có dữ liệu trong khoảng thời gian đã chọn</td></tr>';
    return;
  }

  const startIdx = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const pageRows = filtered.slice().reverse().slice(startIdx, startIdx + HISTORY_PAGE_SIZE);

  pageRows.forEach(row => {
    const tr = document.createElement('tr');
    const timeStr = new Date(row.at).toLocaleString('vi-VN', { hour12: false });
    const tempStr = row.temperature != null ? Number(row.temperature).toFixed(1) : '--';
    const humStr = row.humidity != null ? Number(row.humidity).toFixed(1) : '--';
    const airStr = row.airQuality != null ? Number(row.airQuality).toFixed(0) : '--';
    const lightStr = row.light != null ? Number(row.light).toFixed(0) : '--';
    const motionStr = row.motion === 1 || row.motion === true ? 'Có' : (row.motion === 0 || row.motion === false ? 'Không' : '--');

    tr.innerHTML = `
      <td>${timeStr}</td>
      <td><b>${tempStr}</b></td>
      <td>${humStr}</td>
      <td>${airStr}</td>
      <td>${lightStr}</td>
      <td><span class="badge ${motionStr === 'Có' ? 'purple' : 'neutral'}">${motionStr}</span></td>
    `;
    tbody.appendChild(tr);
  });
}

// -------------------------------------------------------------
// Devices Tab Grid
// -------------------------------------------------------------
function renderDevicesGrid(p) {
  const container = $('device-list');
  if (!container) return;

  container.innerHTML = '';
  const devList = p.devices || [p.device];

  devList.forEach(dev => {
    const isCurrent = dev.id === p.device.id;
    const roomName = dev.id.endsWith('02') ? 'Phòng khách (Node 02)' : 'Phòng ngủ (Node 01)';
    const card = document.createElement('div');
    card.className = `device-card ${isCurrent ? 'current-device' : ''}`;

    const lastTime = dev.at ? new Date(dev.at).toLocaleTimeString('vi-VN') : 'Chưa có dữ liệu';
    const isOnline = Boolean(dev.online);

    card.innerHTML = `
      <div class="badge ${isOnline ? 'online' : 'offline'}">${isOnline ? '● Đang kết nối' : '○ Ngoại tuyến'}</div>
      <h3>${roomName}</h3>
      <p><strong>Thiết bị:</strong> <code>${dev.id}</code> ${isCurrent ? '<span class="badge neutral">Đang chọn</span>' : ''}</p>
      <p><strong>Cập nhật cuối:</strong> ${lastTime}</p>
      <p><strong>Cảm biến:</strong> ${dev.temperature != null ? dev.temperature + ' °C' : '--'} · ${dev.humidity != null ? dev.humidity + ' %' : '--'} · Khí: ${dev.airQuality != null ? dev.airQuality : '--'} · Sáng: ${dev.light != null ? dev.light + '%' : '--'}</p>
      <p><strong>Thiết bị ra:</strong> Quạt: ${dev.fan ? 'BẬT' : 'TẮT'} · Đèn: ${dev.led ? 'BẬT' : 'TẮT'} · Còi: ${dev.buzzer ? 'BẬT' : 'TẮT'}</p>
      <button class="button ${isCurrent ? 'outline' : ''}" style="margin-top:12px;width:100%" data-select-dev="${dev.id}">
        ${isCurrent ? 'Đang xem phòng này' : 'Chuyển sang xem phòng này'}
      </button>
      <code>Topic: iot/${dev.id}/#</code>
    `;

    const selectBtn = card.querySelector('[data-select-dev]');
    if (selectBtn && !isCurrent) {
      selectBtn.onclick = guard(async () => {
        await settings({ hardwareId: dev.id });
        switchPage('dashboard');
        toast(`Đã chuyển sang ${roomName}`);
      });
    }

    container.appendChild(card);
  });
}

// -------------------------------------------------------------
// Calculate and update trend indicators
// -------------------------------------------------------------
function updateTrend(key, currentVal) {
  const el = $('trend-' + key);
  if (!el) return;

  if (currentVal == null || historyData.length < 2) {
    el.textContent = '—';
    el.className = 'trend';
    return;
  }

  const prev = historyData[historyData.length - 2]?.[key];
  if (prev == null) {
    el.textContent = '—';
    el.className = 'trend';
    return;
  }

  const diff = Number(currentVal) - Number(prev);
  if (Math.abs(diff) < 0.1) {
    el.textContent = '→ Ổn định';
    el.className = 'trend';
  } else if (diff > 0) {
    el.textContent = `↑ +${diff.toFixed(1)}`;
    el.className = 'trend up';
  } else {
    el.textContent = `↓ ${diff.toFixed(1)}`;
    el.className = 'trend down';
  }
}

// -------------------------------------------------------------
// Main Render Function
// -------------------------------------------------------------
function render(p) {
  const previous = state;
  state = p;

  // Stop loading skeleton
  document.body.classList.remove('loading');
  if ($('login')) $('login').classList.add('hidden');

  const d = p.device || {};
  const s = p.settings || {};
  const isOnline = Boolean(d.online);

  // 1. Header & Date
  const dateEl = $('current-date');
  if (dateEl) {
    dateEl.textContent = new Date().toLocaleDateString('vi-VN', {
      weekday: 'long',
      day: 'numeric',
      month: 'numeric',
      year: 'numeric'
    }).toUpperCase();
  }

  // Broker status badge
  const brokerBadge = $('broker-status');
  if (brokerBadge) {
    brokerBadge.textContent = p.broker?.ready ? `MQTT :${p.broker.port} (Sẵn sàng)` : 'MQTT Ngắt';
    brokerBadge.className = `badge ${p.broker?.ready ? 'online' : 'offline'}`;
  }

  // 2. Room Overview Hero
  const roomNameEl = $('room-name');
  if (roomNameEl) {
    roomNameEl.textContent = d.id?.endsWith('02') ? 'Phòng khách · 02' : 'Phòng ngủ · 01';
  }

  const connEl = $('connection');
  if (connEl) {
    connEl.textContent = isOnline ? '● Thiết bị trực tuyến' : '○ Thiết bị ngoại tuyến';
    connEl.className = `hero-pill ${isOnline ? 'online' : 'offline'}`;
  }

  const motionEl = $('motion-state');
  if (motionEl) {
    motionEl.textContent = d.motion === 1 || d.motion === true 
      ? 'PIR: Có chuyển động' 
      : (d.motion === 0 || d.motion === false ? 'PIR: Yên tĩnh' : 'PIR: Chờ dữ liệu');
    motionEl.className = `hero-pill ${d.motion ? 'purple' : ''}`;
  }

  const onlineCountEl = $('online-count');
  const totalCountEl = $('total-count');
  if (onlineCountEl && totalCountEl && p.devices) {
    const onCount = p.devices.filter(x => x.online).length;
    onlineCountEl.textContent = onCount;
    totalCountEl.textContent = p.devices.length;
  }

  const roomModeEl = $('room-mode');
  if (roomModeEl) {
    roomModeEl.textContent = s.mode === 'auto' 
      ? 'Chế độ Tự động · Tự điều chỉnh thông gió & chiếu sáng' 
      : 'Chế độ Thủ công · Người dùng trực tiếp điều khiển tải';
  }

  // 3. Workspace / Source bar
  if ($('source-sim')) $('source-sim').classList.toggle('selected', s.source === 'simulation');
  if ($('source-hw')) $('source-hw').classList.toggle('selected', s.source === 'hardware');
  if ($('device-select')) $('device-select').value = s.hardwareId || 'esp32-room-01';
  if ($('control-mode')) $('control-mode').value = s.mode || 'auto';

  const lastUpEl = $('last-update');
  if (lastUpEl) {
    lastUpEl.textContent = d.at ? `Cập nhật lúc ${new Date(d.at).toLocaleTimeString('vi-VN')}` : 'Chưa có dữ liệu cảm biến';
  }

  const bannerEl = $('source-banner');
  if (bannerEl) {
    bannerEl.textContent = s.source === 'simulation'
      ? 'DỮ LIỆU MÔ PHỎNG · Hai node MQTT độc lập, dữ liệu tạo tự động để kiểm thử chức năng.'
      : d.synthetic
      ? 'ESP32 THẬT / CẢM BIẾN GIẢ · Board đang gửi dữ liệu demo qua Wi-Fi/USB, chưa gắn sensor.'
      : 'ESP32 THẬT · Đang cập nhật giá trị thực tế đo từ chân cảm biến.';
  }

  // 4. Metric KPI Cards & Gauges
  for (const [key, info] of Object.entries(SERIES_INFO)) {
    const valEl = $(key);
    const val = d[key];
    if (valEl) {
      valEl.textContent = val !== null && val !== undefined ? Number(val).toFixed(1) : '--';
    }
    drawGauge('gauge-' + key, val, info.max, info.color);
    updateTrend(key, val);

    // Warning highlight on card
    const card = valEl?.closest('.metric');
    if (card) {
      let isWarning = false;
      if (key === 'temperature' && val >= s.onTemperature) isWarning = true;
      if (key === 'humidity' && val >= s.humidityAlert) isWarning = true;
      if (key === 'airQuality' && val >= s.airQualityOn) isWarning = true;
      card.classList.toggle('warning', isWarning);
    }
  }

  // 5. Actuators & Controls (Fan, Buzzer, LED)
  const actDefs = [
    { key: 'fan', name: 'Quạt thông gió', rule: `≥ ${s.onTemperature} °C bật, < ${s.offTemperature} °C tắt` },
    { key: 'led', name: 'Đèn phòng', rule: `≤ ${s.lightOn}% sáng & có người thì bật` },
    { key: 'buzzer', name: 'Còi cảnh báo', rule: `≥ ${s.airQualityOn} điểm khí thì kêu (tối đa 10s)` }
  ];

  actDefs.forEach(({ key, rule }) => {
    const btn = $(key + '-toggle');
    const stateText = $(key + '-state');
    const isActOn = Boolean(d[key]);

    if (btn) {
      btn.classList.toggle('on', isActOn);
      btn.setAttribute('aria-pressed', String(isActOn));
      btn.disabled = s.mode === 'auto' || !isOnline;
    }

    if (stateText) {
      if (!isOnline) {
        stateText.textContent = 'Thiết bị ngoại tuyến';
      } else if (d[key] === null) {
        stateText.textContent = 'Chờ xác nhận';
      } else if (key === 'buzzer' && d.buzzerLockout) {
        stateText.textContent = 'Đã khóa tự ngắt (10s)';
      } else {
        stateText.textContent = isActOn ? 'Đang BẬT' : 'Đang TẮT';
      }
    }
  });

  const hintEl = $('control-hint');
  if (hintEl) {
    hintEl.textContent = s.mode === 'auto'
      ? `Tự động: Quạt (${s.onTemperature} °C) · Còi (${s.airQualityOn} khí) · Đèn (≤${s.lightOn}% + PIR)`
      : 'Thủ công: Bạn trực tiếp bấm Bật/Tắt các thiết bị phía trên.';
  }

  const ackEl = $('ack');
  if (ackEl) {
    if (d.acknowledged) {
      ackEl.textContent = `✓ Đã xác nhận lệnh phản hồi (ID: ${d.lastCommand ? d.lastCommand.slice(0, 8) : 'ACK'})`;
    } else if (d.lastSent && Date.now() - d.lastSent < 5000) {
      ackEl.textContent = '⏳ Đang chờ thiết bị phản hồi lệnh…';
    } else {
      ackEl.textContent = 'Trạng thái theo phản hồi từ thiết bị.';
    }
  }

  // 6. Overall Alert Condition
  const alertBox = $('alert-box');
  if (alertBox) {
    if (d.alert) {
      alertBox.textContent = `⚠️ CẢNH BÁO: Môi trường vượt ngưỡng (Nhiệt độ: ${d.temperature}°C / Độ ẩm: ${d.humidity}% / Khí: ${d.airQuality}). Hệ thống tự động xử lý.`;
      alertBox.className = 'alert-box warning';
    } else {
      alertBox.textContent = '✓ Mọi điều kiện phòng ở đang trong ngưỡng an toàn, dễ chịu.';
      alertBox.className = 'alert-box';
    }
  }

  // 7. Scenarios & Simulator Controls
  if ($('sim-temp') && d.temperature != null && s.source === 'simulation') $('sim-temp').value = d.temperature;
  if ($('sim-hum') && d.humidity != null && s.source === 'simulation') $('sim-hum').value = d.humidity;
  if ($('sim-airQuality') && d.airQuality != null && s.source === 'simulation') $('sim-airQuality').value = d.airQuality;
  if ($('sim-light') && d.light != null && s.source === 'simulation') $('sim-light').value = d.light;
  if ($('sim-motion') && d.motion !== null && s.source === 'simulation') $('sim-motion').value = String(Boolean(d.motion));

  const simOffBtn = $('sim-offline');
  if (simOffBtn) {
    simOffBtn.disabled = s.source !== 'simulation';
    simOffBtn.textContent = p.simulator?.enabled ? 'Tạm ngắt node mô phỏng' : 'Kết nối lại node mô phỏng';
  }

  // 8. Event log list
  const eventList = $('event-list');
  if (eventList && p.events?.length) {
    eventList.innerHTML = p.events.map(ev => {
      const timeStr = new Date(ev.at).toLocaleTimeString('vi-VN');
      return `<li><span class="muted">${timeStr}</span> <b>[${ev.kind}]</b> ${ev.message}</li>`;
    }).join('');
  }

  // 9. Sync Rules Form values
  const rulesForm = $('rules-form');
  if (rulesForm && !rulesForm.matches(':focus-within')) {
    for (const [key, val] of Object.entries(s)) {
      if (rulesForm.elements[key]) rulesForm.elements[key].value = val;
    }
  }

  // 10. Update Devices Tab & History Tab
  renderDevicesGrid(p);

  // 11. History Stream / Chart Update
  if (chartDevice !== d.id) {
    chartDevice = d.id;
    historyData = [];
    api('/api/history').then(rows => {
      if (state?.device?.id === d.id) {
        historyData = rows;
        drawChart();
        renderHistoryTable();
        if ($('sample-count')) $('sample-count').textContent = `${rows.length} bản ghi`;
      }
    }).catch(err => toast(err.message));
  } else if (d.at && d.at !== previous?.device?.at) {
    historyData.push({
      at: d.at,
      temperature: d.temperature,
      humidity: d.humidity,
      airQuality: d.airQuality,
      light: d.light,
      motion: d.motion
    });
    historyData = historyData.slice(-1000);
    drawChart();
    renderHistoryTable();
    if ($('sample-count')) $('sample-count').textContent = `${historyData.length} bản ghi`;
  }
}

// -------------------------------------------------------------
// Navigation Tabs
// -------------------------------------------------------------
function switchPage(pageName) {
  const pages = $$('.page');
  const navBtns = $$('.nav');

  pages.forEach(p => p.classList.add('hidden'));
  const targetPage = $('page-' + pageName);
  if (targetPage) targetPage.classList.remove('hidden');

  navBtns.forEach(b => {
    const active = b.dataset.page === pageName;
    b.classList.toggle('active', active);
    b.setAttribute('aria-current', active ? 'page' : 'false');
  });

  const titles = {
    dashboard: { title: 'Tổng quan phòng ở', sub: 'Một góc nhìn cho mọi điều kiện trong phòng.' },
    devices: { title: 'Các nút trong hệ thống', sub: 'Lịch sử và trạng thái kết nối độc lập từng phòng.' },
    history: { title: 'Lịch sử môi trường', sub: 'Dữ liệu được lưu trữ trực tiếp trên SQLite của laptop.' },
    rules: { title: 'Quy tắc tự động hóa', sub: 'Để căn phòng tự chăm sóc mình một cách thông minh.' },
    config: { title: 'Cấu hình hệ thống', sub: 'Kết nối Wi-Fi, xem thông số MQTT và mã bảo mật.' },
    guide: { title: 'Linh kiện & đồ án', sub: 'Hướng dẫn đấu nối phần cứng và lộ trình nâng cấp.' }
  };

  if (titles[pageName]) {
    if ($('page-title')) $('page-title').innerHTML = titles[pageName].title + '<span class="title-dot">.</span>';
    if ($('page-subtitle')) $('page-subtitle').textContent = titles[pageName].sub;
  }

  if (pageName === 'dashboard') {
    drawChart();
    if (state) render(state);
  }
  if (pageName === 'history') {
    renderHistoryTable();
  }
  if (pageName === 'config') {
    loadWifiSetup().catch(err => toast(err.message));
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -------------------------------------------------------------
// Theme Management (Light / Dark)
// -------------------------------------------------------------
function initTheme() {
  const saved = localStorage.getItem('iot-theme') || 
    (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', saved);
  updateThemeIcon(saved);

  const btn = $('theme-toggle');
  if (btn) {
    btn.onclick = () => {
      const cur = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
      const next = cur === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('iot-theme', next);
      updateThemeIcon(next);
      if (state) render(state);
      drawChart();
    };
  }
}

function updateThemeIcon(theme) {
  const btn = $('theme-toggle');
  if (!btn) return;
  const useEl = btn.querySelector('use');
  if (useEl) {
    useEl.setAttribute('href', theme === 'dark' ? '#i-sun' : '#i-moon');
  }
}

// -------------------------------------------------------------
// SSE Realtime Connection
// -------------------------------------------------------------
function connect() {
  if (stream) stream.close();
  stream = new EventSource('/api/events');

  stream.onmessage = e => {
    try {
      render(JSON.parse(e.data));
      if ($('notice')) $('notice').classList.add('hidden');
    } catch (err) {
      toast(err.message);
    }
  };

  stream.onerror = () => {
    if ($('notice')) {
      $('notice').textContent = 'Đang kết nối lại máy chủ. Dữ liệu trên màn hình có thể đã cũ.';
      $('notice').classList.remove('hidden');
    }
    const conn = $('connection');
    if (conn) {
      conn.textContent = '○ Mất kết nối máy chủ';
      conn.className = 'hero-pill offline';
    }
    ['fan', 'buzzer', 'led'].forEach(key => {
      const b = $(key + '-toggle');
      if (b) b.disabled = true;
    });
  };
}

// -------------------------------------------------------------
// Wi-Fi Setup Loader
// -------------------------------------------------------------
async function loadWifiSetup() {
  const p = await api('/api/setup');
  if ($('wifi-ssid') && !$('wifi-ssid').value) $('wifi-ssid').value = p.ssid || '';
  if ($('wifi-broker') && !$('wifi-broker').value) $('wifi-broker').value = p.addresses?.[0] || '';
  if ($('wifi-com') && p.ports?.length) {
    $('wifi-com').value = p.ports.includes('COM16') ? 'COM16' : p.ports[0];
  }
}

// -------------------------------------------------------------
// Event Listeners Initialization
// -------------------------------------------------------------
function initEvents() {
  // Navigation clicks
  $$('.nav').forEach(b => {
    b.addEventListener('click', () => switchPage(b.dataset.page));
  });

  // Inline "Xem lịch sử" link
  $$('[data-go="history"]').forEach(btn => {
    btn.addEventListener('click', () => switchPage('history'));
  });

  // Source selection buttons
  if ($('source-sim')) $('source-sim').onclick = guard(() => settings({ source: 'simulation' }));
  if ($('source-hw')) $('source-hw').onclick = guard(() => settings({ source: 'hardware' }));

  // Room / Device selector
  if ($('device-select')) {
    $('device-select').onchange = guard(e => settings({ hardwareId: e.target.value }));
  }

  // Mode selector
  if ($('control-mode')) {
    $('control-mode').onchange = guard(e => settings({ mode: e.target.value }));
  }

  // Actuator toggles (Fan, Buzzer, LED)
  const toggles = [
    { id: 'fan-toggle', field: 'manualFan', key: 'fan' },
    { id: 'buzzer-toggle', field: 'manualBuzzer', key: 'buzzer' },
    { id: 'led-toggle', field: 'led', key: 'led' }
  ];

  toggles.forEach(({ id, field, key }) => {
    const el = $(id);
    if (el) {
      el.onclick = guard(async () => {
        if (!state?.device) return;
        const curVal = Boolean(state.device[key]);
        await settings({ [field]: !curVal });
      });
    }
  });

  // Chart legend toggles
  $$('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const series = item.dataset.series;
      if (!series) return;
      activeSeries[series] = !activeSeries[series];
      item.classList.toggle('enabled', activeSeries[series]);
      item.setAttribute('aria-pressed', String(activeSeries[series]));
      drawChart();
    });
  });

  // Demo Scenarios
  $$('[data-scenario]').forEach(btn => {
    btn.onclick = guard(async () => {
      await api('/api/simulator', { enabled: true, scenario: btn.dataset.scenario });
      toast(`Đã kích hoạt kịch bản: ${btn.textContent.trim()}`);
    });
  });

  // Custom Simulator Form
  if ($('sim-form')) {
    $('sim-form').onsubmit = guard(async e => {
      e.preventDefault();
      await api('/api/simulator', {
        enabled: true,
        scenario: 'custom',
        temperature: Number($('sim-temp').value),
        humidity: Number($('sim-hum').value),
        airQuality: Number($('sim-airQuality').value),
        light: Number($('sim-light').value),
        motion: $('sim-motion').value === 'true'
      });
      toast('Đã gửi thông số mô phỏng qua MQTT');
    });
  }

  // Simulator Toggle Button
  if ($('sim-offline')) {
    $('sim-offline').onclick = guard(async () => {
      if (!state?.simulator) return;
      await api('/api/simulator', { enabled: !state.simulator.enabled });
      toast(state.simulator.enabled ? 'Đã tạm ngắt cảm biến' : 'Đã kết nối lại cảm biến');
    });
  }

  // Rules Form Submission
  if ($('rules-form')) {
    $('rules-form').onsubmit = guard(async e => {
      e.preventDefault();
      const payload = Object.fromEntries(
        [...new FormData(e.target)].map(([k, v]) => [k, Number(v)])
      );
      await settings(payload);
      toast('Đã cập nhật ngưỡng tự động hóa');
    });
  }

  // History Pagination & Period Filter
  if ($('history-period')) {
    $('history-period').onchange = () => {
      historyPage = 1;
      renderHistoryTable();
    };
  }
  if ($('history-refresh')) {
    $('history-refresh').onclick = guard(async () => {
      historyData = await api('/api/history');
      renderHistoryTable();
      drawChart();
      toast('Đã làm mới dữ liệu lịch sử');
    });
  }
  if ($('history-prev')) {
    $('history-prev').onclick = () => {
      if (historyPage > 1) {
        historyPage--;
        renderHistoryTable();
      }
    };
  }
  if ($('history-next')) {
    $('history-next').onclick = () => {
      historyPage++;
      renderHistoryTable();
    };
  }

  // CSV Export
  if ($('export')) {
    $('export').onclick = () => window.location.assign('/api/export');
  }

  // Reveal Secrets
  if ($('reveal-secrets')) {
    $('reveal-secrets').onclick = guard(async () => {
      const p = await api('/api/setup');
      const details = $('setup-details');
      if (!details) return;
      details.replaceChildren();
      const map = {
        'IP laptop (Gateway)': p.addresses?.join(', ') || '127.0.0.1',
        'Cổng MQTT': p.mqttPort,
        'MQTT Username': p.username,
        'MQTT Password': p.password,
        'Mã truy cập Web/App': p.accessToken,
        'Mở trên điện thoại': p.addresses?.map(x => `http://${x}:${p.port}`).join(' | ') || 'localhost'
      };
      for (const [k, v] of Object.entries(map)) {
        const dt = document.createElement('dt');
        dt.textContent = k;
        const dd = document.createElement('dd');
        dd.textContent = String(v);
        details.append(dt, dd);
      }
      toast('Đã hiển thị thông tin máy chủ');
    });
  }

  // Wi-Fi USB Provisioning Form
  if ($('wifi-form')) {
    $('wifi-form').onsubmit = guard(async e => {
      e.preventDefault();
      const submitBtn = $('wifi-submit');
      const resultEl = $('wifi-result');
      if (submitBtn) submitBtn.disabled = true;
      if (resultEl) resultEl.textContent = 'Đang gửi cấu hình qua cổng USB…';

      try {
        const p = await api('/api/provision', {
          ssid: $('wifi-ssid').value,
          password: $('wifi-pass').value,
          broker: $('wifi-broker').value.trim(),
          port: $('wifi-com').value.trim().toUpperCase(),
          deviceId: $('wifi-device').value
        });
        if ($('wifi-pass')) $('wifi-pass').value = '';
        if (resultEl) resultEl.textContent = p.message || 'Cấu hình thành công';
        toast(p.message || 'Cấu hình Wi-Fi hoàn tất');
      } catch (err) {
        if (resultEl) resultEl.textContent = err.message;
        throw err;
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Password / Token visibility toggle
  if ($('show-token')) {
    $('show-token').onclick = () => {
      const input = $('access-token');
      if (!input) return;
      const isPwd = input.type === 'password';
      input.type = isPwd ? 'text' : 'password';
      $('show-token').textContent = isPwd ? 'Ẩn' : 'Hiện';
    };
  }

  // Login Form
  if ($('login-form')) {
    $('login-form').onsubmit = guard(async e => {
      e.preventDefault();
      await api('/api/login', { token: $('access-token').value.trim() });
      if ($('access-token')) $('access-token').value = '';
      render(await api('/api/status'));
      connect();
      toast('Đăng nhập thành công');
    });
  }

  // Responsive redraw on window resize
  window.addEventListener('resize', () => {
    if (state) render(state);
    drawChart();
  });
}

// -------------------------------------------------------------
// App Initialization
// -------------------------------------------------------------
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEvents();

  // Initial fetch
  api('/api/status')
    .then(p => {
      render(p);
      connect();
    })
    .catch(err => {
      document.body.classList.remove('loading');
      toast(err.message);
    });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }
});
