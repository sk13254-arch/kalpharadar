// public/app.js — 『공시·배당 스나이퍼 PRO (K-Alpha Radar)』
// 로컬 Node 서버(http://localhost:3700) 및 GitHub Pages 영구 무료 클라우드 호스팅(https://sk13254-arch.github.io/kalpharadar/) 듀얼 지원 엔진

const state = {
  overview: null,
  dartFilter: "all",
  dartQuery: "",
  supplyChain: null,
  watchlist: [],
  dividends: null
};

function getStaticBundle() {
  return window.KALPHARADAR_STATIC || null;
}

function getLocalWatchlist() {
  const bundle = getStaticBundle();
  try {
    const saved = localStorage.getItem("kalpharadar_watchlist_v1");
    if (saved) return JSON.parse(saved);
  } catch (_) {}
  return JSON.parse(JSON.stringify((bundle && bundle.defaultWatchlist) || []));
}

function saveLocalWatchlist(list) {
  try {
    localStorage.setItem("kalpharadar_watchlist_v1", JSON.stringify(list));
  } catch (_) {}
}

function enrichStaticWatchlist(rawList) {
  const bundle = getStaticBundle();
  const dartFeed = (bundle && bundle.dartFeed) || [];
  const targets = (bundle && bundle.supplyChain && bundle.supplyChain.targets) || [];
  const targetsByName = {};
  targets.forEach((t) => {
    targetsByName[t.name] = t;
  });

  return (rawList || []).map((item) => {
    const matchedDisclosures = dartFeed.filter((d) => d.name === item.name);
    const hasToxic = matchedDisclosures.some((d) => d.signalTone === "toxic");
    const hasBull = matchedDisclosures.some((d) => d.signalTone === "bull");
    const supplyMatch = targetsByName[item.name] || null;
    return {
      ...item,
      statusBadge: hasToxic
        ? "🚨 독소공시 발생 (즉시 점검)"
        : hasBull
        ? "🔥 S/A급 호재 공시 포착"
        : supplyMatch
        ? `🌏 미장 ${supplyMatch.us_lead_ticker} +${supplyMatch.us_lead_chg}% 수혜`
        : "🛡️ 정상 감시 중 (이상 무)",
      statusTone: hasToxic ? "toxic" : hasBull ? "bull" : supplyMatch ? "supply" : "safe",
      matchedDisclosures,
      supplyMatch
    };
  });
}

