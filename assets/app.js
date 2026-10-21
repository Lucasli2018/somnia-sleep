(function () {
  'use strict';

  const app = document.getElementById('app');
  const views = Array.from(document.querySelectorAll('.view'));
  const tabs = Array.from(document.querySelectorAll('.tab'));
  const statusTime = document.getElementById('statusTime');
  const homeDate = document.getElementById('homeDate');
  const toastEl = document.getElementById('toast');

  const STORE = {
    plan: 'somna-plan',
    mix: 'somna-mix',
    saved: 'somna-saved-count'
  };

  const DEFAULT_MIX = [64, 38, 22, 47];

  // 混音声道顺序与 .track-card / .track-range 的 DOM 顺序一致
  const MIX_CHANNELS = ['rain', 'ocean', 'forest', 'fire'];

  // 各呼吸练习对应的环境音预设（0~1）
  const SESSION_PRESETS = {
    deep:   { rain: 0,    ocean: 0.55, forest: 0.15, fire: 0 },
    rain:   { rain: 0.75, ocean: 0.15, forest: 0,    fire: 0 },
    aurora: { rain: 0.1,  ocean: 0.3,  forest: 0.35, fire: 0 },
    forest: { rain: 0.1,  ocean: 0.1,  forest: 0.6,  fire: 0 }
  };

  const sessions = {
    deep: {
      title: '深海呼吸',
      subtitle: '引导呼吸 · 12 分钟',
      kicker: 'SLEEP MEDITATION',
      eyebrow: '4–7–8 BREATHING',
      duration: 720,
      note: '4-7-8 呼吸 · 今晚第 1 次'
    },
    rain: {
      title: '雨夜列车',
      subtitle: '雨声 · 呼吸引导 · 45 分钟',
      kicker: 'SLEEP SOUNDSCAPE',
      eyebrow: 'RAIN · 4–7–8',
      duration: 2700,
      note: '雨声混音 · 适合入睡前'
    },
    aurora: {
      title: '极光入梦',
      subtitle: '极光冥想 · 20 分钟',
      kicker: 'AURORA MEDITATION',
      eyebrow: 'GUIDED MEDITATION',
      duration: 1200,
      note: '极光冥想 · 渐进放松'
    },
    forest: {
      title: '森林夜行',
      subtitle: '自然声景 · 60 分钟',
      kicker: 'NATURE SOUNDSCAPE',
      eyebrow: 'FOREST AMBIENCE',
      duration: 3600,
      note: '自然声景 · 整夜陪伴'
    }
  };

  function readStore(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* 隐私模式下忽略持久化失败 */
    }
  }

  /* ——— Toast ——— */
  let toastTimer = 0;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2200);
  }

  /* ——— Status bar & date ——— */
  function pad(value) {
    return String(value).padStart(2, '0');
  }

  function formatClock(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds));
    const minutes = Math.floor(safe / 60);
    const seconds = safe % 60;
    return pad(minutes) + ':' + pad(seconds);
  }

  function updateStatusTime() {
    const now = new Date();
    if (statusTime) statusTime.textContent = now.getHours() + ':' + pad(now.getMinutes());
    if (homeDate) {
      const week = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
      homeDate.textContent = (now.getMonth() + 1) + '月' + now.getDate() + '日 · ' + week[now.getDay()] + ' · 新月';
    }
  }

  updateStatusTime();
  window.setInterval(updateStatusTime, 30000);

  /* ——— View navigation ——— */
  let currentView = 'home';
  let returnView = 'home';

  function showView(name) {
    const leaving = currentView;
    currentView = name;
    app.dataset.view = name;
    views.forEach(function (view) {
      view.classList.toggle('active', view.dataset.view === name);
    });
    tabs.forEach(function (tab) {
      tab.classList.toggle('active', tab.dataset.nav === name);
    });
    if (name !== 'player' && player.playing) {
      setPlaying(false);
    }
    // 离开播放器时复位静音状态，避免影响混音页
    if (leaving === 'player' && name !== 'player') {
      player.muted = false;
      if (el.volumeBtn) {
        el.volumeBtn.classList.remove('on');
        el.volumeBtn.setAttribute('aria-pressed', 'false');
      }
      if (window.SomniaAudio) SomniaAudio.setMuted(false);
    }
    routeAudio(name);
  }

  function routeAudio(name) {
    if (!window.SomniaAudio) return;
    if (name === 'mix') {
      syncMixAudio();
    } else if (name === 'home' || name === 'report') {
      SomniaAudio.silence();
    }
    // player 视图的声音由 openSession 中的 applyPreset 负责
  }

  function syncMixAudio() {
    if (!window.SomniaAudio) return;
    SomniaAudio.ensure();
    ranges.forEach(function (range, index) {
      SomniaAudio.setChannel(MIX_CHANNELS[index], Number(range.value) / 100);
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (!tab.dataset.nav) return;
      showView(tab.dataset.nav);
    });
  });

  /* ——— Breathing player ——— */
  const player = {
    id: 'deep',
    elapsed: 0,
    playing: false,
    repeat: false,
    muted: false,
    fav: false,
    last: 0,
    raf: 0
  };

  const el = {
    playerHeaderKicker: document.getElementById('playerHeaderKicker'),
    playerHeaderTitle: document.getElementById('playerHeaderTitle'),
    playerEyebrow: document.getElementById('playerEyebrow'),
    playerTitle: document.getElementById('playerTitle'),
    playerSubtitle: document.getElementById('playerSubtitle'),
    playerGuide: document.getElementById('playerGuide'),
    playerGuideSub: document.getElementById('playerGuideSub'),
    orbStage: document.getElementById('orbStage'),
    orbWord: document.getElementById('orbWord'),
    orbSec: document.getElementById('orbSec'),
    currentTime: document.getElementById('currentTime'),
    totalTime: document.getElementById('totalTime'),
    progressTrack: document.getElementById('progressTrack'),
    progressFill: document.getElementById('progressFill'),
    playBtn: document.getElementById('playBtn'),
    repeatBtn: document.getElementById('repeatBtn'),
    prevBtn: document.getElementById('prevBtn'),
    nextBtn: document.getElementById('nextBtn'),
    volumeBtn: document.getElementById('volumeBtn'),
    playerFav: document.getElementById('playerFav'),
    playerBack: document.getElementById('playerBack'),
    sessionNote: document.getElementById('sessionNote')
  };

  const PHASES = {
    inhale: {
      word: '吸气',
      main: '让气息缓缓沉入腹部',
      sub: '像潮水漫过夜色，不必用力。'
    },
    hold: {
      word: '屏息',
      main: '轻轻停留在此刻',
      sub: '身体静止，心也跟着安静。'
    },
    exhale: {
      word: '呼气',
      main: '慢慢呼出，松开肩颈',
      sub: '把一天的重量交给夜色。'
    }
  };

  let lastPhase = '';

  function getPhase(seconds) {
    const t = seconds % 19;
    if (t < 4) return { key: 'inhale', remain: Math.ceil(4 - t) };
    if (t < 11) return { key: 'hold', remain: Math.ceil(11 - t) };
    return { key: 'exhale', remain: Math.ceil(19 - t) };
  }

  function syncBreath() {
    if (!el.orbStage) return;
    const offset = player.elapsed % 19;
    el.orbStage.style.setProperty('--breath-delay', '-' + offset.toFixed(2) + 's');
  }

  function renderPlayer() {
    const session = sessions[player.id] || sessions.deep;

    if (el.currentTime) el.currentTime.textContent = formatClock(player.elapsed);
    if (el.totalTime) el.totalTime.textContent = formatClock(session.duration);
    if (el.progressFill) {
      const percent = Math.min(100, (player.elapsed / session.duration) * 100);
      el.progressFill.style.width = percent + '%';
    }

    const phase = getPhase(player.elapsed);
    if (phase.key !== lastPhase) {
      lastPhase = phase.key;
      const copy = PHASES[phase.key];
      if (el.orbWord) el.orbWord.textContent = copy.word;
      if (el.playerGuide) el.playerGuide.textContent = copy.main;
      if (el.playerGuideSub) el.playerGuideSub.textContent = copy.sub;
    }
    if (el.orbSec) {
      const remainText = phase.remain + ' 秒';
      if (el.orbSec.textContent !== remainText) el.orbSec.textContent = remainText;
    }
  }

  function loop(timestamp) {
    if (!player.playing) return;
    if (!player.last) player.last = timestamp;
    const delta = Math.min((timestamp - player.last) / 1000, 0.5);
    player.last = timestamp;
    player.elapsed += delta;

    const session = sessions[player.id] || sessions.deep;
    if (player.elapsed >= session.duration) {
      if (player.repeat) {
        player.elapsed = player.elapsed % session.duration;
        syncBreath();
      } else {
        player.elapsed = session.duration;
        renderPlayer();
        setPlaying(false);
        toast('本次练习已完成 · 晚安');
        return;
      }
    }

    renderPlayer();
    player.raf = window.requestAnimationFrame(loop);
  }

  function setPlaying(next) {
    player.playing = next;
    if (next && window.SomniaAudio) SomniaAudio.ensure();
    window.cancelAnimationFrame(player.raf);
    player.last = 0;

    if (el.playBtn) {
      el.playBtn.classList.toggle('paused', !next);
      el.playBtn.setAttribute('aria-label', next ? '暂停' : '播放');
    }
    if (el.orbStage) {
      el.orbStage.classList.toggle('is-paused', !next);
    }

    if (next) {
      const session = sessions[player.id] || sessions.deep;
      if (player.elapsed >= session.duration) player.elapsed = 0;
      syncBreath();
      renderPlayer();
      player.raf = window.requestAnimationFrame(loop);
    }
  }

  function seekTo(seconds) {
    const session = sessions[player.id] || sessions.deep;
    player.elapsed = Math.min(session.duration, Math.max(0, seconds));
    syncBreath();
    renderPlayer();
  }

  function openSession(id) {
    const session = sessions[id] || sessions.deep;
    if (currentView !== 'player') returnView = currentView;

    player.id = id in sessions ? id : 'deep';
    player.elapsed = 0;
    player.fav = false;
    lastPhase = '';

    if (el.playerHeaderKicker) el.playerHeaderKicker.textContent = session.kicker;
    if (el.playerHeaderTitle) el.playerHeaderTitle.textContent = session.title;
    if (el.playerEyebrow) el.playerEyebrow.textContent = session.eyebrow;
    if (el.playerTitle) el.playerTitle.textContent = session.title;
    if (el.playerSubtitle) el.playerSubtitle.textContent = session.subtitle;
    if (el.sessionNote) el.sessionNote.textContent = session.note;
    if (el.playerFav) el.playerFav.classList.remove('on');

    showView('player');
    syncBreath();
    renderPlayer();
    if (window.SomniaAudio) {
      SomniaAudio.ensure();
      SomniaAudio.applyPreset(SESSION_PRESETS[player.id] || SESSION_PRESETS.deep);
    }
    setPlaying(true);
  }

  document.querySelectorAll('[data-session]').forEach(function (trigger) {
    trigger.addEventListener('click', function () {
      openSession(trigger.dataset.session);
    });
  });

  if (el.playerBack) {
    el.playerBack.addEventListener('click', function () {
      setPlaying(false);
      showView(returnView || 'home');
    });
  }

  if (el.playBtn) {
    el.playBtn.addEventListener('click', function () {
      setPlaying(!player.playing);
    });
  }

  if (el.prevBtn) {
    el.prevBtn.addEventListener('click', function () {
      seekTo(player.elapsed - 30);
    });
  }

  if (el.nextBtn) {
    el.nextBtn.addEventListener('click', function () {
      seekTo(player.elapsed + 30);
    });
  }

  if (el.repeatBtn) {
    el.repeatBtn.addEventListener('click', function () {
      player.repeat = !player.repeat;
      el.repeatBtn.classList.toggle('on', player.repeat);
      el.repeatBtn.setAttribute('aria-pressed', String(player.repeat));
      toast(player.repeat ? '循环播放已开启' : '循环播放已关闭');
    });
  }

  if (el.volumeBtn) {
    el.volumeBtn.addEventListener('click', function () {
      player.muted = !player.muted;
      el.volumeBtn.classList.toggle('on', player.muted);
      el.volumeBtn.setAttribute('aria-pressed', String(player.muted));
      if (window.SomniaAudio) SomniaAudio.setMuted(player.muted);
      toast(player.muted ? '环境音已静音' : '环境音已恢复');
    });
  }

  if (el.playerFav) {
    el.playerFav.addEventListener('click', function () {
      player.fav = !player.fav;
      el.playerFav.classList.toggle('on', player.fav);
      el.playerFav.setAttribute('aria-pressed', String(player.fav));
      toast(player.fav ? '已加入收藏' : '已取消收藏');
    });
  }

  if (el.progressTrack) {
    el.progressTrack.addEventListener('click', function (event) {
      const rect = el.progressTrack.getBoundingClientRect();
      if (!rect.width) return;
      const ratio = (event.clientX - rect.left) / rect.width;
      const session = sessions[player.id] || sessions.deep;
      seekTo(Math.min(1, Math.max(0, ratio)) * session.duration);
    });
  }

  /* ——— Sleep plan ——— */
  const planSheet = document.getElementById('planSheet');
  const planBedtime = document.getElementById('planBedtime');
  const planWakeTime = document.getElementById('planWakeTime');
  const planDuration = document.getElementById('planDuration');
  const openPlanSheet = document.getElementById('openPlanSheet');
  const confirmPlan = document.getElementById('confirmPlan');
  const planOptions = Array.from(document.querySelectorAll('.plan-option'));

  function openSheet() {
    if (!planSheet) return;
    planSheet.classList.add('open');
    planSheet.setAttribute('aria-hidden', 'false');
  }

  function closeSheet() {
    if (!planSheet) return;
    planSheet.classList.remove('open');
    planSheet.setAttribute('aria-hidden', 'true');
  }

  function applyPlan(option, silent) {
    const bed = option.dataset.bed;
    const wake = option.dataset.wake;
    const hours = option.dataset.hours;

    if (planBedtime) planBedtime.textContent = bed;
    if (planWakeTime) planWakeTime.textContent = wake;
    if (planDuration) planDuration.textContent = hours;

    planOptions.forEach(function (item) {
      item.classList.toggle('selected', item === option);
    });

    writeStore(STORE.plan, { bed: bed, wake: wake, hours: hours });
    if (!silent) toast('今晚计划已更新 · ' + bed + ' 入睡');
  }

  if (openPlanSheet) openPlanSheet.addEventListener('click', openSheet);
  if (planSheet) {
    planSheet.querySelectorAll('[data-close-sheet]').forEach(function (node) {
      node.addEventListener('click', closeSheet);
    });
  }

  planOptions.forEach(function (option) {
    option.addEventListener('click', function () {
      planOptions.forEach(function (item) {
        item.classList.toggle('selected', item === option);
      });
    });
  });

  if (confirmPlan) {
    confirmPlan.addEventListener('click', function () {
      const selected = planOptions.find(function (item) {
        return item.classList.contains('selected');
      }) || planOptions[1];
      applyPlan(selected, false);
      closeSheet();
    });
  }

  const storedPlan = readStore(STORE.plan, null);
  if (storedPlan && planBedtime) {
    const match = planOptions.find(function (item) {
      return item.dataset.bed === storedPlan.bed && item.dataset.wake === storedPlan.wake;
    });
    if (match) applyPlan(match, true);
  }

  /* ——— Mix lab ——— */
  const ranges = Array.from(document.querySelectorAll('.track-range'));
  const cards = Array.from(document.querySelectorAll('.track-card'));
  const resetBtn = document.getElementById('resetMix');
  const saveBtn = document.getElementById('saveBtn');
  const saveNote = document.getElementById('saveNote');
  let savedCount = Number(readStore(STORE.saved, 12));
  if (!Number.isFinite(savedCount)) savedCount = 12;
  let mixSaved = false;

  if (saveNote) saveNote.textContent = '已保存 ' + savedCount + ' 个私人音景 · 云端同步';

  function setCardActive(card) {
    cards.forEach(function (item) {
      item.classList.toggle('active', item === card);
    });
  }

  function updateRange(range, persist) {
    const value = Number(range.value);
    range.style.setProperty('--p', value + '%');
    const card = range.closest('.track-card');
    if (card) {
      const output = card.querySelector('.track-value span');
      if (output) output.textContent = String(value);
    }
    if (persist) {
      const next = ranges.map(function (item) {
        return Number(item.value);
      });
      writeStore(STORE.mix, next);
    }
  }

  const storedMix = readStore(STORE.mix, null);
  if (Array.isArray(storedMix) && storedMix.length === ranges.length) {
    ranges.forEach(function (range, index) {
      const value = Number(storedMix[index]);
      if (Number.isFinite(value)) range.value = String(Math.min(100, Math.max(0, value)));
    });
  }
  ranges.forEach(function (range) {
    updateRange(range, false);
  });

  ranges.forEach(function (range) {
    range.addEventListener('input', function () {
      updateRange(range, false);
      const card = range.closest('.track-card');
      if (card) setCardActive(card);
      syncMixAudio();
    });
    range.addEventListener('change', function () {
      updateRange(range, true);
      syncMixAudio();
    });
  });

  cards.forEach(function (card) {
    card.addEventListener('pointerdown', function (event) {
      if (event.target.closest('input')) return;
      setCardActive(card);
    });
  });

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      ranges.forEach(function (range, index) {
        range.value = String(DEFAULT_MIX[index]);
        updateRange(range, false);
      });
      writeStore(STORE.mix, DEFAULT_MIX.slice());
      if (cards[0]) setCardActive(cards[0]);
      toast('已恢复默认混音');
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      if (mixSaved) {
        toast('这个音景已经在收藏里');
        return;
      }
      mixSaved = true;
      savedCount += 1;
      writeStore(STORE.saved, savedCount);
      saveBtn.classList.add('saved');
      const label = saveBtn.querySelector('span');
      if (label) label.textContent = '音景已保存';
      saveBtn.setAttribute('aria-pressed', 'true');
      if (saveNote) saveNote.textContent = '已保存 ' + savedCount + ' 个私人音景 · 云端同步';
      toast('音景已保存到私人收藏');
    });
  }

  /* ——— Sleep report ——— */
  const shareReport = document.getElementById('shareReport');

  if (shareReport) {
    shareReport.addEventListener('click', function () {
      const text = 'SOMNA 睡眠报告：昨夜睡眠评分 84 分，睡眠 7 小时 16 分，深睡比例提升 4%。';
      if (navigator.share) {
        navigator.share({ title: 'SOMNA 睡眠报告', text: text }).catch(function () {});
        return;
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(function () {
          toast('报告摘要已复制到剪贴板');
        }).catch(function () {
          toast('报告已生成 · 可截图分享');
        });
        return;
      }
      toast('报告已生成 · 可截图分享');
    });
  }

  /* ——— Init ——— */
  setPlaying(false);
  renderPlayer();

  const initialHash = window.location.hash.replace('#', '');
  if (initialHash.indexOf('player-') === 0) {
    openSession(initialHash.slice(7));
  } else if (['home', 'mix', 'report'].indexOf(initialHash) !== -1) {
    showView(initialHash);
  }
})();
