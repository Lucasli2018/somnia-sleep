(function () {
  const frames = document.getElementById('frames');
  const showcase = document.querySelector('.showcase');

  function fitStage() {
    if (!frames) return;
    frames.style.zoom = '1';
    const horizontalPadding = window.innerWidth <= 900 ? 36 : 80;
    const available = window.innerWidth - horizontalPadding;
    const width = frames.getBoundingClientRect().width;
    const scale = Math.min(1, available / width);
    frames.style.zoom = String(Math.max(0.46, scale));
  }

  window.addEventListener('resize', fitStage);
  window.addEventListener('load', fitStage);
  fitStage();

  const playBtn = document.getElementById('playBtn');
  const orbStage = document.querySelector('.orb-stage');

  if (playBtn && orbStage) {
    playBtn.addEventListener('click', function () {
      const paused = playBtn.classList.toggle('paused');
      orbStage.classList.toggle('is-paused', paused);
      playBtn.setAttribute('aria-label', paused ? '播放' : '暂停');
    });
  }

  const ranges = Array.from(document.querySelectorAll('.track-range'));

  ranges.forEach(function (range) {
    range.addEventListener('input', function () {
      range.style.setProperty('--p', range.value + '%');
      const card = range.closest('.track-card');
      const value = card && card.querySelector('.track-value span');
      if (value) value.textContent = range.value;
      const cardWrap = range.closest('.track-card');
      if (cardWrap) {
        document.querySelectorAll('.track-card').forEach(function (item) {
          item.classList.remove('active');
        });
        cardWrap.classList.add('active');
      }
    });
  });

  document.querySelectorAll('.track-card').forEach(function (card) {
    card.addEventListener('pointerdown', function (event) {
      if (event.target.closest('input')) return;
      document.querySelectorAll('.track-card').forEach(function (item) {
        item.classList.remove('active');
      });
      card.classList.add('active');
    });
  });

  const resetBtn = document.querySelector('.reset-btn');
  const defaults = [64, 38, 22, 47];

  if (resetBtn) {
    resetBtn.addEventListener('click', function () {
      ranges.forEach(function (range, index) {
        range.value = defaults[index];
        range.dispatchEvent(new Event('input', { bubbles: true }));
      });
    });
  }

  const saveBtn = document.getElementById('saveBtn');
  const saveNote = document.querySelector('.save-note');

  if (saveBtn) {
    saveBtn.addEventListener('click', function () {
      const saved = saveBtn.classList.toggle('saved');
      const label = saveBtn.querySelector('span');
      if (label) label.textContent = saved ? '音景已保存' : '保存音景';
      saveBtn.setAttribute('aria-pressed', String(saved));
      if (saveNote) {
        saveNote.textContent = saved
          ? '已保存 13 个私人音景 · 云端同步'
          : '已保存 12 个私人音景 · 云端同步';
      }
    });
  }

  if (showcase) {
    showcase.addEventListener('mousemove', function (event) {
      const x = (event.clientX / window.innerWidth - 0.5) * 2;
      const y = (event.clientY / window.innerHeight - 0.5) * 2;
      document.querySelectorAll('.phone-bg').forEach(function (image) {
        image.style.transformOrigin = 'center center';
        if (!image.classList.contains('player-bg')) {
          image.style.translate = (x * 3).toFixed(2) + 'px ' + (y * 2).toFixed(2) + 'px';
        }
      });
    });
  }
})();