async function fetchJson(url, options) {
  try {
    const res = await fetch(url, options);
    if (res.ok) {
      const ct = res.headers.get("content-type") || "";
      if (ct.includes("application/json")) {
        return await res.json();
      }
    }
  } catch (_) {}

  // 정적 호스팅(GitHub Pages) 폴백 처리
  const bundle = getStaticBundle();
  if (!bundle) return { ok: false };

  if (url.startsWith("/api/overview")) {
    return bundle.overview;
  }
  if (url.startsWith("/api/dart-feed")) {
    const u = new URL(url, window.location.origin);
    const filter = (u.searchParams.get("filter") || "all").toLowerCase();
    const q = (u.searchParams.get("q") || "").trim().toLowerCase();
    let feed = [...(bundle.dartFeed || [])];
    if (filter === "approve" || filter === "bull") {
      feed = feed.filter((d) => d.signalTone === "bull");
    } else if (filter === "toxic") {
      feed = feed.filter((d) => d.signalTone === "toxic");
    } else if (filter === "treasury") {
      feed = feed.filter((d) => d.category === "TREASURY_BURN" || d.category === "TREASURY_BUYBACK");
    } else if (filter === "supply") {
      feed = feed.filter((d) => d.category === "SUPPLY_CONTRACT");
    }
    if (q) {
      feed = feed.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.title.toLowerCase().includes(q) ||
          (d.aiAuditReason || "").toLowerCase().includes(q)
      );
    }
    return { ok: true, total: feed.length, items: feed };
  }
  if (url.startsWith("/api/supply-chain")) {
    return bundle.supplyChain;
  }
  if (url.startsWith("/api/dividends")) {
    return bundle.dividends;
  }
  if (url.startsWith("/api/watchlist")) {
    if (options && options.method === "POST") {
      const body = JSON.parse(options.body || "{}");
      let list = getLocalWatchlist();
      if (body.action === "remove" && body.name) {
        list = list.filter((w) => w.name !== body.name);
      } else if (body.name) {
        const cleanName = String(body.name).trim();
        if (!list.some((w) => w.name === cleanName)) {
          list = [
            {
              code: String(body.code || "000000").trim(),
              name: cleanName,
              sector: String(body.sector || "보유 감시 종목").trim(),
              alertOnToxic: true,
              alertOnCatalyst: true
            },
            ...list
          ].slice(0, 8);
        }
      }
      saveLocalWatchlist(list);
      return { ok: true, watchlist: enrichStaticWatchlist(list) };
    }
    return { ok: true, watchlist: enrichStaticWatchlist(getLocalWatchlist()) };
  }
  if (url.startsWith("/api/checkout")) {
    const body = (options && options.body && JSON.parse(options.body)) || {};
    const planId = body.planId || "pro_monthly";
    const plans = {
      pro_monthly: { name: "공시·배당 스나이퍼 PRO 월 정기구독", amount: 29000 },
      pro_annual: { name: "공시·배당 스나이퍼 PRO 연간 VIP 패스 (31% 할인)", amount: 240000 }
    };
    const chosen = plans[planId] || plans.pro_monthly;
    return {
      ok: true,
      order: {
        orderId: `KALPHARADAR_${Date.now()}_${Math.floor(Math.random() * 9000 + 1000)}`,
        planId,
        planName: chosen.name,
        amount: chosen.amount,
        merchant: {
          company: "다니마켓 (K-PICK STORE)",
          representative: "김정애",
          bizRegNo: "307-37-01599"
        }
      }
    };
  }
  return { ok: false };
}

function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

async function initApp() {
  setupTabs();
  setupActions();
  await Promise.all([
    loadOverview(),
    loadDartFeed(),
    loadSupplyChain(),
    loadWatchlist(),
    loadDividends()
  ]);
}

function setupTabs() {
  document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
      btn.classList.add("active");
      const target = document.getElementById(btn.dataset.tab);
      if (target) target.classList.add("active");
    });
  });

  document.querySelectorAll("#dartFilterChips .chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.querySelectorAll("#dartFilterChips .chip").forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");
      state.dartFilter = chip.dataset.filter || "all";
      loadDartFeed();
    });
  });

  const searchInput = document.getElementById("dartSearchInput");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      state.dartQuery = e.target.value || "";
      loadDartFeed();
    });
  }
}

async function loadOverview() {
  const data = await fetchJson("/api/overview");
  if (!data.ok) return;
  state.overview = data;

  document.getElementById("updatedAtLabel").textContent = `최근 동기화: ${data.engineStatus.updatedAt}`;
  document.getElementById("krStanceBadge").textContent = `오늘 국장 스탠스: ${data.engineStatus.krStance}`;
  if (data.engineStatus.krSummary) {
    document.getElementById("krSummaryText").textContent = data.engineStatus.krSummary.replace(/\[.*?\]\(.*?\)/g, "");
  }

  document.getElementById("kpiTotalDart").textContent = `${data.counts.totalDisclosuresToday}건`;
  document.getElementById("kpiBullDart").textContent = `${data.counts.bullCatalysts}건`;
  document.getElementById("kpiToxicDart").textContent = `${data.counts.toxicAlerts}건`;
  document.getElementById("kpiActiveSectors").textContent = `${data.counts.activeSupplySectors}개`;

  document.getElementById("morningScriptBox").textContent = data.morningVoiceScript;

  const voiceSelect = document.getElementById("ttsVoiceSelect");
  if (voiceSelect && Array.isArray(data.voices)) {
    voiceSelect.innerHTML = data.voices
      .map((v) => `<option value="${escapeHtml(v.id)}">${escapeHtml(v.label)}</option>`)
      .join("");
  }
}

