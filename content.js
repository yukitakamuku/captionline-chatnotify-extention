// captiOnline 連絡チャット通知 - content.js  v1.0.3
// 対象: https://co3.captionline.org/capti/{room}/captionist.html
//
// MutationObserver で #group_chat_logarea を監視し、
// 新着メッセージを検出したら通知音・OS通知を発火する。

'use strict';

// ─── 定数 ────────────────────────────────────────────────────────────────────
const STORAGE_KEY = 'captionline_notifier_config';

const DEFAULT_CONFIG = {
  soundEnabled: true,
  osNotifyEnabled: true,
  volume: 0.7,
  soundAll: 'notify_all.wav',
  soundMe: 'notify_me.wav',
};

// CSS の color 値（ブラウザが rgb() に正規化する）
const COLOR_ALL = 'rgb(0, 144, 0)';   // #009000: 全員宛
const COLOR_ME  = 'rgb(144, 0, 0)';   // #900000: 自分宛 or 自分の送信確認

// ─── 設定読み込み ─────────────────────────────────────────────────────────────
function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([STORAGE_KEY], (result) => {
      const saved = result[STORAGE_KEY] || {};
      resolve(Object.assign({}, DEFAULT_CONFIG, saved));
    });
  });
}

// ─── 通知音（Web Audio API フォールバック）──────────────────────────────────
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    try {
      _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('[captiOnline通知] AudioContext 初期化失敗:', e);
      return null;
    }
  }
  return _audioCtx;
}

function playBeepFallback(type, volume) {
  const ctx = getAudioCtx();
  if (!ctx) return;

  const freq = type === 'me' ? 880 : 660;
  const oscillator = ctx.createOscillator();
  const gainNode   = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(freq, ctx.currentTime);
  gainNode.gain.setValueAtTime(volume * 0.5, ctx.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);

  oscillator.start(ctx.currentTime);
  oscillator.stop(ctx.currentTime + 0.5);
}

async function playSound(type, volume) {
  // AudioContext が suspended の場合は resume する
  const ctx = getAudioCtx();
  if (ctx && ctx.state === 'suspended') {
    await ctx.resume();
  }

  const filename = type === 'me' ? 'notify_me.wav' : 'notify_all.wav';
  const url = chrome.runtime.getURL('sounds/' + filename);

  const audio = new Audio(url);
  audio.volume = Math.max(0, Math.min(1, volume));

  try {
    await audio.play();
  } catch (e) {
    // ファイルが存在しない / autoplay blocked → Web Audio API でフォールバック
    playBeepFallback(type, volume);
  }
}

// ─── 通知処理 ─────────────────────────────────────────────────────────────────
async function notify(messageType, senderName, messageBody) {
  const config = await getConfig();

  // 通知音
  if (config.soundEnabled) {
    await playSound(messageType, config.volume);
  }

  // OS通知
  if (config.osNotifyEnabled) {
    const title = messageType === 'me'
      ? '【連絡】あなた宛: ' + senderName
      : '【連絡】全員宛: ' + senderName;

    // 本文は最大100文字に切り詰め
    const body = messageBody.length > 100
      ? messageBody.substring(0, 100) + '…'
      : messageBody;

    chrome.runtime.sendMessage(
      { type: 'SHOW_NOTIFICATION', title: title, body: body, messageType: messageType },
      function() { void chrome.runtime.lastError; }
    );
  }
}

// ─── メッセージノードの解析 ───────────────────────────────────────────────────
function onNewMessage(node) {
  const color = node.style && node.style.color;

  var messageType = null;

  if (color === COLOR_ALL) {
    messageType = 'all';

  } else if (color === COLOR_ME) {
    var text = (node.textContent || '').trim();

    if (text.indexOf('[From:') === 0) {
      messageType = 'me';
    } else if (text.indexOf('[To:') === 0) {
      return; // 自分が送ったDMのエコーバック → 通知しない
    } else {
      return; // 予期しないパターン → スキップ
    }
  } else {
    return;
  }

  // 送信者名とメッセージ本文を分離（区切り文字: 全角スラッシュ）
  var fullText = (node.textContent || '').trim();
  var sepIndex = fullText.indexOf('／');
  var senderName  = sepIndex >= 0 ? fullText.substring(0, sepIndex).trim()  : '(不明)';
  var messageBody = sepIndex >= 0 ? fullText.substring(sepIndex + 1).trim() : fullText;

  // DM受信の場合 "[From:送信者名]" → "送信者名" に整形
  var fromMatch = senderName.match(/^\[From:(.+)\]$/);
  if (fromMatch) senderName = fromMatch[1];

  notify(messageType, senderName, messageBody);
}

// ─── MutationObserver の開始 ──────────────────────────────────────────────────
function startObserver(logArea) {
  if (logArea._chatObserver) return;

  var observer = new MutationObserver(function(mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var addedNodes = mutations[i].addedNodes;
      for (var j = 0; j < addedNodes.length; j++) {
        var node = addedNodes[j];
        if (node.nodeType !== Node.ELEMENT_NODE) continue;

        // focusingIndicator（opacity:0.67）は無視
        if (node.style && node.style.opacity === '0.67') continue;

        // 固定ヘッダ（data-i18n属性あり）は無視
        if (node.dataset && node.dataset.i18n) continue;

        onNewMessage(node);
      }
    }
  });

  observer.observe(logArea, { childList: true });
  logArea._chatObserver = observer;

  window._captionlineObserverActive = true;
  console.log('[captiOnline通知] MutationObserver 開始しました');
}

// ─── 初期化（DOMの準備待ち）────────────────────────────────────────────────
function waitForElement(selector, timeout, interval) {
  return new Promise(function(resolve, reject) {
    var el = document.querySelector(selector);
    if (el) { resolve(el); return; }

    var start = Date.now();
    var timer = setInterval(function() {
      var found = document.querySelector(selector);
      if (found) {
        clearInterval(timer);
        resolve(found);
      } else if (Date.now() - start > timeout) {
        clearInterval(timer);
        reject(new Error('Timeout waiting for ' + selector));
      }
    }, interval);
  });
}

function init() {
  waitForElement('#group_chat_logarea', 30000, 200)
    .then(function(logArea) {
      console.log('[captiOnline通知] group_chat_logarea を検出しました');
      startObserver(logArea);
    })
    .catch(function(err) {
      console.warn('[captiOnline通知] 初期化失敗:', err.message);
    });
}

// ─── ポップアップからのメッセージ受信 ────────────────────────────────────────
chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
  if (message.type === 'GET_STATUS') {
    sendResponse({
      observerActive: !!window._captionlineObserverActive,
      notifyPermission: Notification.permission,
    });
    return true;
  }

  if (message.type === 'TEST_SOUND') {
    var soundType = message.soundType || 'all';
    getConfig().then(function(config) {
      playSound(soundType, config.volume);
    });
    sendResponse({});
    return true;
  }

  if (message.type === 'REQUEST_PERMISSION') {
    Notification.requestPermission().then(function(perm) {
      sendResponse({ permission: perm });
    });
    return true;
  }
});

// ─── エントリーポイント ───────────────────────────────────────────────────────
init();
