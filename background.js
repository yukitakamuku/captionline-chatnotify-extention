/**
 * captiOnline 連絡チャット通知 - background.js (Service Worker)
 * content.js からのメッセージを受け取り、OS通知を表示する。
 */

'use strict';

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type !== 'SHOW_NOTIFICATION') {
    sendResponse({});
    return;
  }

  const notificationId = `captionline-${Date.now()}`;

  chrome.notifications.create(notificationId, {
    type: 'basic',
    iconUrl: 'icons/icon48.png',
    title: message.title,
    message: message.body || '',
    priority: 1,
    requireInteraction: false,
  });

  // 通知をクリックしたら閉じる
  chrome.notifications.onClicked.addListener((id) => {
    if (id === notificationId) {
      chrome.notifications.clear(id);
    }
  });

  sendResponse({});  // ポートを明示的に閉じて "message port closed" 警告を防ぐ
});