async function loadDartFeed() {
  const url = `/api/dart-feed?filter=${encodeURIComponent(state.dartFilter)}&q=${encodeURIComponent(state.dartQuery)}`;
  const data = await fetchJson(url);
  const container = document.getElementById("dartFeedContainer");
  if (!data.ok || !container) return;

  if (!data.items.length) {
    container.innerHTML = `<div class="card">조건에 맞는 실시간 공시가 없습니다.</div>`;
    return;
  }

  container.innerHTML = data.items
    .map((item) => {
      const linesHtml = (item.threeLineSummary || [])
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join("");

      return `
        <article class="dart-card ${escapeHtml(item.signalTone)}">
          <div class="dart-header">
            <div>
              <div class="stock-name">${escapeHtml(item.name)} <span style="font-size:0.78rem;color:#94a3b8;font-weight:500;">${escapeHtml(item.dt)}</span></div>
              <div style="font-size:0.86rem;color:#e2e8f0;margin-top:2px;font-weight:600;">${escapeHtml(item.title)}</div>
            </div>
            <span class="grade-pill ${escapeHtml(item.signalTone)}">${escapeHtml(item.signalGrade)}</span>
          </div>
          <div class="three-lines">${linesHtml}</div>
          <div class="stat-strip">
            <span>📈 유사공시 당일평균: <strong>${escapeHtml(item.backtest.avgDay1Return)}</strong> · 5일: <strong>${escapeHtml(item.backtest.avgDay5Return)}</strong> (${escapeHtml(item.backtest.winRate)})</span>
            <div style="display:flex;gap:6px;">
              <button class="btn btn-outline" style="padding:4px 9px;font-size:0.74rem;" onclick="speakText(${JSON.stringify(
                `${item.name}, ${item.title}. ${item.threeLineSummary.join(" ")}`
              ).replace(/"/g, "&quot;")})">🔊 음성듣기</button>
              <button class="btn btn-outline" style="padding:4px 9px;font-size:0.74rem;" onclick="sendAlertToTelegram(${JSON.stringify(
                `🎯 [K-Alpha Radar 공시 포착]\n• 종목: ${item.name} (${item.signalGrade})\n• 공시: ${item.title}\n• ${item.threeLineSummary.join("\n• ")}`
              ).replace(/"/g, "&quot;")})">✈️ 텔레그램/공유</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

async function loadSupplyChain() {
  const data = await fetchJson("/api/supply-chain");
  if (!data.ok) return;
  state.supplyChain = data;

  const moversEl = document.getElementById("usMoversStrip");
  if (moversEl) {
    moversEl.innerHTML = (data.usMovers || [])
      .map(
        (m) =>
          `<span class="grade-pill bull" style="font-size:0.8rem;">🇺🇸 ${escapeHtml(m.ticker)} $${m.price} (+${m.change_pct}%)</span>`
      )
      .join("");
  }

  const sectorEl = document.getElementById("sectorGridContainer");
  if (sectorEl) {
    sectorEl.innerHTML = (data.activeSectors || [])
      .map(
        (sec, idx) => `
        <div class="sector-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span class="grade-pill bull">${idx + 1}순위 전이 섹터</span>
            <span style="font-size:0.82rem;color:#38bdf8;font-weight:800;">동조점수 ${sec.sector_score}점</span>
          </div>
          <div style="font-size:1.05rem;font-weight:800;margin-bottom:6px;">${escapeHtml(sec.label)}</div>
          <div style="font-size:0.83rem;color:#cbd5e1;">선행 미국 대장주: <strong>${escapeHtml(sec.lead_ticker)} (+${sec.lead_change_pct}%)</strong> · 섹터평균 +${sec.avg_change_pct}%</div>
        </div>
      `
      )
      .join("");
  }

  const targetsEl = document.getElementById("supplyTargetsContainer");
  if (targetsEl) {
    targetsEl.innerHTML = (data.targets || [])
      .map(
        (t) => `
        <div class="dart-card bull">
          <div class="dart-header">
            <div>
              <div class="stock-name">${escapeHtml(t.name)} <span style="font-size:0.78rem;color:#94a3b8;">(${escapeHtml(t.code)} · Tier ${t.tier})</span></div>
              <div style="font-size:0.83rem;color:#38bdf8;font-weight:700;">${escapeHtml(t.sector_label)}</div>
            </div>
            <span class="grade-pill bull">우선순위 ${t.priority_score}점</span>
          </div>
          <div class="three-lines">
            <div>① [공급망 역할] ${escapeHtml(t.role)}</div>
            <div>② [미장 동조 트리거] ${escapeHtml(t.reason)} (선행주 ${escapeHtml(t.us_lead_ticker)} +${t.us_lead_chg}%)</div>
          </div>
        </div>
      `
      )
      .join("");
  }
}

async function loadWatchlist() {
  const data = await fetchJson("/api/watchlist");
  const container = document.getElementById("watchlistContainer");
  if (!data.ok || !container) return;
  state.watchlist = data.watchlist || [];

  container.innerHTML = state.watchlist
    .map((item) => {
      const toneClass = item.statusTone === "toxic" ? "toxic" : item.statusTone === "bull" ? "bull" : "";
      const pillClass = item.statusTone === "toxic" ? "toxic" : item.statusTone === "bull" ? "bull" : "neutral";
      const discHtml = (item.matchedDisclosures || [])
        .map((d) => `<div>• [${escapeHtml(d.dt)}] <strong>${escapeHtml(d.title)}</strong> (${escapeHtml(d.signalGrade)})</div>`)
        .join("");

      return `
        <div class="dart-card ${toneClass}">
          <div class="dart-header">
            <div>
              <div class="stock-name">${escapeHtml(item.name)} <span style="font-size:0.78rem;color:#94a3b8;">${escapeHtml(item.sector)}</span></div>
            </div>
            <span class="grade-pill ${pillClass}">${escapeHtml(item.statusBadge)}</span>
          </div>
          <div class="three-lines">
            ${discHtml || "<div>• 최근 24시간 내 유상증자·CB 등 독소 공시가 발견되지 않았습니다.</div>"}
            ${
              item.supplyMatch
                ? `<div>• 🌏 [미장 수혜 매칭] ${escapeHtml(item.supplyMatch.role)} (${escapeHtml(item.supplyMatch.reason)})</div>`
                : ""
            }
          </div>
          <div class="stat-strip">
            <span>실시간 0.5초 DART 감시 활성</span>
            <button class="btn btn-outline" style="padding:4px 9px;font-size:0.74rem;" onclick="removeWatchItem(${JSON.stringify(
              item.name
            ).replace(/"/g, "&quot;")})">삭제</button>
          </div>
        </div>
      `;
    })
    .join("");
}

async function removeWatchItem(name) {
  await fetchJson("/api/watchlist", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "remove", name })
  });
  await loadWatchlist();
}

async function loadDividends() {
  const data = await fetchJson("/api/dividends");
  const container = document.getElementById("dividendContainer");
  if (!data.ok || !container) return;

  container.innerHTML = (data.calendar || [])
    .map(
      (ev) => `
      <div class="dart-card bull">
        <div class="dart-header">
          <div>
            <div class="stock-name">${escapeHtml(ev.name)} <span style="font-size:0.78rem;color:#94a3b8;">(${escapeHtml(ev.code)} · ${escapeHtml(ev.market)})</span></div>
            <div style="font-size:0.86rem;color:#34d399;font-weight:700;">${escapeHtml(ev.eventType)}</div>
          </div>
          <span class="grade-pill bull">${escapeHtml(ev.badge)}</span>
        </div>
        <div class="three-lines">
          <div>① [환원 규모/수익률] ${escapeHtml(ev.yieldOrScale)}</div>
          <div>② [핵심 일정/기준일] ${escapeHtml(ev.exDate)}</div>
          <div>③ [투자 포인트] ${escapeHtml(ev.note)}</div>
        </div>
      </div>
    `
    )
    .join("");
}

function speakBrowserFallback(text) {
  if (!("speechSynthesis" in window)) return;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ko-KR";
    u.rate = 1.02;
    window.speechSynthesis.speak(u);
  } catch (_) {}
}

async function speakText(text) {
  const voiceSelect = document.getElementById("ttsVoiceSelect");
  const voice = (voiceSelect && voiceSelect.value) || "hyunsu";
  const btn = document.getElementById("btnPlayMorningTTS");
  const player = document.getElementById("ttsAudioPlayer");

  // 1) 정적 캐시 매니페스트 우선 확인 (GitHub Pages에서도 0.01초 즉시 고품질 뉴럴 성우 재생)
  const bundle = getStaticBundle();
  if (bundle && bundle.ttsManifest) {
    const cachedUrl = bundle.ttsManifest[`${voice}|${text}`] || bundle.ttsManifest[`hyunsu|${text}`];
    if (cachedUrl && player) {
      player.src = cachedUrl;
      try {
        await player.play();
        return;
      } catch (_) {}
    }
  }

  // 2) 로컬 Node 서버 API 호출
  if (btn) btn.textContent = "⏳ AI 성우 음성 합성 중...";
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok && data.audioUrl && player) {
        player.src = data.audioUrl;
        await player.play();
        return;
      }
    }
    speakBrowserFallback(text);
  } catch (_) {
    speakBrowserFallback(text);
  } finally {
    if (btn) btn.textContent = "🔊 10초 모닝 브리핑 듣기";
  }
}

async function sendAlertToTelegram(message) {
  try {
    const res = await fetch("/api/share-telegram", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message })
    });
    if (res.ok) {
      const data = await res.json();
      if (data.ok) {
        alert("✅ 텔레그램 헤르메스(@Hermes_chulmin8320_bot)로 즉시 전송되었습니다!");
        return;
      }
    }
  } catch (_) {}

  // 클라우드 정적 호스팅에서는 클립보드 복사 + 텔레그램 웹 공유 지원
  try {
    await navigator.clipboard.writeText(message);
    alert("📋 브리핑 전문이 클립보드에 복사되었습니다! 카카오톡·텔레그램·스레드에 바로 붙여넣으실 수 있습니다.");
  } catch (_) {
    alert(message);
  }
}

function downloadShareCardPng() {
  const canvas = document.getElementById("shareCardCanvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  const grad = ctx.createLinearGradient(0, 0, 1080, 1080);
  grad.addColorStop(0, "#070b14");
  grad.addColorStop(1, "#132347");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 1080, 1080);

  ctx.fillStyle = "#10b981";
  ctx.font = "bold 30px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("🎯 공시·배당 스나이퍼 PRO (K-Alpha Radar) · 08:25 개장전 수급 브리핑", 60, 85);

  ctx.fillStyle = "#f8fafc";
  ctx.font = "bold 46px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("밤새 미국장 급등 → 오늘 국장 1순위 밸류체인", 60, 155);

  const sectors = (state.supplyChain && state.supplyChain.activeSectors) || [];
  let y = 230;
  sectors.slice(0, 4).forEach((s, idx) => {
    ctx.fillStyle = "rgba(30, 41, 59, 0.9)";
    ctx.fillRect(60, y, 960, 125);
    ctx.fillStyle = "#38bdf8";
    ctx.font = "bold 28px Pretendard, Apple SD Gothic Neo, sans-serif";
    ctx.fillText(`${idx + 1}순위. ${s.label}`, 90, y + 50);
    ctx.fillStyle = "#e2e8f0";
    ctx.font = "24px Pretendard, Apple SD Gothic Neo, sans-serif";
    ctx.fillText(`미국 선행 대장주: ${s.lead_ticker} (+${s.lead_change_pct}%)  |  동조화 점수: ${s.sector_score}점`, 90, y + 95);
    y += 145;
  });

  ctx.fillStyle = "#fbbf24";
  ctx.font = "bold 28px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("⚡ 오늘 포착 S급 호재: 휴젤(주식소각) · 디와이피엔에프(주식소각) · 컨텍(공급계약)", 60, 860);

  ctx.fillStyle = "#fb7185";
  ctx.fillText("🚨 유상증자 독소공시 경보: 셀리드 · KS인더스트리 (제3자배정 유상증자 정정)", 60, 915);

  ctx.fillStyle = "#94a3b8";
  ctx.font = "22px Pretendard, Apple SD Gothic Neo, sans-serif";
  ctx.fillText("제공: 다니마켓 (K-PICK STORE · 대표 김정애) | DART·KIND 0.5초 공시 원문 AI 요약 대시보드", 60, 1010);

  const link = document.createElement("a");
  link.download = `K-Alpha-Radar_Morning_Briefing_${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function setupActions() {
  const btnPlay = document.getElementById("btnPlayMorningTTS");
  if (btnPlay) {
    btnPlay.addEventListener("click", () => {
      const text = document.getElementById("morningScriptBox").textContent;
      speakText(text);
    });
  }

  const btnShareTg = document.getElementById("btnShareMorningTelegram");
  if (btnShareTg) {
    btnShareTg.addEventListener("click", () => {
      const text = document.getElementById("morningScriptBox").textContent;
      sendAlertToTelegram(`🎯 [공시·배당 스나이퍼 PRO 개장전 브리핑]\n\n${text}`);
    });
  }

  const btnCard1 = document.getElementById("btnDownloadBriefingCard");
  const btnCard2 = document.getElementById("btnRenderShareCard2");
  if (btnCard1) btnCard1.addEventListener("click", downloadShareCardPng);
  if (btnCard2) btnCard2.addEventListener("click", downloadShareCardPng);

  const btnAddWatch = document.getElementById("btnAddWatch");
  if (btnAddWatch) {
    btnAddWatch.addEventListener("click", async () => {
      const nameInput = document.getElementById("watchNameInput");
      const sectorInput = document.getElementById("watchSectorInput");
      const name = (nameInput.value || "").trim();
      if (!name) return;
      await fetchJson("/api/watchlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, sector: sectorInput.value || "보유 감시 종목" })
      });
      nameInput.value = "";
      sectorInput.value = "";
      await loadWatchlist();
    });
  }

  const btnOpenSub = document.getElementById("btnOpenSubscribe");
  if (btnOpenSub) {
    btnOpenSub.addEventListener("click", () => {
      const tabBtn = document.querySelector('[data-tab="tab-pricing"]');
      if (tabBtn) tabBtn.click();
    });
  }

  document.querySelectorAll("[data-plan]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const planId = btn.dataset.plan;
      const res = await fetchJson("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId })
      });
      if (res.ok && res.order) {
        const box = document.getElementById("checkoutResultBox");
        box.style.display = "block";
        box.innerHTML = `
          <h3 style="color:#34d399;margin-bottom:8px;">✅ 토스페이먼츠 정기결제 주문 세션이 생성되었습니다</h3>
          <div style="font-size:0.9rem;display:flex;flex-direction:column;gap:4px;">
            <div>• <strong>주문번호:</strong> ${escapeHtml(res.order.orderId)}</div>
            <div>• <strong>상품명:</strong> ${escapeHtml(res.order.planName)}</div>
            <div>• <strong>결제금액:</strong> ₩${Number(res.order.amount).toLocaleString()} (부가세 포함)</div>
            <div>• <strong>가맹점/대표자:</strong> ${escapeHtml(res.order.merchant.company)} / 대표자 ${escapeHtml(res.order.merchant.representative)} (사업자등록번호: ${escapeHtml(res.order.merchant.bizRegNo)})</div>
          </div>
        `;
        box.scrollIntoView({ behavior: "smooth" });
      }
    });
  });
}

window.addEventListener("DOMContentLoaded", initApp);
