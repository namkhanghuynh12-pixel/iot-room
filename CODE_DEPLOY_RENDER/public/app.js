import { matchesCommandAck, arcPath, shouldReduceVideo } from './ui-state.js';
/**
 * ============================================================================
 * TRẠM CHỈ HUY PHÒNG IOT - GALAXY SPACESHIP BRIDGE CONTROLLER
 * Phiên bản: 2.0 Galaxy Edition (Zero External Dependency, 100% CSP Compliant)
 * ============================================================================
 */

(() => {
  'use strict';

  // --------------------------------------------------------------------------
  // HÀM TIỆN ÍCH DOM & HELPER
  // --------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const $$ = sel => Array.from(document.querySelectorAll(sel));

  const clamp = (v, min, max) => Math.min(Math.max(v, min), max);

  const formatLocalTime = isoStr => {
    if (!isoStr) return '--:--:--';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '--:--:--';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    } catch {
      return '--:--:--';
    }
  };

  const formatLocalDateTime = isoStr => {
    if (!isoStr) return '--';
    try {
      const d = new Date(isoStr);
      if (isNaN(d.getTime())) return '--';
      const dd = String(d.getDate()).padStart(2, '0');
      const mo = String(d.getMonth() + 1).padStart(2, '0');
      const yyyy = d.getFullYear();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${dd}/${mo}/${yyyy} ${hh}:${mm}:${ss}`;
    } catch {
      return '--';
    }
  };

  // Toast thông báo
  let toastTimer = null;
  function toast(message, duration = 3500) {
    const el = $('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.add('hidden');
    }, duration);
  }

  // Thông báo khu vực Console Notice (aria-live)
  let noticeTimer = null;
  function showConsoleNotice(msg, type = 'info', duration = 4000) {
    const el = $('console-notice');
    if (!el) return;
    el.textContent = msg;
    el.className = `console-notice notice-${type}`;
    el.classList.remove('hidden');
    clearTimeout(noticeTimer);
    if (duration > 0) {
      noticeTimer = setTimeout(() => {
        el.classList.add('hidden');
      }, duration);
    }
  }

  // --------------------------------------------------------------------------
  // TRẠNG THÁI TOÀN CỤC CỦA TRẠM CHỈ HUY (GLOBAL STATE)
  // --------------------------------------------------------------------------
  const appState = {
    snapshot: null,
    historyData: [],
    historyPage: 1,
    historyPageSize: 15,
    sseConnected: false,
    eventSource: null,
    pollTimer: null,
    firmwareBusy: false,
    activeTab: 'dashboard',
    theme: localStorage.getItem('galaxy_theme') || 'dark',
    fxMode: localStorage.getItem('galaxy_fx') || 'full', // 'full' | 'reduced' | 'off'
    prevValues: {
      temperature: null,
      humidity: null,
      light: null
    },
    displayedValues: {
      temperature: 0,
      humidity: 0,
      light: 0
    },
    // Actuator pending ACK watchers
    pendingCommands: {
      fan: null,
      led: null,
      buzzer: null
    },
    // Active chart series filter
    activeSeries: {
      temperature: true,
      humidity: true,
      light: true
    }
  };

  // --------------------------------------------------------------------------
  // GIAO TIẾP MÁY CHỦ API (FETCH SAFE WRAPPER)
  // --------------------------------------------------------------------------
  async function api(url, data, signal) {
    const opts = data === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

    let res;
    try {
      res = await fetch(url, { ...opts, signal });
    } catch {
      throw new Error('Mất kết nối máy chủ hoặc mạng nội bộ gián đoạn');
    }

    if (res.status === 401) {
      const modal = $('auth-modal');
      if (modal) modal.classList.remove('hidden');
      throw new Error('Yêu cầu mã xác thực truy cập trạm (401)');
    }

    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error || `Lỗi máy chủ (${res.status})`);
    }
    return json;
  }

  // --------------------------------------------------------------------------
  // 1. ENGINE CANVAS SAO VŨ TRỤ PARALLAX & SAO BĂNG (GALAXY STARFIELD)
  // --------------------------------------------------------------------------
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  let videoQualityBaseline = null;
  let videoPlayAttempt = 0;
  function syncBackgroundVideo() {
    const video = $('room-background');
    if (!video) return;
    const allowed = !document.hidden && appState.fxMode === 'full' && !reducedMotion.matches;
    const attempt = ++videoPlayAttempt;
    videoQualityBaseline = null;
    if (!allowed) { video.pause(); return; }
    video.muted = true;
    video.play().then(() => {
      if (attempt !== videoPlayAttempt || document.hidden || appState.fxMode !== 'full' || reducedMotion.matches) video.pause();
      else if (video.getVideoPlaybackQuality) videoQualityBaseline = video.getVideoPlaybackQuality();
    }).catch(() => { /* Poster remains visible if playback is unavailable. */ });
  }
  document.addEventListener('visibilitychange', syncBackgroundVideo);
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches && appState.fxMode === 'full') setFxMode('reduced');
    else syncBackgroundVideo();
  });
  setInterval(() => {
    const video = $('room-background');
    if (!video || video.paused || !video.getVideoPlaybackQuality || !videoQualityBaseline) return;
    const current = video.getVideoPlaybackQuality();
    if (shouldReduceVideo(videoQualityBaseline, current)) {
      setFxMode('reduced');
      toast('Đã giảm hiệu ứng vì video rơi hơn 30% khung hình.');
    } else if (current.totalVideoFrames - videoQualityBaseline.totalVideoFrames >= 60) videoQualityBaseline = current;
  }, 5000);

  function setFxMode(mode) {
    if (!['full', 'reduced', 'off'].includes(mode)) mode = 'full';
    if (reducedMotion.matches && mode === 'full') mode = 'reduced';
    appState.fxMode = mode;
    localStorage.setItem('galaxy_fx', mode);
    document.documentElement.dataset.fx = mode;
    syncBackgroundVideo();

    const label = $('fx-mode-label');
    const btn = $('fx-toggle');
    if (label) {
      if (mode === 'full') label.textContent = 'Hiệu ứng: Đầy đủ';
      else if (mode === 'reduced') label.textContent = 'Hiệu ứng: Giảm';
      else label.textContent = 'Hiệu ứng: Tắt';
    }
    if (btn) {
      btn.setAttribute('aria-label', `Hiệu ứng đồ họa: ${mode === 'full' ? 'Đầy đủ' : mode === 'reduced' ? 'Giảm' : 'Tắt'}`);
    }
  }

  function cycleFxMode() {
    const modes = ['full', 'reduced', 'off'];
    const nextIdx = (modes.indexOf(appState.fxMode) + 1) % modes.length;
    setFxMode(modes[nextIdx]);
    toast(`Đã chuyển hiệu ứng: ${appState.fxMode === 'full' ? 'Đầy đủ' : appState.fxMode === 'reduced' ? 'Giảm (tôn trọng tùy chọn giảm chuyển động)' : 'Tắt hoàn toàn'}`);
  }

  function setTheme(theme) {
    appState.theme = theme;
    localStorage.setItem('galaxy_theme', theme);
    document.documentElement.dataset.theme = theme;

    const icon = $('theme-icon');
    if (icon) {
      const use = icon.querySelector('use');
      if (use) use.setAttribute('href', theme === 'dark' ? '#i-moon' : '#i-sun');
    }
    const btn = $('theme-toggle');
    if (btn) {
      btn.setAttribute('aria-label', `Đang ở chế độ ${theme === 'dark' ? 'Anime tối' : 'Anime sáng'}. Nhấn để đổi.`);
    }
    window.chartEngine?.render();
  }

  function toggleTheme() {
    const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    toast(`Đã chuyển sang giao diện ${newTheme === 'dark' ? 'Anime tối' : 'Anime sáng'}`);
  }

  // --------------------------------------------------------------------------
  // 3. TOÁN HỌC & ĐỒ HỌA SVG ARC GAUGE (ĐỒNG HỒ CUNG TRÒN VŨ TRỤ)
  // --------------------------------------------------------------------------
  // Tâm đồng hồ: (100, 95), Bán kính r = 75.
  // Thang đo chạy từ góc 180 độ (bên trái, x=25, y=95) sang góc 0 độ (bên phải, x=175, y=95).
  function updateGaugeZones(settings) {
    const zones = (key, bounds, max, colors) => {
      const svg = $(`svg-gauge-${key}`);
      if (!svg) return;
      svg.querySelectorAll('.gauge-zone').forEach(node => node.remove());
      for (let i = 0; i < bounds.length - 1; i++) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', `gauge-zone zone-${colors[i]}`);
        path.setAttribute('d', arcPath(bounds[i], bounds[i+1], max));
        svg.insertBefore(path, svg.querySelector('.gauge-progress'));
      }
    };
    zones('temp', [0, settings.offTemperature, settings.onTemperature, 60], 60, ['ok','warn','danger']);
    zones('hum', [0, settings.humidityAlert, 100], 100, ['ok','danger']);
    zones('light', [0, settings.lightOn, settings.lightOff, 100], 100, ['danger','warn','ok']);
    $('gauge-temp-threshold').textContent = `Bật ≥${settings.onTemperature} / Tắt ≤${settings.offTemperature}`;
    $('gauge-hum-threshold').textContent = `Cảnh báo ≥${settings.humidityAlert}%`;
    $('gauge-light-threshold').textContent = `Bật ≤${settings.lightOn} / Tắt ≥${settings.lightOff}`;
  }

  function updateSvgGauge(gaugeKey, value, min, max) {
    const needle = $(`needle-${gaugeKey}`);
    const prog = $(`prog-${gaugeKey}`);
    if (!needle || !prog) return;

    if (value == null || isNaN(value)) {

      needle.setAttribute('transform', 'rotate(0 100 95)');
      prog.setAttribute('d', 'M 25 95 A 75 75 0 0 1 25 95');
      return;
    }

    const ratio = clamp((value - min) / (max - min), 0, 1);

    // Tính góc kim: từ 0 độ (trái) tới 180 độ (phải)
    // Đường thẳng ban đầu x1=100, y1=95, x2=35, y2=95 chỉ sang trái (0 độ)
    const angleDeg = ratio * 180;

    needle.setAttribute('transform', `rotate(${angleDeg.toFixed(2)} 100 95)`);

    // Tính tọa độ điểm mút của cung tiến độ (Arc Progress Path)
    // ratio = 0: x = 25, y = 95
    // ratio = 1: x = 175, y = 95
    const angleRad = Math.PI * (1 - ratio);
    const endX = 100 + 75 * Math.cos(angleRad);
    const endY = 95 - 75 * Math.sin(angleRad);

    const d = `M 25 95 A 75 75 0 0 1 ${endX.toFixed(2)} ${endY.toFixed(2)}`;
    prog.setAttribute('d', d);
  }

  // Hiệu ứng số đếm mượt (Number Count Lerp) 350ms
  function animateKpiNumber(key, targetValue, decimals = 1) {
    const el = $(`val-${key}`);
    if (!el) return;

    if (targetValue == null || isNaN(targetValue)) {
      el.textContent = '--';
      appState.displayedValues[key] = 0;
      return;
    }

    // Nếu là lần render đầu tiên hoặc chế độ FX tắt, hiển thị ngay giá trị đích
    if (appState.fxMode !== 'full' || !appState.displayedValues[key]) {
      el.textContent = targetValue.toFixed(decimals);
      appState.displayedValues[key] = targetValue;
      return;
    }

    const startVal = appState.displayedValues[key];
    const startTime = performance.now();
    const duration = 350;

    const step = now => {
      const progress = clamp((now - startTime) / duration, 0, 1);
      // Easing out cubic: 1 - pow(1 - p, 3)
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = startVal + (targetValue - startVal) * ease;
      el.textContent = current.toFixed(decimals);

      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = targetValue.toFixed(decimals);
        appState.displayedValues[key] = targetValue;
      }
    };

    requestAnimationFrame(step);
  }

  function updateTrendBadge(key, currentVal) {
    const trendEl = $(`trend-${key}`);
    if (!trendEl) return;

    const prev = appState.prevValues[key];
    if (prev == null || currentVal == null) {
      trendEl.textContent = '→ Ổn định';
      trendEl.className = 'kpi-trend';
      return;
    }

    const diff = currentVal - prev;
    if (Math.abs(diff) < 0.1) {
      trendEl.textContent = '→ Ổn định';
      trendEl.className = 'kpi-trend';
    } else if (diff > 0) {
      trendEl.textContent = `↑ Tăng (+${diff.toFixed(1)})`;
      trendEl.className = 'kpi-trend trend-up';
    } else {
      trendEl.textContent = `↓ Giảm (${diff.toFixed(1)})`;
      trendEl.className = 'kpi-trend trend-down';
    }
  }

  // --------------------------------------------------------------------------
  // 4. BIỂU ĐỒ QUỸ ĐẠO CANVAS 2 TRỤC TỰ VIẾT (DUAL-AXIS CANVAS CHART)
  // --------------------------------------------------------------------------
  class GalaxyChartEngine {
    constructor(canvasId) {
      this.canvas = $(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.hoverIndex = -1;

      this.seriesMeta = {
        temperature: { label: 'Nhiệt độ', unit: '°C', color: '#ff7a45', axis: 'right', min: 0, max: 60 },
        humidity: { label: 'Độ ẩm', unit: '%', color: '#00f5d4', axis: 'left', min: 0, max: 100 },
        light: { label: 'Ánh sáng', unit: '%', color: '#ffd166', axis: 'left', min: 0, max: 100 }
      };

      this.bindEvents();
      this.resize();
    }

    bindEvents() {
      window.addEventListener('resize', () => {
        this.resize();
        this.render();
      }, { passive: true });

      // Tương tác hover rê chuột trên biểu đồ
      this.canvas.addEventListener('mousemove', e => {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        this.handleHover(mouseX);
      }, { passive: true });

      this.canvas.addEventListener('mouseleave', () => {
        this.hoverIndex = -1;
        this.render();
      }, { passive: true });
    }

    resize() {
      if (!this.canvas) return;
      const rect = this.canvas.parentElement.getBoundingClientRect();
      const w = Math.max(rect.width, 320);
      const h = Math.max(rect.height || 260, 240);

      this.width = w;
      this.height = h;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    handleHover(mouseX) {
      const data = appState.historyData.slice(-100);
      if (!data || data.length < 2) return;

      const padLeft = 44;
      const padRight = 44;
      const plotWidth = this.width - padLeft - padRight;
      const ratio = clamp((mouseX - padLeft) / plotWidth, 0, 1);
      const idx = Math.round(ratio * (data.length - 1));

      if (idx !== this.hoverIndex && idx >= 0 && idx < data.length) {
        this.hoverIndex = idx;
        this.render();
      }
    }

    render() {
      if (!this.canvas || !this.ctx) return;
      const ctx = this.ctx;
      const w = this.width;
      const h = this.height;
      const padLeft = 48;
      const padRight = 48;
      const padTop = 24;
      const padBottom = 34;

      ctx.clearRect(0, 0, w, h);

      const plotW = w - padLeft - padRight;
      const plotH = h - padTop - padBottom;

      // 1. Vẽ các đường lưới tọa độ ngang (5 vạch)
      const isDark = appState.theme === 'dark';
      const gridColor = isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.08)';
      const palette = getComputedStyle(document.documentElement);
      const textColor = palette.getPropertyValue('--gx-text-secondary').trim();
      this.seriesMeta.temperature.color = palette.getPropertyValue('--gx-metric-temp').trim();
      this.seriesMeta.humidity.color = palette.getPropertyValue('--gx-metric-hum').trim();
      this.seriesMeta.light.color = palette.getPropertyValue('--gx-metric-light').trim();

      ctx.lineWidth = 1;
      ctx.font = '10px monospace';
      ctx.textBaseline = 'middle';

      for (let i = 0; i <= 4; i++) {
        const y = padTop + (plotH / 4) * i;
        ctx.strokeStyle = gridColor;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(w - padRight, y);
        ctx.stroke();

        // Nhãn trục trái: 0 - 100%
        const leftVal = Math.round(100 - (100 / 4) * i);
        ctx.fillStyle = textColor;
        ctx.textAlign = 'right';
        ctx.fillText(`${leftVal}%`, padLeft - 6, y);

        // Nhãn trục phải: 0 - 60°C
        const rightVal = Math.round(60 - (60 / 4) * i);
        ctx.textAlign = 'left';
        ctx.fillText(`${rightVal}°C`, w - padRight + 6, y);
      }

      const data = appState.historyData.slice(-100);
      if (!data || data.length === 0) {
        ctx.fillStyle = textColor;
        ctx.textAlign = 'center';
        ctx.font = '13px sans-serif';
        ctx.fillText('Đang chờ dữ liệu lịch sử từ cơ sở dữ liệu SQLite...', w / 2, h / 2);
        return;
      }

      // Cập nhật số mẫu hiển thị
      const countEl = $('chart-sample-count');
      if (countEl) countEl.textContent = `${data.length} bản ghi`;

      // 2. Vẽ 4 đường quỹ đạo cảm biến
      const getX = index => padLeft + (index / Math.max(1, data.length - 1)) * plotW;
      const getY = (val, axis) => {
        if (val == null || isNaN(val)) return null;
        const max = axis === 'right' ? 60 : 100;
        const norm = clamp(val / max, 0, 1);
        return padTop + plotH * (1 - norm);
      };

      for (const [key, meta] of Object.entries(this.seriesMeta)) {
        if (!appState.activeSeries[key]) continue;

        ctx.strokeStyle = meta.color;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';

        let pathOpen = false;
        let lastTimeMs = null;

        ctx.beginPath();
        for (let i = 0; i < data.length; i++) {
          const pt = data[i];
          const val = pt[key];
          const curTimeMs = pt.at ? Date.parse(pt.at) : null;
          const y = getY(val, meta.axis);

          if (y === null) {
            pathOpen = false;
            continue;
          }

          // Kiểm tra ngắt dòng nếu khoảng trống thời gian > 30 giây (30000ms)
          if (lastTimeMs !== null && curTimeMs !== null && (curTimeMs - lastTimeMs > 30000)) {
            pathOpen = false;
          }
          lastTimeMs = curTimeMs;

          const x = getX(i);
          if (!pathOpen) {
            ctx.moveTo(x, y);
            pathOpen = true;
          } else {
            ctx.lineTo(x, y);
          }
        }
        ctx.stroke();

        // Đánh dấu các mẫu là dữ liệu giả (synthetic === true)
        for (let i = 0; i < data.length; i += 5) {
          if (data[i].synthetic) {
            const y = getY(data[i][key], meta.axis);
            if (y !== null) {
              ctx.fillStyle = meta.color;
              ctx.beginPath();
              ctx.arc(getX(i), y, 1.8, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }

      // 3. Đường Crosshair và Tooltip khi Hover
      if (this.hoverIndex >= 0 && this.hoverIndex < data.length) {
        const hItem = data[this.hoverIndex];
        const hX = getX(this.hoverIndex);

        // Vẽ vạch dọc
        ctx.strokeStyle = isDark ? 'rgba(255, 255, 255, 0.35)' : 'rgba(0, 0, 0, 0.3)';
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(hX, padTop);
        ctx.lineTo(hX, padTop + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        // Vẽ điểm tròn trên các series đang bật
        for (const [key, meta] of Object.entries(this.seriesMeta)) {
          if (!appState.activeSeries[key]) continue;
          const y = getY(hItem[key], meta.axis);
          if (y !== null) {
            ctx.fillStyle = meta.color;
            ctx.beginPath();
            ctx.arc(hX, y, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = isDark ? '#05060f' : '#ffffff';
            ctx.lineWidth = 1.5;
            ctx.stroke();
          }
        }

        // Vẽ hộp Tooltip nổi
        const timeLabel = formatLocalTime(hItem.at);
        const tipW = 160;
        const tipH = 92;
        let tipX = hX + 12;
        if (tipX + tipW > w - padRight) tipX = hX - tipW - 12;
        const tipY = padTop + 8;

        ctx.fillStyle = isDark ? 'rgba(10, 14, 30, 0.92)' : 'rgba(255, 255, 255, 0.95)';
        ctx.strokeStyle = isDark ? 'rgba(179, 136, 255, 0.4)' : 'rgba(100, 116, 139, 0.3)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(tipX, tipY, tipW, tipH, 8);
        ctx.fill();
        ctx.stroke();

        ctx.font = 'bold 11px sans-serif';
        ctx.fillStyle = isDark ? '#ffffff' : '#05060f';
        ctx.textAlign = 'left';
        ctx.fillText(`Thời gian: ${timeLabel}`, tipX + 8, tipY + 16);

        ctx.font = '10px monospace';
        let lineY = tipY + 32;
        for (const [key, meta] of Object.entries(this.seriesMeta)) {
          if (!appState.activeSeries[key]) continue;
          const val = hItem[key] != null ? `${Number(hItem[key]).toFixed(1)} ${meta.unit}` : '--';
          ctx.fillStyle = meta.color;
          ctx.fillText(`${meta.label}: ${val}`, tipX + 8, lineY);
          lineY += 14;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // 5. BỘ ĐIỀU KHIỂN THIẾT BỊ CHẤP HÀNH & MÁY TRẠNG THÁI ACK (ACTUATORS & ACK)
  // --------------------------------------------------------------------------
  // Hợp đồng logic thiết bị:
  // - Trạng thái thật đọc trực tiếp từ `device.fan`, `device.led`, `device.buzzer`.
  // - HTTP 200 hay thao tác bấm KHÔNG được coi là thiết bị đã đổi trạng thái.
  // - Khi gửi: hiển thị trạng thái chờ, khởi động Watchdog 3000ms.
  // - Khi `device.acknowledged === true` và trạng thái thiết bị khớp: Xác nhận thành công.
  // - Quá 3000ms không nhận được ACK: Báo lỗi quá hạn 3s, rung đỏ, hoàn nguyên giao diện.
  async function sendActuatorCommand(type, targetValue) {
    if(appState.firmwareBusy){toast('Đang nạp firmware. Đợi hoàn tất trước khi điều khiển.');return;}
    const snap = appState.snapshot;
    if (!snap || Object.values(appState.pendingCommands).some(Boolean)) return;

    const device = snap.device;
    if (!device || !device.online || !appState.sseConnected) {
      toast('Thiết bị đang ngoại tuyến. Không thể chuyển giao lệnh.');
      showConsoleNotice('Thiết bị đang ngoại tuyến: Vui lòng kiểm tra kết nối MQTT/ESP32.', 'error');
      return;
    }

    if (snap.settings.mode === 'auto') {
      toast('Đang ở chế độ Tự động. Chuyển sang Thủ công để điều khiển.');
      showConsoleNotice('Chế độ Tự động: Khóa điều khiển để duy trì quy tắc an toàn.', 'warn');
      return;
    }

    // Thiết lập trạng thái chờ ACK
    const row = $(`act-row-${type}`);
    const stateLabel = $(`${type}-state`);
    const toggleBtn = $(`${type}-toggle`);

    if (row) row.classList.add('act-pending');
    for (const key of ['fan', 'led', 'buzzer']) $(`${key}-toggle`)?.setAttribute('disabled', '');
    if (stateLabel) stateLabel.textContent = 'Đang gửi lệnh...';
    if (toggleBtn) toggleBtn.setAttribute('disabled', 'true');

    // Chuẩn bị payload cấu hình gửi lên /api/settings
    const patch = {};
    if (type === 'fan') patch.manualFan = targetValue;
    if (type === 'led') patch.led = targetValue;
    if (type === 'buzzer') patch.manualBuzzer = targetValue;

    const startTime = Date.now();
    const controller = new AbortController();

    // Hủy bỏ bộ hẹn giờ cũ nếu có
    if (appState.pendingCommands[type]?.timer) {
      clearTimeout(appState.pendingCommands[type].timer);
    }

    const timer = setTimeout(() => {
      // Đã quá 3000ms mà không nhận được ACK xác nhận
      handleAckTimeout(type);
    }, 3000);

    appState.pendingCommands[type] = {
      type, targetValue, deviceId: device.id, commandId: null, controller,
      startTime,
      timer
    };

    try {
      const result = await api('/api/settings', patch, controller.signal);
      const pending = appState.pendingCommands[type];
      if (!pending || pending.startTime !== startTime) return;
      if (result.device?.id !== pending.deviceId || !result.device?.lastCommand) throw Error('Máy chủ chưa tạo mã lệnh cho thiết bị đã chọn');
      pending.commandId = result.device.lastCommand;
      if (stateLabel) stateLabel.textContent = `Chờ ACK · ${pending.commandId.slice(0, 8)}`;
      if (appState.snapshot) renderSnapshot(appState.snapshot);
      // HTTP response supplies the commandId; only an acknowledged snapshot completes it.
    } catch (err) {
      if (controller.signal.aborted) return;
      clearTimeout(timer);
      appState.pendingCommands[type] = null;
      if (row) row.classList.remove('act-pending');
      if (appState.snapshot) renderSnapshot(appState.snapshot);
      toast(err.message);
      showConsoleNotice(`Lỗi gửi lệnh: ${err.message}`, 'error');
    }
  }

  function handleAckSuccess(type) {
    const pending = appState.pendingCommands[type];
    if (!pending) return;
    clearTimeout(pending.timer);
    appState.pendingCommands[type] = null;

    const row = $(`act-row-${type}`);
    const toggleBtn = $(`${type}-toggle`);
    const ackIndicator = $('ack-text');

    if (row) {
      row.classList.remove('act-pending');
      row.classList.add('ack-success');
      setTimeout(() => row.classList.remove('ack-success'), 1200);
    }
    if (toggleBtn && appState.snapshot?.settings?.mode === 'manual' && appState.snapshot?.device?.online && appState.sseConnected) {
      toggleBtn.removeAttribute('disabled');
    }
    if (ackIndicator) {
      ackIndicator.textContent = `Đã nhận ACK thành công cho ${type === 'fan' ? 'quạt' : type === 'led' ? 'đèn' : 'còi'}.`;
    }
    toast(`Đã xác nhận phản hồi ACK từ thiết bị (${type})`);
  }

  function handleAckTimeout(type, reason) {
    const pending = appState.pendingCommands[type];
    if (!pending) return;
    clearTimeout(pending.timer);
    pending.controller.abort();
    appState.pendingCommands[type] = null;

    const row = $(`act-row-${type}`);
    const toggleBtn = $(`${type}-toggle`);
    const stateLabel = $(`${type}-state`);

    if (row) {
      row.classList.remove('act-pending');
      row.classList.add('ack-error');
      setTimeout(() => row.classList.remove('ack-error'), 1800);
    }
    if (toggleBtn && appState.snapshot?.settings?.mode === 'manual' && appState.snapshot?.device?.online && appState.sseConnected) {
      toggleBtn.removeAttribute('disabled');
    }

    // Hoàn nguyên nhãn về trạng thái thực của thiết bị
    const realState = appState.snapshot?.device?.[type];
    if (stateLabel) {
      stateLabel.textContent = realState ? 'Đang BẬT' : 'Đang TẮT';
    }

    const name = type === 'fan' ? 'Quạt' : type === 'led' ? 'Đèn' : 'Còi';
    showConsoleNotice(reason || `Quá hạn 3 giây: Chưa nhận ACK khớp mã lệnh cho ${name}. Chưa xác nhận thiết bị đã thực hiện lệnh.`, 'error');
    toast(reason || `Cảnh báo: ${name} không gửi ACK sau 3 giây!`);
    if (appState.snapshot) renderSnapshot(appState.snapshot);
  }

  // --------------------------------------------------------------------------
  // 6. RENDER GIAO DIỆN CHÍNH DỰA TRÊN SNAPSHOT (DATA BINDING)
  // --------------------------------------------------------------------------
  function renderSnapshot(snap) {
    if (!snap) return;
    const oldDevice = appState.snapshot?.device?.id;
    appState.snapshot = snap;
    if (oldDevice && oldDevice !== snap.device?.id) {
      appState.historyData = []; appState.historyPage = 1;
      for (const type of ['fan', 'led', 'buzzer']) if (appState.pendingCommands[type]) handleAckTimeout(type, 'Đã đổi phòng; ngừng chờ ACK của phòng trước.');
      loadHistoryData();
    }

    // 1. Cập nhật đồng hồ trạm
    const clockEl = $('console-clock');
    if (clockEl) {
      clockEl.textContent = formatLocalTime(snap.device?.at || snap.serverTime);
    }

    // 2. Cập nhật chỉ báo kết nối (Pulse Sonar)
    const connPulse = $('connection-pulse');
    const connCore = $('connection-core');
    const connText = $('connection-text');
    const isOnline = Boolean(snap.device?.online && appState.sseConnected);

    if (connPulse && connCore && connText) {
      if (!appState.sseConnected) {
        connText.textContent = 'Mất kết nối máy chủ';
        connCore.className = 'sonar-core offline';
        connPulse.className = 'sonar-ring offline';
      } else if (!isOnline) {
        connText.textContent = 'Thiết bị ngoại tuyến';
        connCore.className = 'sonar-core offline';
        connPulse.className = 'sonar-ring offline';
      } else {
        connText.textContent = snap.settings?.source === 'simulation' ? 'Mô phỏng trực tuyến' : 'ESP32 trực tuyến';
        connCore.className = 'sonar-core online';
        connPulse.className = 'sonar-ring online';
      }
    }

    // 3. Banner Trung thực Dữ liệu (Synthetic / Simulation)
    const synBanner = $('synthetic-banner');
    if (synBanner) {
      const isSim = snap.settings?.source === 'simulation';
      const isSyn = Boolean(snap.device?.synthetic);
      if (isSim || isSyn) {
        synBanner.classList.remove('hidden');
        const desc = $('banner-desc');
        if (desc) {
          desc.textContent = isSim
            ? 'Hệ thống đang chạy trình giả lập SIMULATOR để kiểm thử. Dữ liệu không phản ánh môi trường thực.'
            : 'Thiết bị gửi cờ Synthetic: Dữ liệu đo đạc đang được tạo lập tự động.';
        }
      } else {
        synBanner.classList.add('hidden');
      }
    }

    // 4. Đồng bộ nút chọn Nguồn dữ liệu (Mô phỏng / ESP32 thật)
    const btnSim = $('source-sim');
    const btnHw = $('source-hw');
    if (btnSim && btnHw) {
      const currentSource = snap.settings?.source || 'simulation';
      btnSim.classList.toggle('active', currentSource === 'simulation');
      btnSim.setAttribute('aria-checked', String(currentSource === 'simulation'));
      btnHw.classList.toggle('active', currentSource === 'hardware');
      btnHw.setAttribute('aria-checked', String(currentSource === 'hardware'));
    }

    // 5. Đồng bộ bộ chọn không gian phòng (Device Select)
    const devSelect = $('device-select');
    if (devSelect && snap.settings?.hardwareId) {
      devSelect.value = snap.settings.hardwareId;
    }

    // 6. Cập nhật 3 KPI Bento Cards & SVG Gauges
    const d = snap.device || {};

    // 6.1 Nhiệt độ (0 - 60 °C, bật >=30, tắt <=28)
    updateGaugeZones(snap.settings);
    const dataLabel = $('hero-data-label');
    if (dataLabel) dataLabel.textContent = snap.settings.source === 'simulation' || d.synthetic ? 'Dữ liệu mô phỏng' : 'Dữ liệu từ ESP32';
    const curTemp = d.temperature;
    animateKpiNumber('temperature', curTemp, 1);
    updateTrendBadge('temperature', curTemp);
    updateSvgGauge('temp', curTemp, 0, 60);
    appState.prevValues.temperature = curTemp;

    // Hiệu ứng cảnh báo rung đập thẻ khi vượt ngưỡng nguy hiểm
    const cardTemp = $('card-temp');
    if (cardTemp) {
      cardTemp.classList.toggle('danger-pulse', curTemp != null && isOnline && curTemp >= snap.settings.onTemperature);
    }

    // 6.2 Độ ẩm (0 - 100 %, cảnh báo >=80%)
    const curHum = d.humidity;
    animateKpiNumber('humidity', curHum, 1);
    updateTrendBadge('humidity', curHum);
    updateSvgGauge('hum', curHum, 0, 100);
    appState.prevValues.humidity = curHum;

    const cardHum = $('card-hum');
    if (cardHum) {
      cardHum.classList.toggle('danger-pulse', curHum != null && isOnline && curHum >= snap.settings.humidityAlert);
    }

    // 6.4 Ánh sáng tương đối % (LDR: 0 - 100 %, bật <=25, tắt >=40)
    const curLight = d.light;
    animateKpiNumber('light', curLight, 0);
    updateTrendBadge('light', curLight);
    updateSvgGauge('light', curLight, 0, 100);
    appState.prevValues.light = curLight;

    // 7. Thẻ Radar Sonar PIR
    $('card-pir')?.classList.toggle('detected', isOnline && d.motion === true);
    $('svg-gauge-pir')?.setAttribute('aria-label', `Trạng thái PIR: ${!isOnline || d.motion == null ? 'chưa có dữ liệu' : d.motion ? 'có chuyển động' : 'không có chuyển động'}`);
    const radarBlip = $('radar-blip');
    const motionStatus = $('motion-status');
    const motionSub = $('motion-sub');
    if (motionStatus && motionSub) {
      if (!isOnline || d.motion === null || d.motion === undefined) {
        motionStatus.textContent = 'Chưa có dữ liệu';
        motionSub.textContent = 'Chờ tín hiệu từ cảm biến hồng ngoại...';
        if (radarBlip) radarBlip.className = 'radar-blip';
      } else if (d.motion === true) {
        motionStatus.textContent = 'Phát hiện chuyển động!';
        motionSub.textContent = 'Có đối tượng di chuyển trong tầm quét';
        if (radarBlip) radarBlip.className = 'radar-blip active';
      } else {
        motionStatus.textContent = 'Không có chuyển động';
        motionSub.textContent = 'Khu vực an toàn · Tầm quét tĩnh';
        if (radarBlip) radarBlip.className = 'radar-blip';
      }
    }

    // 8. Cập nhật Buồng Điều Khiển Thiết Bị Chấp Hành (Actuators)
    const modeSelect = $('control-mode');
    const controlHint = $('control-hint');
    const isManual = snap.settings?.mode === 'manual';

    if (modeSelect) modeSelect.value = snap.settings?.mode || 'auto';
    if (controlHint) {
      controlHint.textContent = isManual
        ? 'Chế độ Thủ công đang kích hoạt: Người vận hành có toàn quyền can thiệp lệnh bật/tắt.'
        : 'Chế độ Tự động đang kích hoạt: Khóa thao tác thủ công để đảm bảo an toàn quy tắc.';
    }

    // Kiểm tra và khớp ACK cho từng thiết bị
    const checkActuatorAckAndRender = (type, realState, actClass) => {
      const row = $(`act-row-${type}`);
      const stateLabel = $(`${type}-state`);
      const toggleBtn = $(`${type}-toggle`);
      const pending = appState.pendingCommands[type];
      if (row) row.classList.toggle(actClass, Boolean(realState && isOnline));

      // Nếu đang đợi ACK và trạng thái đã khớp với targetValue
      if (matchesCommandAck(pending, d)) {
        handleAckSuccess(type);
      }

      // Nếu không trong trạng thái pending, cập nhật giao diện theo thiết bị thật
      if (!appState.pendingCommands[type]) {
        if (stateLabel) {
          if (!isOnline) {
            stateLabel.textContent = 'Ngoại tuyến';
          } else if (realState === null || realState === undefined) {
            stateLabel.textContent = 'Chưa xác nhận';
          } else {
            stateLabel.textContent = realState ? 'Đang BẬT' : 'Đang TẮT';
          }
        }

        if (toggleBtn) {
          toggleBtn.setAttribute('aria-pressed', String(Boolean(realState)));
          toggleBtn.classList.toggle('active', Boolean(realState));

          if (!isOnline || !isManual || !appState.sseConnected || appState.firmwareBusy || Object.values(appState.pendingCommands).some(Boolean)) {
            toggleBtn.setAttribute('disabled', 'true');
          } else {
            toggleBtn.removeAttribute('disabled');
          }
        }

        // Cập nhật animation thật
        if (row) {
          row.classList.toggle(actClass, Boolean(realState && isOnline));
        }
      }
    };

    checkActuatorAckAndRender('fan', d.fan, 'fan-running');
    checkActuatorAckAndRender('led', d.led, 'led-lighting');
    checkActuatorAckAndRender('buzzer', d.buzzer, 'buzzer-beeping');

    // Cập nhật dòng ACK footer
    const ackText = $('ack-text');
    if (ackText && !Object.values(appState.pendingCommands).some(Boolean)) {
      if (d.acknowledged) {
        ackText.textContent = `Lệnh gần nhất đã được xác nhận (Mã: ${d.lastCommand ? d.lastCommand.slice(0, 8) : 'N/A'})`;
      } else if (d.lastCommand) {
        ackText.textContent = `Đang đợi đồng bộ với thiết bị...`;
      } else {
        ackText.textContent = `Trạng thái sẵn sàng tiếp nhận điều khiển.`;
      }
    }

    // 9. Cập nhật Bảng Nhật Ký Sự Kiện (Events Feed)
    renderEventFeed(snap.events);

    // 10. Cập nhật Tab Thiết Bị & Kết Nối (Devices & Network)
    renderDevicesCatalog(snap);

    // 11. Đồng bộ Form Tùy Biến Ngưỡng Tự Động Hóa Cá Nhân (Personal Rules Settings)
    renderRulesSettings(snap.settings);
  }

  function renderRulesSettings(settings) {
    if (!settings) return;
    $$('.rule-status').forEach(el => {
      el.classList.toggle('active', settings.mode === 'auto');
      el.textContent = settings.mode === 'auto' ? 'Áp dụng trong chế độ tự động' : 'Tạm dừng trong chế độ thủ công';
    });

    // Cập nhật giá trị hiển thị trong 3 thẻ quy tắc mô tả
    const setVal = (id, text) => {
      const el = $(id);
      if (el) el.textContent = text;
    };
    if (settings.onTemperature != null) setVal('rule-desc-tempOn', `≥ ${settings.onTemperature} °C`);
    if (settings.offTemperature != null) setVal('rule-desc-tempOff', `≤ ${settings.offTemperature} °C`);
    if (settings.lightOn != null) setVal('rule-desc-lightOn', `≤ ${settings.lightOn}%`);
    if (settings.lightOff != null) setVal('rule-desc-lightOff', `≥ ${settings.lightOff}%`);
    if (settings.humidityAlert != null) setVal('rule-desc-humAlert', `≥ ${settings.humidityAlert}%`);

    // Đồng bộ các trường input nếu người dùng không đang nhập liệu
    const rulesForm = $('rules-form');
    if (rulesForm && !rulesForm.matches(':focus-within')) {
      const keys = ['onTemperature', 'offTemperature', 'lightOn', 'lightOff', 'humidityAlert'];
      for (const k of keys) {
        if (rulesForm.elements[k] && settings[k] != null) {
          rulesForm.elements[k].value = settings[k];
        }
      }
    }
  }

  function renderEventFeed(events) {
    const list = $('event-list');
    const count = $('event-count');
    if (!list) return;

    if (!events || events.length === 0) {
      list.replaceChildren();
      const li = document.createElement('li');
      li.className = 'event-feed-empty';
      li.textContent = 'Chưa có sự kiện nào được ghi nhận từ trạm.';
      list.appendChild(li);
      if (count) count.textContent = '0 sự kiện';
      return;
    }

    if (count) count.textContent = `${events.length} sự kiện`;
    list.replaceChildren();

    events.forEach(ev => {
      const li = document.createElement('li');
      li.className = `event-feed-item event-${ev.kind || 'info'}`;

      const timeSpan = document.createElement('span');
      timeSpan.className = 'event-time';
      timeSpan.textContent = formatLocalTime(ev.at);

      const msgSpan = document.createElement('span');
      msgSpan.className = 'event-msg';
      msgSpan.textContent = `[${ev.kind || 'trạm'}] ${ev.message || ''}`;

      li.appendChild(timeSpan);
      li.appendChild(msgSpan);
      list.appendChild(li);
    });
  }

  function renderDevicesCatalog(snap) {
    const grid = $('devices-catalog-grid');
    if (!grid || !snap) return;

    // Cập nhật thông số Gateway & Broker
    const gwName = $('gw-name');
    const gwProto = $('gw-proto');
    const gwStorage = $('gw-storage');
    const gwUptime = $('gw-uptime');
    const brokerPortInfo = $('broker-port-info');
    const sidebarPort = $('sidebar-broker-port');

    if (gwName && snap.gateway?.name) gwName.textContent = snap.gateway.name;
    if (gwProto && snap.gateway?.protocol) gwProto.textContent = snap.gateway.protocol;
    if (gwStorage && snap.gateway?.storage) gwStorage.textContent = snap.gateway.storage;
    if (gwUptime && snap.gateway?.uptime != null) {
      const s = snap.gateway.uptime;
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      gwUptime.textContent = `${h} giờ ${m} phút (${s}s)`;
    }
    if (brokerPortInfo && snap.broker?.port) brokerPortInfo.textContent = String(snap.broker.port);
    if (sidebarPort && snap.broker?.port) sidebarPort.textContent = `:${snap.broker.port}`;

    const devices = snap.devices || [];
    grid.replaceChildren();

    devices.forEach(dev => {
      const card = document.createElement('div');
      card.className = `device-node-card ${dev.online ? 'online' : 'offline'}`;

      const head = document.createElement('div');
      head.className = 'node-head';

      const title = document.createElement('h4');
      title.textContent = dev.id;

      const badge = document.createElement('span');
      badge.className = `node-badge ${dev.online ? 'badge-online' : 'badge-offline'}`;
      badge.textContent = dev.online ? 'Trực tuyến' : 'Ngoại tuyến';

      head.appendChild(title);
      head.appendChild(badge);

      const body = document.createElement('div');
      body.className = 'node-body';

      const p1 = document.createElement('p');
      p1.textContent = `Nhiệt độ: ${dev.temperature != null ? dev.temperature + ' °C' : '--'}`;

      const p2 = document.createElement('p');
      p2.textContent = `Độ ẩm: ${dev.humidity != null ? dev.humidity + ' %' : '--'}`;

      const p3 = document.createElement('p');
      p3.textContent = `Lần nhận tin: ${formatLocalTime(dev.at)}`;

      body.appendChild(p1);
      body.appendChild(p2);
      body.appendChild(p3);

      card.appendChild(head);
      card.appendChild(body);
      grid.appendChild(card);
    });
  }

  // --------------------------------------------------------------------------
  // 7. TRUY XUẤT LỊCH SỬ & PHÂN TRANG (HISTORY TABLE & PAGINATION)
  // --------------------------------------------------------------------------
  let historyRequest = 0;
  async function loadHistoryData() {
    const request = ++historyRequest;
    const deviceId = appState.snapshot?.device?.id;
    try {
      const history = await api('/api/history');
      if (request !== historyRequest || deviceId !== appState.snapshot?.device?.id) return;
      if (Array.isArray(history)) {
        appState.historyData = history;
        if (window.chartEngine) window.chartEngine.render();
        renderHistoryTable();
      }
    } catch (err) {
      toast(`Không tải được dữ liệu lịch sử: ${err.message}`);
    }
  }

  function renderHistoryTable() {
    const tbody = $('history-table-body');
    const pageInfo = $('history-page-info');
    const prevBtn = $('history-prev-btn');
    const nextBtn = $('history-next-btn');
    if (!tbody) return;

    const data = appState.historyData || [];
    if (data.length === 0) {
      tbody.replaceChildren();
      const emptyRow = document.createElement('tr');
      const emptyCell = document.createElement('td');
      emptyCell.colSpan = 5; emptyCell.className = 'table-empty';
      emptyCell.textContent = 'Chưa có dữ liệu lịch sử trong cơ sở dữ liệu.';
      emptyRow.appendChild(emptyCell); tbody.appendChild(emptyRow);
      if (pageInfo) pageInfo.textContent = 'Trang 1 / 1 (0 bản ghi)';
      if (prevBtn) prevBtn.disabled = true;
      if (nextBtn) nextBtn.disabled = true;
      return;
    }

    const totalPages = Math.ceil(data.length / appState.historyPageSize) || 1;
    appState.historyPage = clamp(appState.historyPage, 1, totalPages);

    const startIdx = (appState.historyPage - 1) * appState.historyPageSize;
    const endIdx = startIdx + appState.historyPageSize;
    // Dữ liệu mới nhất đưa lên đầu bảng
    const reversed = [...data].reverse();
    const pageItems = reversed.slice(startIdx, endIdx);

    tbody.replaceChildren();
    pageItems.forEach(row => {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.textContent = formatLocalDateTime(row.at);

      const tdTemp = document.createElement('td');
      tdTemp.textContent = row.temperature != null ? Number(row.temperature).toFixed(1) : '--';

      const tdHum = document.createElement('td');
      tdHum.textContent = row.humidity != null ? Number(row.humidity).toFixed(1) : '--';

      const tdLight = document.createElement('td');
      tdLight.textContent = row.light != null ? Number(row.light).toFixed(0) : '--';

      const tdMotion = document.createElement('td');
      tdMotion.textContent = row.motion === true || row.motion === 1 ? 'Có' : row.motion === false || row.motion === 0 ? 'Không' : '--';

      tr.appendChild(tdTime);
      tr.appendChild(tdTemp);
      tr.appendChild(tdHum);
      tr.appendChild(tdLight);
      tr.appendChild(tdMotion);
      tbody.appendChild(tr);
    });

    if (pageInfo) {
      pageInfo.textContent = `Trang ${appState.historyPage} / ${totalPages} (${data.length} bản ghi)`;
    }
    if (prevBtn) prevBtn.disabled = appState.historyPage <= 1;
    if (nextBtn) nextBtn.disabled = appState.historyPage >= totalPages;
  }

  // --------------------------------------------------------------------------
  // 8. KẾT NỐI REALTIME SSE & DỰ PHÒNG POLLING (REALTIME SYNC)
  // --------------------------------------------------------------------------
  function connectEventSource() {
    if (appState.eventSource) {
      appState.eventSource.close();
      appState.eventSource = null;
    }

    const es = new EventSource('/api/events');
    appState.eventSource = es;

    es.onopen = () => {
      appState.sseConnected = true;
      if (appState.snapshot) renderSnapshot(appState.snapshot);
    };

    es.onmessage = e => {
      try {
        const snap = JSON.parse(e.data);
        renderSnapshot(snap);

        // Đẩy điểm dữ liệu mới vào biểu đồ realtime
        if (snap.device && snap.device.temperature != null && snap.device.at) {
          const pt = {
            id: Date.now(),
            temperature: snap.device.temperature,
            humidity: snap.device.humidity,
            light: snap.device.light,
            motion: snap.device.motion,
            synthetic: Boolean(snap.device.synthetic),
            at: snap.device.at
          };

          // Kiểm tra tránh trùng lặp timestamp
          const last = appState.historyData[appState.historyData.length - 1];
          if (!last || last.at !== pt.at) {
            appState.historyData.push(pt);
            if (appState.historyData.length > 1000) appState.historyData.shift();
            if (window.chartEngine) window.chartEngine.render();
          }
        }
      } catch (err) {
        console.error('Lỗi phân tích cú pháp SSE:', err);
      }
    };

    es.onerror = () => {
      appState.sseConnected = false;
      if (appState.snapshot) renderSnapshot(appState.snapshot);
      es.close();
      // Thử kết nối lại sau 4 giây
      setTimeout(connectEventSource, 4000);
    };
  }

  async function fetchInitialStatus() {
    try {
      const snap = await api('/api/status');
      renderSnapshot(snap);
      document.body.classList.remove('loading');
      loadHistoryData();
    } catch (err) {
      console.warn('Lỗi lấy snapshot ban đầu:', err.message);
    }
  }

  // --------------------------------------------------------------------------
  // 9. THIẾT LẬP CÁC SỰ KIỆN TƯƠNG TÁC (EVENT LISTENERS)
  // --------------------------------------------------------------------------
  function setupEventListeners() {
    // 9.1 Chuyển tab Sidebar & Mobile Navigation
    const navButtons = $$('.nav-item, .m-nav-item');
    navButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        if (!tab) return;
        switchTab(tab);
      });
    });

    // 9.2 Chuyển nguồn dữ liệu (Mô phỏng / ESP32 thật)
    const btnSim = $('source-sim');
    const btnHw = $('source-hw');

    if (btnSim) {
      btnSim.addEventListener('click', async () => {
        try {
          await api('/api/settings', { source: 'simulation' });
          toast('Đã chuyển sang nguồn Dữ liệu Mô Phỏng.');
        } catch (err) {
          toast(err.message);
        }
      });
    }

    if (btnHw) {
      btnHw.addEventListener('click', async () => {
        try {
          await api('/api/settings', { source: 'hardware' });
          toast('Đã chuyển sang nguồn ESP32 Thật.');
        } catch (err) {
          toast(err.message);
        }
      });
    }

    // 9.3 Đổi không gian phòng (Device Select)
    const devSelect = $('device-select');
    if (devSelect) {
      devSelect.addEventListener('change', async e => {
        const val = e.target.value;
        try {
          await api('/api/settings', { hardwareId: val });
          toast(`Đã chọn trạm giám sát: ${val}`);
          loadHistoryData();
        } catch (err) {
          toast(err.message);
        }
      });
    }

    // 9.4 Đổi chế độ điều khiển (Tự động / Thủ công)
    const modeSelect = $('control-mode');
    if (modeSelect) {
      modeSelect.addEventListener('change', async e => {
        const newMode = e.target.value;
        try {
          await api('/api/settings', { mode: newMode });
          toast(`Đã chuyển sang chế độ ${newMode === 'manual' ? 'Thủ Công (Manual)' : 'Tự Động (Auto)'}`);
        } catch (err) {
          toast(err.message);
        }
      });
    }

    // 9.5 Thao tác nút chấp hành: Quạt, Đèn, Còi
    const fanToggle = $('fan-toggle');
    if (fanToggle) {
      fanToggle.addEventListener('click', () => {
        const cur = appState.snapshot?.device?.fan;
        sendActuatorCommand('fan', !cur);
      });
    }

    const ledToggle = $('led-toggle');
    if (ledToggle) {
      ledToggle.addEventListener('click', () => {
        const cur = appState.snapshot?.device?.led;
        sendActuatorCommand('led', !cur);
      });
    }

    const buzzerToggle = $('buzzer-toggle');
    if (buzzerToggle) {
      buzzerToggle.addEventListener('click', () => {
        const cur = appState.snapshot?.device?.buzzer;
        sendActuatorCommand('buzzer', !cur);
      });
    }

    // 9.6 Bật/tắt đường hiển thị trên biểu đồ (Legend Chips)
    const legendButtons = $$('.legend-chip');
    legendButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        if (!key) return;
        appState.activeSeries[key] = !appState.activeSeries[key];
        btn.classList.toggle('active', appState.activeSeries[key]);
        btn.setAttribute('aria-pressed', String(appState.activeSeries[key]));
        if (window.chartEngine) window.chartEngine.render();
      });
    });

    // 9.7 Nút Hiệu ứng & Nút Giao diện Sáng/Tối
    const fxBtn = $('fx-toggle');
    if (fxBtn) fxBtn.addEventListener('click', cycleFxMode);

    const themeBtn = $('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);

    // 9.8 Xuất dữ liệu CSV
    const exportCsv = () => {
      window.location.href = '/api/export';
      toast('Đang khởi tạo tải xuống file CSV dữ liệu...');
    };

    const quickCsvBtn = $('quick-csv-btn');
    if (quickCsvBtn) quickCsvBtn.addEventListener('click', exportCsv);

    const histExportBtn = $('history-export-btn');
    if (histExportBtn) histExportBtn.addEventListener('click', exportCsv);

    // 9.9 Phân trang bảng lịch sử
    const prevBtn = $('history-prev-btn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        if (appState.historyPage > 1) {
          appState.historyPage--;
          renderHistoryTable();
        }
      });
    }

    const nextBtn = $('history-next-btn');
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        const totalPages = Math.ceil(appState.historyData.length / appState.historyPageSize);
        if (appState.historyPage < totalPages) {
          appState.historyPage++;
          renderHistoryTable();
        }
      });
    }

    const histRefreshBtn = $('history-refresh-btn');
    if (histRefreshBtn) {
      histRefreshBtn.addEventListener('click', () => {
        loadHistoryData();
        toast('Đã làm mới dữ liệu lịch sử từ máy chủ.');
      });
    }

    // 9.10 Form xác thực mã truy cập (Auth Modal 401)
    const authForm = $('auth-form');
    if (authForm) {
      authForm.addEventListener('submit', async e => {
        e.preventDefault();
        const input = $('modal-access-token');
        const errEl = $('modal-auth-error');
        if (!input) return;

        const token = input.value.trim();
        try {
          await api('/api/login', { token });
          const modal = $('auth-modal');
          if (modal) modal.classList.add('hidden');
          if (errEl) errEl.classList.add('hidden');
          toast('Xác thực thành công. Đã kết nối lại trạm!');
          fetchInitialStatus();
        } catch (err) {
          if (errEl) {
            errEl.textContent = err.message || 'Mã truy cập không đúng.';
            errEl.classList.remove('hidden');
          }
        }
      });
    }

    const toggleTokenBtn = $('modal-toggle-token');
    if (toggleTokenBtn) {
      toggleTokenBtn.addEventListener('click', () => {
        const input = $('modal-access-token');
        if (!input) return;
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        toggleTokenBtn.textContent = isPass ? 'Ẩn' : 'Hiện';
      });
    }

    // 9.11 Form tùy biến ngưỡng quy tắc tự động hóa cá nhân (Rules Form)
    const rulesForm = $('rules-form');
    if (rulesForm) {
      rulesForm.addEventListener('submit', async e => {
        e.preventDefault();
        const formData = new FormData(rulesForm);
        const payload = {};
        for (const [k, v] of formData.entries()) {
          payload[k] = Number(v);
        }

        const saveStatus = $('rules-save-status');
        const submitBtn = $('rules-submit-btn');
        if (submitBtn) submitBtn.disabled = true;
        if (saveStatus) saveStatus.textContent = 'Đang ghi nhận cấu hình...';

        try {
          const updated = await api('/api/settings', payload);
          renderSnapshot(updated);
          if (saveStatus) {
            saveStatus.textContent = '✓ Đã lưu cấu hình tự động vào SQLite thành công!';
            setTimeout(() => { if (saveStatus) saveStatus.textContent = ''; }, 3500);
          }
          toast('Đã cập nhật quy tắc tự động hóa cá nhân');
        } catch (err) {
          if (saveStatus) saveStatus.textContent = `Lỗi: ${err.message}`;
          toast(err.message);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // 9.12 Form nạp Wi-Fi cho ESP32 qua cổng USB Serial
    const wifiForm = $('wifi-form');
    if (wifiForm) {
      wifiForm.addEventListener('submit', async e => {
        e.preventDefault();
        const submitBtn = $('wifi-submit');
        const resultEl = $('wifi-result');
        if (submitBtn) submitBtn.disabled = true;
        if (resultEl) resultEl.textContent = 'Đang nạp cấu hình Wi-Fi qua cổng USB...';

        try {
          const res = await api('/api/provision', {
            ssid: $('wifi-ssid')?.value || '',
            password: $('wifi-pass')?.value || '',
            broker: $('wifi-broker')?.value.trim() || '',
            port: $('wifi-com')?.value.trim().toUpperCase() || 'COM16',
            deviceId: $('wifi-device')?.value || 'esp32-room-01'
          });
          if ($('wifi-pass')) $('wifi-pass').value = '';
          if (resultEl) resultEl.textContent = res.message || 'Cấu hình thành công! ESP32 đang kết nối Wi-Fi.';
          toast(res.message || 'Cấu hình Wi-Fi hoàn tất');
        } catch (err) {
          if (resultEl) resultEl.textContent = `Lỗi: ${err.message}`;
          toast(`Lỗi cấu hình USB: ${err.message}`);
        } finally {
          if (submitBtn) submitBtn.disabled = false;
        }
      });
    }

    // 9.13 Nút hiển thị thông số kết nối trạm an toàn
    const revealSecretsBtn = $('reveal-secrets');
    if (revealSecretsBtn) {
      revealSecretsBtn.addEventListener('click', async () => {
        try {
          const p = await api('/api/setup');
          const dl = $('setup-details');
          if (!dl) return;
          dl.replaceChildren();
          const map = {
            'IP Laptop (Gateway)': p.addresses?.join(', ') || '127.0.0.1',
            'Cổng MQTT': String(p.mqttPort || 1883),
            'MQTT Username': p.username || 'esp32',
            'MQTT Password': p.password || '******',
            'Mã truy cập Web': p.accessToken || 'N/A',
            'Mở trên điện thoại': p.addresses?.map(ip => `http://${ip}:${p.port || 8765}`).join(' | ') || 'localhost'
          };
          for (const [k, v] of Object.entries(map)) {
            const dt = document.createElement('dt');
            dt.textContent = k;
            const dd = document.createElement('dd');
            dd.textContent = String(v);
            dl.appendChild(dt);
            dl.appendChild(dd);
          }
          toast('Đã hiển thị thông tin trạm an toàn');
        } catch (err) {
          toast(`Lỗi lấy thông tin trạm: ${err.message}`);
        }
      });
    }
  }

  const firmwareUI={available:false,loaded:false,job:null,requesting:false};
  const firmwarePhases={prepare:'Chuẩn bị',release:'Chuẩn bị cổng USB',detect:'Nhận diện board',backup:'Sao lưu Flash',compile:'Biên dịch firmware','verify-board':'Kiểm tra lại board',upload:'Đang ghi Flash',connect:'Đang kết nối USB / chờ ACK',done:'Hoàn tất',error:'Có lỗi',interrupted:'Phiên nạp bị gián đoạn'};
  function renderFirmware(state){
    if(!firmwareUI.loaded&&$('firmware-device'))$('firmware-device').value=state.job?.deviceId||appState.snapshot?.settings?.hardwareId||'esp32-room-01';
    firmwareUI.available=Boolean(state.available);firmwareUI.loaded=true;firmwareUI.job=state.job;
    appState.firmwareBusy=state.job?.status==='running'||firmwareUI.requesting;
    if($('firmware-capability'))$('firmware-capability').textContent=state.message||'';
    const locked=!firmwareUI.available||appState.firmwareBusy;
    for(const id of ['firmware-port','firmware-device','firmware-backup-mode','firmware-scan'])if($(id))$(id).disabled=locked;
    if($('firmware-submit'))$('firmware-submit').disabled=locked||!$('firmware-port')?.value;
    const job=state.job;
    if($('firmware-phase'))$('firmware-phase').textContent=job?firmwarePhases[job.phase]||job.phase:'Chưa bắt đầu nạp';
    if($('firmware-message'))$('firmware-message').textContent=job?.message||(!state.available?'Mở bản local trên laptop có ESP32 cắm USB.':'Chọn cổng COM và mã thiết bị, rồi bấm Sao lưu & Nạp.');
    if($('firmware-board'))$('firmware-board').textContent=job?[job.port,job.deviceId,job.chip,job.flashMB?`Flash ${job.flashMB} MB`:'',job.mac?`MAC ${job.mac}`:''].filter(Boolean).join(' · '):'';
    if($('firmware-backup'))$('firmware-backup').textContent=job?.backup?(job.backupComplete?`Bản sao lưu đủ dung lượng trên laptop: data/${job.backup}`:'Bản sao lưu chưa hoàn tất; chưa cho phép ghi firmware.'):'';
    const progress=$('firmware-progress');if(progress){const backupProgress=job?.phase==='backup'&&job.backupTotalBytes;progress.hidden=!backupProgress&&(job?.phase!=='upload'||job.uploadPercent==null);progress.value=backupProgress?job.backupBytes/job.backupTotalBytes*100:job?.uploadPercent||0;progress.setAttribute('aria-label',backupProgress?'Tiến trình sao lưu Flash':'Tiến trình ghi Flash');}
    if($('firmware-log'))$('firmware-log').textContent=job?.logs?.join('\n')||'Chưa có nhật ký.';
    if(appState.snapshot)renderSnapshot(appState.snapshot);
    for(const id of ['source-sim','source-hw','device-select','control-mode','wifi-submit'])if($(id))$(id).disabled=appState.firmwareBusy;
  }
  async function loadFirmwareStatus(){
    try{renderFirmware(await api('/api/firmware/status'));}catch(error){if(!firmwareUI.loaded&&$('firmware-capability'))$('firmware-capability').textContent='Không đọc được trạng thái công cụ nạp. Kiểm tra máy chủ local.';}
  }
  async function scanFirmwarePorts(){
    const select=$('firmware-port');if(!select||!firmwareUI.available||appState.firmwareBusy)return;
    const previous=select.value;$('firmware-scan').disabled=true;
    try{
      const {ports}=await api('/api/firmware/ports');select.replaceChildren();
      const placeholder=document.createElement('option');placeholder.value='';placeholder.textContent=ports.length?'Chọn board cần nạp':'Chưa có cổng COM — cắm cáp USB truyền dữ liệu';select.appendChild(placeholder);
      for(const port of ports){const option=document.createElement('option');option.value=port.path;option.textContent=`${port.path} — ${port.label}`;select.appendChild(option);}
      if(ports.some(p=>p.path===previous))select.value=previous;else if(ports.length===1)select.value=ports[0].path;
      if($('firmware-device')&&appState.snapshot?.settings?.hardwareId&&!firmwareUI.job)$('firmware-device').value=appState.snapshot.settings.hardwareId;
      $('firmware-submit').disabled=!select.value;
    }catch(error){toast(error.message);}finally{$('firmware-scan').disabled=false;}
  }
  function setupFirmwareUI(){
    $('firmware-scan')?.addEventListener('click',scanFirmwarePorts);
    $('firmware-port')?.addEventListener('change',()=>{$('firmware-submit').disabled=!$('firmware-port').value||appState.firmwareBusy||!firmwareUI.available;});
    $('firmware-form')?.addEventListener('submit',async event=>{
      event.preventDefault();if(appState.firmwareBusy||!firmwareUI.available||!$('firmware-port').value)return;
      firmwareUI.requesting=true;renderFirmware({available:true,message:'Đang gửi yêu cầu nạp',job:firmwareUI.job});
      try{const result=await api('/api/firmware/flash',{port:$('firmware-port').value,deviceId:$('firmware-device').value,backupMode:$('firmware-backup-mode').value});firmwareUI.requesting=false;renderFirmware(result);}
      catch(error){firmwareUI.requesting=false;toast(error.message);await loadFirmwareStatus();}
    });
    loadFirmwareStatus().then(()=>{if(firmwareUI.available&&!appState.firmwareBusy)scanFirmwarePorts();});
    setInterval(()=>{if(!document.hidden&&(appState.firmwareBusy||appState.activeTab==='devices'))loadFirmwareStatus();},2000);
  }

  async function loadSetupDefaults() {
    try {
      const p = await api('/api/setup');
      const ssidEl = $('wifi-ssid');
      const brokerEl = $('wifi-broker');
      const comEl = $('wifi-com');
      if (ssidEl && !ssidEl.value && p.ssid) ssidEl.value = p.ssid;
      if (brokerEl && !brokerEl.value && p.addresses?.length) brokerEl.value = p.addresses[0];
      if (comEl && p.ports?.length) {
        comEl.value = p.ports.includes('COM16') ? 'COM16' : p.ports[0];
      }
    } catch {
      // Giữ im lặng nếu máy khách ở xa không truy cập setup cục bộ
    }
  }

  function switchTab(tabId) {
    appState.activeTab = tabId;

    // Cập nhật trạng thái active của các nút điều hướng
    const navButtons = $$('.nav-item, .m-nav-item');
    navButtons.forEach(btn => {
      const isCur = btn.dataset.tab === tabId;
      btn.classList.toggle('active', isCur);
      btn.setAttribute('aria-current', isCur ? 'page' : 'false');
    });

    // Cập nhật hiển thị các pane
    const panes = $$('.tab-pane');
    panes.forEach(pane => {
      const isTarget = pane.id === `tab-${tabId}`;
      pane.classList.toggle('active', isTarget);
      pane.classList.toggle('hidden', !isTarget);
    });

    // Kích hoạt render lại biểu đồ nếu chuyển về tab dashboard
    if (tabId === 'dashboard' && window.chartEngine) {
      setTimeout(() => {
        window.chartEngine.resize();
        window.chartEngine.render();
      }, 50);
    }

    // Tải dữ liệu lịch sử nếu chuyển sang tab history
    if (tabId === 'history') {
      loadHistoryData();
    }
  }

  // --------------------------------------------------------------------------
  // 10. KHỞI TẠO TOÀN DIỆN ỨNG DỤNG (APPLICATION BOOTSTRAP)
  // --------------------------------------------------------------------------
  function init() {
    // Khởi tạo Theme & FX từ localStorage
    setTheme(appState.theme);
    setFxMode(appState.fxMode);

    // Khởi tạo Canvas Vũ trụ Starfield
    // Background playback is managed by visibility, FX preference and frame quality.

    // Khởi tạo Canvas Biểu đồ 2 trục
    window.chartEngine = new GalaxyChartEngine('history-chart');

    // Thiết lập sự kiện người dùng
    setupEventListeners();
    setupFirmwareUI();

    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});

    // Lấy snapshot ban đầu và kết nối SSE Realtime
    fetchInitialStatus();
    connectEventSource();
    loadSetupDefaults();

    // Hỗ trợ mở trực tiếp tab qua URL hash (ví dụ: #devices, #rules, #history)
    const initialHash = window.location.hash.replace('#', '');
    if (['dashboard', 'devices', 'rules', 'history'].includes(initialHash)) {
      switchTab(initialHash);
    }
    window.addEventListener('hashchange', () => {
      const h = window.location.hash.replace('#', '');
      if (['dashboard', 'devices', 'rules', 'history'].includes(h)) {
        switchTab(h);
      }
    });

    // Đồng hồ trạm cập nhật định kỳ mỗi giây (giữ cho nhịp tim mượt)
    setInterval(() => {
      const clockEl = $('console-clock');
      if (clockEl && !appState.snapshot?.device?.at) {
        clockEl.textContent = formatLocalTime(new Date().toISOString());
      }
    }, 1000);
  }

  // Chờ DOM sẵn sàng
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
