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
    activeTab: 'dashboard',
    theme: localStorage.getItem('galaxy_theme') || 'dark',
    fxMode: localStorage.getItem('galaxy_fx') || 'full', // 'full' | 'reduced' | 'off'
    prevValues: {
      temperature: null,
      humidity: null,
      airQuality: null,
      light: null
    },
    displayedValues: {
      temperature: 0,
      humidity: 0,
      airQuality: 0,
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
      airQuality: true,
      light: true
    }
  };

  // --------------------------------------------------------------------------
  // GIAO TIẾP MÁY CHỦ API (FETCH SAFE WRAPPER)
  // --------------------------------------------------------------------------
  async function api(url, data) {
    const opts = data === undefined ? {} : {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    };

    let res;
    try {
      res = await fetch(url, opts);
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
  class StarfieldEngine {
    constructor(canvasId) {
      this.canvas = $(canvasId);
      if (!this.canvas) return;
      this.ctx = this.canvas.getContext('2d');
      this.stars = [];
      this.shootingStars = [];
      this.starCount = 140;
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.mouseX = 0;
      this.mouseY = 0;
      this.targetMouseX = 0;
      this.targetMouseY = 0;
      this.rafId = null;
      this.lastTime = performance.now();
      this.nextShootingStarTime = performance.now() + 5000;
      this.fpsFrames = 0;
      this.fpsStartTime = performance.now();
      this.fpsBenchmarkDone = false;

      this.initStars();
      this.bindEvents();
      this.resize();
    }

    initStars() {
      this.stars = [];
      for (let i = 0; i < this.starCount; i++) {
        this.stars.push({
          x: Math.random() * this.width,
          y: Math.random() * this.height,
          radius: Math.random() * 1.5 + 0.4,
          layer: Math.floor(Math.random() * 3) + 1, // 1: xa, 2: vừa, 3: gần
          alpha: Math.random() * 0.7 + 0.3,
          baseAlpha: Math.random() * 0.7 + 0.3,
          twinkleSpeed: Math.random() * 0.03 + 0.01,
          twinkleDir: Math.random() > 0.5 ? 1 : -1,
          color: this.randomStarColor()
        });
      }
    }

    randomStarColor() {
      const colors = ['#ffffff', '#e0e7ff', '#a5b4fc', '#67e8f9', '#fbcfe8'];
      return colors[Math.floor(Math.random() * colors.length)];
    }

    bindEvents() {
      window.addEventListener('resize', () => this.resize(), { passive: true });

      // Parallax chuột (chỉ chạy khi chế độ FX full và không phải mobile)
      window.addEventListener('mousemove', e => {
        if (appState.fxMode !== 'full' || window.innerWidth < 768) return;
        this.targetMouseX = (e.clientX - this.width / 2) * 0.025;
        this.targetMouseY = (e.clientY - this.height / 2) * 0.025;
      }, { passive: true });

      // Tạm dừng khi tab ẩn để tiết kiệm pin/CPU
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.stop();
        } else {
          this.start();
        }
      });
    }

    resize() {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = Math.floor(this.width * this.dpr);
      this.canvas.height = Math.floor(this.height * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    spawnShootingStar() {
      if (appState.fxMode !== 'full') return;
      // Tránh rơi trực tiếp lên khu vực trung tâm thẻ KPI
      const startX = Math.random() * (this.width * 0.8) + this.width * 0.1;
      const startY = Math.random() * (this.height * 0.3);
      const angle = (Math.PI / 4) + (Math.random() * 0.2 - 0.1); // ~45 độ
      const speed = Math.random() * 6 + 7;
      const length = Math.random() * 80 + 70;

      this.shootingStars.push({
        x: startX,
        y: startY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        length,
        life: 1.0,
        decay: Math.random() * 0.012 + 0.015
      });

      // Lần xuất hiện tiếp theo: ngẫu nhiên 7 - 12 giây
      this.nextShootingStarTime = performance.now() + (Math.random() * 5000 + 7000);
    }

    start() {
      if (this.rafId) return;
      this.lastTime = performance.now();
      const loop = now => {
        this.update(now);
        this.draw();
        this.rafId = requestAnimationFrame(loop);
      };
      this.rafId = requestAnimationFrame(loop);
    }

    stop() {
      if (this.rafId) {
        cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
    }

    update(now) {
      // Benchmark FPS trong 3 giây đầu tiên
      if (!this.fpsBenchmarkDone) {
        this.fpsFrames++;
        const elapsed = now - this.fpsStartTime;
        if (elapsed >= 3000) {
          const fps = (this.fpsFrames / elapsed) * 1000;
          this.fpsBenchmarkDone = true;
          // Nếu FPS < 30 hoặc người dùng bật prefers-reduced-motion -> chuyển sang "reduced"
          if (fps < 30 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            setFxMode('reduced');
            toast('Đã tự động tối ưu sang Hiệu ứng Giảm để đạt độ mượt trên thiết bị.');
          }
        }
      }

      if (appState.fxMode === 'off') return;

      // Làm mượt dịch chuyển chuột (lerp)
      this.mouseX += (this.targetMouseX - this.mouseX) * 0.05;
      this.mouseY += (this.targetMouseY - this.mouseY) * 0.05;

      // Cập nhật các ngôi sao
      for (const s of this.stars) {
        if (appState.fxMode === 'full') {
          // Trôi chậm theo layer
          s.y -= s.layer * 0.12;
          if (s.y < 0) {
            s.y = this.height;
            s.x = Math.random() * this.width;
          }
        }

        // Nhấp nháy nhẹ
        s.alpha += s.twinkleSpeed * s.twinkleDir;
        if (s.alpha > s.baseAlpha + 0.25) {
          s.alpha = s.baseAlpha + 0.25;
          s.twinkleDir = -1;
        } else if (s.alpha < s.baseAlpha - 0.25) {
          s.alpha = s.baseAlpha - 0.25;
          s.twinkleDir = 1;
        }
      }

      // Sao băng (chỉ ở full FX)
      if (appState.fxMode === 'full') {
        if (now > this.nextShootingStarTime) {
          this.spawnShootingStar();
        }

        for (let i = this.shootingStars.length - 1; i >= 0; i--) {
          const ss = this.shootingStars[i];
          ss.x += ss.vx;
          ss.y += ss.vy;
          ss.life -= ss.decay;
          if (ss.life <= 0 || ss.x > this.width + 100 || ss.y > this.height + 100) {
            this.shootingStars.splice(i, 1);
          }
        }
      }
    }

    draw() {
      this.ctx.clearRect(0, 0, this.width, this.height);

      if (appState.fxMode === 'off') return;

      // Vẽ các vì sao
      for (const s of this.stars) {
        let drawX = s.x;
        let drawY = s.y;

        if (appState.fxMode === 'full') {
          // Parallax dịch chuyển theo layer
          drawX += this.mouseX * (s.layer * 0.4);
          drawY += this.mouseY * (s.layer * 0.4);
        }

        this.ctx.fillStyle = s.color;
        this.ctx.globalAlpha = clamp(s.alpha, 0.1, 1.0);
        this.ctx.beginPath();
        this.ctx.arc(drawX, drawY, s.radius, 0, Math.PI * 2);
        this.ctx.fill();
      }

      // Vẽ sao băng
      if (appState.fxMode === 'full') {
        for (const ss of this.shootingStars) {
          const tailX = ss.x - ss.vx * (ss.length / 8);
          const tailY = ss.y - ss.vy * (ss.length / 8);

          const grad = this.ctx.createLinearGradient(ss.x, ss.y, tailX, tailY);
          grad.addColorStop(0, `rgba(255, 255, 255, ${ss.life})`);
          grad.addColorStop(0.3, `rgba(0, 245, 212, ${ss.life * 0.7})`);
          grad.addColorStop(1, 'rgba(179, 136, 255, 0)');

          this.ctx.strokeStyle = grad;
          this.ctx.lineWidth = 1.5;
          this.ctx.beginPath();
          this.ctx.moveTo(ss.x, ss.y);
          this.ctx.lineTo(tailX, tailY);
          this.ctx.stroke();

          // Đầu phát sáng của sao băng
          this.ctx.fillStyle = `rgba(255, 255, 255, ${ss.life})`;
          this.ctx.beginPath();
          this.ctx.arc(ss.x, ss.y, 1.5, 0, Math.PI * 2);
          this.ctx.fill();
        }
      }

      this.ctx.globalAlpha = 1.0;
    }
  }

  // --------------------------------------------------------------------------
  // 2. BỘ ĐIỀU KHIỂN CHẾ ĐỘ HIỆU ỨNG (FX CONTROLLER) & GIAO DIỆN SÁNG/TỐI
  // --------------------------------------------------------------------------
  function setFxMode(mode) {
    appState.fxMode = mode;
    localStorage.setItem('galaxy_fx', mode);
    document.documentElement.dataset.fx = mode;

    const label = $('fx-mode-label');
    const btn = $('fx-toggle');
    if (label) {
      if (mode === 'full') label.textContent = 'FX: Đầy đủ';
      else if (mode === 'reduced') label.textContent = 'FX: Giảm';
      else label.textContent = 'FX: Tắt';
    }
    if (btn) {
      btn.setAttribute('aria-label', `Hiệu ứng đồ họa: ${mode === 'full' ? 'Đầy đủ' : mode === 'reduced' ? 'Giảm' : 'Tắt'}`);
    }
  }

  function cycleFxMode() {
    const modes = ['full', 'reduced', 'off'];
    const nextIdx = (modes.indexOf(appState.fxMode) + 1) % modes.length;
    setFxMode(modes[nextIdx]);
    toast(`Đã chuyển hiệu ứng: ${modes[nextIdx] === 'full' ? 'Đầy đủ' : modes[nextIdx] === 'reduced' ? 'Giảm (Tiết kiệm GPU)' : 'Tắt hoàn toàn'}`);
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
      btn.setAttribute('aria-label', `Đang ở chế độ ${theme === 'dark' ? 'Vũ trụ Tối' : 'Bình minh Sáng'}. Nhấn để đổi.`);
    }
  }

  function toggleTheme() {
    const newTheme = appState.theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    toast(`Đã chuyển sang giao diện ${newTheme === 'dark' ? 'Vũ Trụ Tối (Dark)' : 'Bình Minh Không Gian (Light)'}`);
  }

  // --------------------------------------------------------------------------
  // 3. TOÁN HỌC & ĐỒ HỌA SVG ARC GAUGE (ĐỒNG HỒ CUNG TRÒN VŨ TRỤ)
  // --------------------------------------------------------------------------
  // Tâm đồng hồ: (100, 95), Bán kính r = 75.
  // Thang đo chạy từ góc 180 độ (bên trái, x=25, y=95) sang góc 0 độ (bên phải, x=175, y=95).
  function updateSvgGauge(gaugeKey, value, min, max) {
    const needle = $(`needle-${gaugeKey}`);
    const prog = $(`prog-${gaugeKey}`);
    if (!needle || !prog) return;

    if (value == null || isNaN(value)) {
      needle.style.transform = 'rotate(0deg)';
      needle.setAttribute('transform', 'rotate(0 100 95)');
      prog.setAttribute('d', 'M 25 95 A 75 75 0 0 1 25 95');
      return;
    }

    const ratio = clamp((value - min) / (max - min), 0, 1);

    // Tính góc kim: từ 0 độ (trái) tới 180 độ (phải)
    // Đường thẳng ban đầu x1=100, y1=95, x2=35, y2=95 chỉ sang trái (0 độ)
    const angleDeg = ratio * 180;
    needle.style.transform = `rotate(${angleDeg.toFixed(2)}deg)`;
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
    if (appState.fxMode === 'off' || !appState.displayedValues[key]) {
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
        airQuality: { label: 'Khí tương đối', unit: 'điểm', color: '#b388ff', axis: 'left', min: 0, max: 100 },
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
      const data = appState.historyData;
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
      const textColor = isDark ? 'rgba(255, 255, 255, 0.5)' : 'rgba(20, 20, 30, 0.6)';

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

      const data = appState.historyData;
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
      const getX = index => padLeft + (index / (data.length - 1)) * plotW;
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
    const snap = appState.snapshot;
    if (!snap) return;

    const device = snap.device;
    if (!device || !device.online) {
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
    if (stateLabel) stateLabel.textContent = 'Đang gửi lệnh...';
    if (toggleBtn) toggleBtn.setAttribute('disabled', 'true');

    // Chuẩn bị payload cấu hình gửi lên /api/settings
    const patch = {};
    if (type === 'fan') patch.manualFan = targetValue;
    if (type === 'led') patch.led = targetValue;
    if (type === 'buzzer') patch.manualBuzzer = targetValue;

    const startTime = Date.now();

    // Hủy bỏ bộ hẹn giờ cũ nếu có
    if (appState.pendingCommands[type]?.timer) {
      clearTimeout(appState.pendingCommands[type].timer);
    }

    const timer = setTimeout(() => {
      // Đã quá 3000ms mà không nhận được ACK xác nhận
      handleAckTimeout(type);
    }, 3000);

    appState.pendingCommands[type] = {
      targetValue,
      startTime,
      timer
    };

    try {
      await api('/api/settings', patch);
      // HTTP 200 đã hoàn tất; tiếp tục đợi gói phản hồi thật từ thiết bị qua SSE
    } catch (err) {
      clearTimeout(timer);
      appState.pendingCommands[type] = null;
      if (row) row.classList.remove('act-pending');
      if (toggleBtn) toggleBtn.removeAttribute('disabled');
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
    if (toggleBtn && appState.snapshot?.settings?.mode === 'manual') {
      toggleBtn.removeAttribute('disabled');
    }
    if (ackIndicator) {
      ackIndicator.textContent = `Đã nhận ACK thành công cho ${type === 'fan' ? 'quạt' : type === 'led' ? 'đèn' : 'còi'}.`;
    }
    toast(`Đã xác nhận phản hồi ACK từ thiết bị (${type})`);
  }

  function handleAckTimeout(type) {
    const pending = appState.pendingCommands[type];
    if (!pending) return;
    appState.pendingCommands[type] = null;

    const row = $(`act-row-${type}`);
    const toggleBtn = $(`${type}-toggle`);
    const stateLabel = $(`${type}-state`);

    if (row) {
      row.classList.remove('act-pending');
      row.classList.add('ack-error');
      setTimeout(() => row.classList.remove('ack-error'), 1800);
    }
    if (toggleBtn && appState.snapshot?.settings?.mode === 'manual') {
      toggleBtn.removeAttribute('disabled');
    }

    // Hoàn nguyên nhãn về trạng thái thực của thiết bị
    const realState = appState.snapshot?.device?.[type];
    if (stateLabel) {
      stateLabel.textContent = realState ? 'Đang BẬT' : 'Đang TẮT';
    }

    const name = type === 'fan' ? 'Quạt' : type === 'led' ? 'Đèn' : 'Còi';
    showConsoleNotice(`Quá hạn 3 giây: Thiết bị không phản hồi ACK cho ${name}. Trạng thái giữ nguyên.`, 'error');
    toast(`Cảnh báo: ${name} không gửi ACK sau 3 giây!`);
  }

  // --------------------------------------------------------------------------
  // 6. RENDER GIAO DIỆN CHÍNH DỰA TRÊN SNAPSHOT (DATA BINDING)
  // --------------------------------------------------------------------------
  function renderSnapshot(snap) {
    if (!snap) return;
    appState.snapshot = snap;

    // 1. Cập nhật đồng hồ trạm
    const clockEl = $('console-clock');
    if (clockEl) {
      clockEl.textContent = formatLocalTime(snap.device?.at || snap.serverTime);
    }

    // 2. Cập nhật chỉ báo kết nối (Pulse Sonar)
    const connPulse = $('connection-pulse');
    const connCore = $('connection-core');
    const connText = $('connection-text');
    const isOnline = Boolean(snap.device?.online);

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

    // 6. Cập nhật 4 KPI Bento Cards & SVG Gauges
    const d = snap.device || {};

    // 6.1 Nhiệt độ (0 - 60 °C, bật >=30, tắt <=28)
    const curTemp = d.temperature;
    animateKpiNumber('temperature', curTemp, 1);
    updateTrendBadge('temperature', curTemp);
    updateSvgGauge('temp', curTemp, 0, 60);
    appState.prevValues.temperature = curTemp;

    // Hiệu ứng cảnh báo rung đập thẻ khi vượt ngưỡng nguy hiểm
    const cardTemp = $('card-temp');
    if (cardTemp) {
      cardTemp.classList.toggle('danger-pulse', curTemp >= 30);
    }

    // 6.2 Độ ẩm (0 - 100 %, cảnh báo >=80%)
    const curHum = d.humidity;
    animateKpiNumber('humidity', curHum, 1);
    updateTrendBadge('humidity', curHum);
    updateSvgGauge('hum', curHum, 0, 100);
    appState.prevValues.humidity = curHum;

    const cardHum = $('card-hum');
    if (cardHum) {
      cardHum.classList.toggle('danger-pulse', curHum >= 80);
    }

    // 6.3 Mức khí tương đối (MQ135: 0 - 100 điểm, bật >=70, tắt <=55)
    const curGas = d.airQuality;
    animateKpiNumber('airQuality', curGas, 0);
    updateTrendBadge('airQuality', curGas);
    updateSvgGauge('gas', curGas, 0, 100);
    appState.prevValues.airQuality = curGas;

    const cardGas = $('card-gas');
    if (cardGas) {
      cardGas.classList.toggle('danger-pulse', curGas >= 70);
    }

    // 6.4 Ánh sáng tương đối % (LDR: 0 - 100 %, bật <=25, tắt >=40)
    const curLight = d.light;
    animateKpiNumber('light', curLight, 0);
    updateTrendBadge('light', curLight);
    updateSvgGauge('light', curLight, 0, 100);
    appState.prevValues.light = curLight;

    // 7. Thẻ Radar Sonar PIR
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

      // Nếu đang đợi ACK và trạng thái đã khớp với targetValue
      if (pending && realState === pending.targetValue && d.acknowledged) {
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

          if (!isOnline || !isManual) {
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

    // Cập nhật giá trị hiển thị trong 4 thẻ quy tắc mô tả
    const setVal = (id, text) => {
      const el = $(id);
      if (el) el.textContent = text;
    };
    if (settings.onTemperature != null) setVal('rule-desc-tempOn', `≥ ${settings.onTemperature} °C`);
    if (settings.offTemperature != null) setVal('rule-desc-tempOff', `≤ ${settings.offTemperature} °C`);
    if (settings.airQualityOn != null) setVal('rule-desc-airOn', `≥ ${settings.airQualityOn} điểm`);
    if (settings.airQualityOff != null) setVal('rule-desc-airOff', `≤ ${settings.airQualityOff} điểm`);
    if (settings.lightOn != null) setVal('rule-desc-lightOn', `≤ ${settings.lightOn}%`);
    if (settings.lightOff != null) setVal('rule-desc-lightOff', `≥ ${settings.lightOff}%`);
    if (settings.humidityAlert != null) setVal('rule-desc-humAlert', `≥ ${settings.humidityAlert}%`);

    // Đồng bộ các trường input nếu người dùng không đang nhập liệu
    const rulesForm = $('rules-form');
    if (rulesForm && !rulesForm.matches(':focus-within')) {
      const keys = ['onTemperature', 'offTemperature', 'airQualityOn', 'airQualityOff', 'lightOn', 'lightOff', 'humidityAlert'];
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
      list.innerHTML = '';
      const li = document.createElement('li');
      li.className = 'event-feed-empty';
      li.textContent = 'Chưa có sự kiện nào được ghi nhận từ trạm.';
      list.appendChild(li);
      if (count) count.textContent = '0 sự kiện';
      return;
    }

    if (count) count.textContent = `${events.length} sự kiện`;
    list.innerHTML = '';

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
    grid.innerHTML = '';

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
  async function loadHistoryData() {
    try {
      const history = await api('/api/history');
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
      tbody.innerHTML = '<tr><td colspan="6" class="table-empty">Chưa có dữ liệu lịch sử trong cơ sở dữ liệu.</td></tr>';
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

    tbody.innerHTML = '';
    pageItems.forEach(row => {
      const tr = document.createElement('tr');

      const tdTime = document.createElement('td');
      tdTime.textContent = formatLocalDateTime(row.at);

      const tdTemp = document.createElement('td');
      tdTemp.textContent = row.temperature != null ? Number(row.temperature).toFixed(1) : '--';

      const tdHum = document.createElement('td');
      tdHum.textContent = row.humidity != null ? Number(row.humidity).toFixed(1) : '--';

      const tdGas = document.createElement('td');
      tdGas.textContent = row.airQuality != null ? Number(row.airQuality).toFixed(0) : '--';

      const tdLight = document.createElement('td');
      tdLight.textContent = row.light != null ? Number(row.light).toFixed(0) : '--';

      const tdMotion = document.createElement('td');
      tdMotion.textContent = row.motion === true ? 'Có' : row.motion === false ? 'Không' : '--';

      tr.appendChild(tdTime);
      tr.appendChild(tdTemp);
      tr.appendChild(tdHum);
      tr.appendChild(tdGas);
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
            airQuality: snap.device.airQuality,
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
          dl.innerHTML = '';
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
    window.starfieldEngine = new StarfieldEngine('starfield-canvas');
    if (window.starfieldEngine) window.starfieldEngine.start();

    // Khởi tạo Canvas Biểu đồ 2 trục
    window.chartEngine = new GalaxyChartEngine('history-chart');

    // Thiết lập sự kiện người dùng
    setupEventListeners();

    // Lấy snapshot ban đầu và kết nối SSE Realtime
    fetchInitialStatus();
    connectEventSource();
    loadHistoryData();
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
