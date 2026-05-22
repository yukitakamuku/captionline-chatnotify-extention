/**
 * captiOnline 連絡チャット通知 - popup.js  v1.0.1
 * 設定UIのロジック。変更は即時 chrome.storage.local に保存する。
 */

'use strict';

var STORAGE_KEY = 'captionline_notifier_config';

var DEFAULT_CONFIG = {
  soundEnabled: true,
  osNotifyEnabled: true,
  volume: 0.7,
  soundAll: 'notify_all.wav',
  soundMe: 'notify_me.wav',
};

// ─── DOM 要素 ──────────────────────────────────────────────────────────────────
var toggleSound    = document.getElementById('toggle-sound');
var toggleOs       = document.getElementById('toggle-os');
var volumeSlider   = document.getElementById('volume-slider');
var volumeDisplay  = document.getElementById('volume-display');
var btnTestAll     = document.getElementById('btn-test-all');
var btnTestMe      = document.getElementById('btn-test-me');
var dotObserver    = document.getElementById('dot-observer');
var statusObserver = document.getElementById('status-observer');
var dotPermission  = document.getElementById('dot-permission');
var statusPermission  = document.getElementById('status-permission');
var btnRequestPerm = document.getElementById('btn-request-permission');

// ─── 設定の読み込みと UI への反映 ──────────────────────────────────────────────
chrome.storage.local.get([STORAGE_KEY], function(result) {
  var config = Object.assign({}, DEFAULT_CONFIG, result[STORAGE_KEY] || {});

  toggleSound.checked = config.soundEnabled;
  toggleOs.checked    = config.osNotifyEnabled;

  var pct = Math.round(config.volume * 100);
  volumeSlider.value        = pct;
  volumeDisplay.textContent = pct + '%';
});

// ─── 設定の保存 ───────────────────────────────────────────────────────────────
function saveConfig() {
  var volume = parseInt(volumeSlider.value, 10) / 100;
  var config = {
    soundEnabled:    toggleSound.checked,
    osNotifyEnabled: toggleOs.checked,
    volume:          volume,
    soundAll: 'notify_all.wav',
    soundMe:  'notify_me.wav',
  };
  var obj = {};
  obj[STORAGE_KEY] = config;
  chrome.storage.local.set(obj);
}

// ─── イベントリスナー：設定変更 ───────────────────────────────────────────────
toggleSound.addEventListener('change', saveConfig);
toggleOs.addEventListener('change', saveConfig);

volumeSlider.addEventListener('input', function() {
  volumeDisplay.textContent = volumeSlider.value + '%';
  saveConfig();
});

// ─── テスト再生 ───────────────────────────────────────────────────────────────
function sendTestSound(soundType) {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: 'TEST_SOUND', soundType: soundType },
      function() { void chrome.runtime.lastError; }
    );
  });
}

btnTestAll.addEventListener('click', function() { sendTestSound('all'); });
btnTestMe.addEventListener('click',  function() { sendTestSound('me'); });

// ─── ステータス表示ヘルパー ────────────────────────────────────────────────────
function setObserverStatus(state, label) {
  // state: 'active' | 'inactive' | 'other'
  statusObserver.textContent = label;
  dotObserver.className = 'dot ' + (
    state === 'active'   ? 'dot-green'  :
    state === 'inactive' ? 'dot-yellow' :
    'dot-gray'
  );
}

function setPermissionStatus(perm) {
  if (perm === 'granted') {
    dotPermission.className   = 'dot dot-green';
    statusPermission.textContent = '通知許可済み';
    btnRequestPerm.style.display = 'none';
  } else if (perm === 'denied') {
    dotPermission.className   = 'dot dot-red';
    statusPermission.textContent = '通知ブロック中（ブラウザ設定で変更）';
    btnRequestPerm.style.display = 'none';
  } else {
    dotPermission.className   = 'dot dot-yellow';
    statusPermission.textContent = '通知未許可';
    btnRequestPerm.style.display = 'block';
  }
}

// ─── 動作状況の取得と表示 ─────────────────────────────────────────────────────
function updateStatus() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) {
      setObserverStatus('other', 'タブ取得失敗');
      setPermissionStatus('default');
      return;
    }

    var url = tabs[0].url || '';
    var isCaptionistPage = /https:\/\/co3\.captionline\.org\/capti\/.+\/captionist\.html/.test(url);

    if (!isCaptionistPage) {
      setObserverStatus('other', '非対応ページ（captionist.htmlを開いてください）');
      setPermissionStatus('default');
      return;
    }

    // captionline タブにメッセージを送る
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: 'GET_STATUS' },
      function(response) {
        // エラー発生時（content script がまだロードされていない等）
        if (chrome.runtime.lastError || !response) {
          setObserverStatus('inactive', 'ページを再読み込みしてください');
          setPermissionStatus('default');
          return;
        }

        setObserverStatus(
          response.observerActive ? 'active' : 'inactive',
          response.observerActive ? '監視中' : '待機中'
        );
        setPermissionStatus(response.notifyPermission);
      }
    );
  });
}

// ─── 通知許可リクエスト ────────────────────────────────────────────────────────
btnRequestPerm.addEventListener('click', function() {
  chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
    if (!tabs || !tabs[0]) return;
    chrome.tabs.sendMessage(
      tabs[0].id,
      { type: 'REQUEST_PERMISSION' },
      function(response) {
        void chrome.runtime.lastError;
        if (response && response.permission) {
          setPermissionStatus(response.permission);
        }
      }
    );
  });
});

// ─── 初期化 ───────────────────────────────────────────────────────────────────
updateStatus();
