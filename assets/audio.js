/*
 * SomniaAudio —— 基于 Web Audio API 的实时环境音合成引擎
 * 纯前端合成，无需任何音频素材文件。
 * 提供四个可独立调音的声道：rain(雨声) / ocean(海浪) / forest(森林) / fire(营火)。
 */
(function () {
  'use strict';

  var SomniaAudio = (function () {
    var ctx = null;
    var master = null;
    var started = false;
    var muted = false;
    var noiseBuffer = null;
    var fireTimer = null;
    var channels = {};
    var NAMES = ['rain', 'ocean', 'forest', 'fire'];

    function now() { return ctx ? ctx.currentTime : 0; }

    function makeNoise() {
      var len = Math.floor(ctx.sampleRate * 2);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    }

    function noiseSource() {
      var s = ctx.createBufferSource();
      s.buffer = noiseBuffer;
      s.loop = true;
      return s;
    }

    function buildRain() {
      var src = noiseSource();
      var hp = ctx.createBiquadFilter();
      hp.type = 'highpass'; hp.frequency.value = 700;
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 9000;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(master);
      src.start();
      return {
        setLevel: function (v) { this._level = v; g.gain.setTargetAtTime(v * 0.7, now(), 0.05); }
      };
    }

    function buildOcean() {
      var src = noiseSource();
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 550;
      var g = ctx.createGain(); g.gain.value = 0;
      var lfo = ctx.createOscillator();
      lfo.type = 'sine'; lfo.frequency.value = 0.09;
      var depth = ctx.createGain(); depth.gain.value = 0;
      lfo.connect(depth); depth.connect(g.gain); lfo.start();
      src.connect(lp); lp.connect(g); g.connect(master);
      src.start();
      return {
        setLevel: function (v) {
          this._level = v;
          g.gain.setTargetAtTime(v * 0.6, now(), 0.08);
          depth.gain.setTargetAtTime(v * 0.35, now(), 0.08);
        }
      };
    }

    function buildForest() {
      var src = noiseSource();
      var bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 0.5;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(bp); bp.connect(g); g.connect(master);
      src.start();
      return {
        setLevel: function (v) { this._level = v; g.gain.setTargetAtTime(v * 0.5, now(), 0.05); }
      };
    }

    function buildFire() {
      var src = noiseSource();
      var lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 220;
      var g = ctx.createGain(); g.gain.value = 0;
      src.connect(lp); lp.connect(g); g.connect(master);
      src.start();
      var api = {
        setLevel: function (v) { this._level = v; g.gain.setTargetAtTime(v * 0.5, now(), 0.05); }
      };
      var level = 0;
      function levelOf() { return api._level || 0; }
      function spawn() {
        var burst = ctx.createBufferSource();
        burst.buffer = noiseBuffer; burst.loop = true;
        var bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1200 + Math.random() * 2000; bp.Q.value = 1.4;
        var cg = ctx.createGain();
        var t = now();
        var peak = (0.12 + Math.random() * 0.22) * levelOf();
        cg.gain.setValueAtTime(0.0001, t);
        cg.gain.exponentialRampToValueAtTime(Math.max(0.0003, peak), t + 0.004);
        cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.05 + Math.random() * 0.06);
        burst.connect(bp); bp.connect(cg); cg.connect(master);
        burst.start(t); burst.stop(t + 0.3);
      }
      function crackle() {
        if (!started) return;
        var delay = 120 + Math.random() * 480;
        fireTimer = window.setTimeout(function () {
          if (levelOf() > 0.02 && !muted) spawn();
          crackle();
        }, delay);
      }
      api._start = crackle;
      return api;
    }

    function ensure() {
      if (started) { resume(); return true; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      try { ctx = new AC(); } catch (e) { return false; }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.9;
      master.connect(ctx.destination);
      noiseBuffer = makeNoise();
      channels.rain = buildRain();
      channels.ocean = buildOcean();
      channels.forest = buildForest();
      channels.fire = buildFire();
      channels.fire._start();
      started = true;
      resume();
      return true;
    }

    function resume() {
      if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
    }

    function setChannel(name, value) {
      if (!started) return;
      resume();
      var ch = channels[name];
      if (ch && ch.setLevel) ch.setLevel(Math.max(0, Math.min(1, value)));
    }

    function applyPreset(preset) {
      if (!ensure()) return;
      NAMES.forEach(function (n) {
        setChannel(n, (preset && typeof preset[n] === 'number') ? preset[n] : 0);
      });
    }

    function applyMix(values) {
      if (!ensure()) return;
      NAMES.forEach(function (n, i) {
        setChannel(n, (values && values[i] != null) ? Number(values[i]) / 100 : 0);
      });
    }

    function silence() {
      if (!started) return;
      NAMES.forEach(function (n) { setChannel(n, 0); });
    }

    function setMuted(next) {
      muted = !!next;
      if (master) master.gain.setTargetAtTime(muted ? 0 : 0.9, now(), 0.03);
    }

    return {
      ensure: ensure,
      resume: resume,
      setChannel: setChannel,
      applyPreset: applyPreset,
      applyMix: applyMix,
      silence: silence,
      setMuted: setMuted,
      isMuted: function () { return muted; },
      isStarted: function () { return started; }
    };
  })();

  window.SomniaAudio = SomniaAudio;
})();
