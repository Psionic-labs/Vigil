/**
 * @file main.ts
 * @description Simple client-side app mimicking host product interactions with the SDK.
 * @why Provides a real sandbox to trigger errors, clicks, and test SDK capture behavior.
 */

import { Vigil } from '@vigil/sdk';

// 1. Initialize the SDK
Vigil.init({
  projectKey: 'pk_playground',
  endpoint: 'http://localhost:3001/api/v1/ingest',
  debug: true,
});

// 2. Mock fetch to intercept requests for the Transport Log
const originalFetch = window.fetch;
window.fetch = async (...args) => {
  const url = typeof args[0] === 'string' ? args[0] : (args[0] instanceof Request ? args[0].url : '');
  if (url.includes('/api/ingest') || url.includes('/api/v1/ingest')) {
    let bodyText: string | undefined;
    if (args[0] instanceof Request) {
      bodyText = await args[0].clone().text();
    } else if (typeof args[1]?.body === 'string') {
      bodyText = args[1].body;
    }

    let payload;
    if (bodyText) {
      try {
        payload = JSON.parse(bodyText);
      } catch {
        payload = { _parseError: true, raw: bodyText };
      }
    }
    logTransport('fetch', payload);
    // Execute real fetch for end-to-end verification
    return originalFetch(...args);
  }
  return originalFetch(...args);
};

// 3. Mock sendBeacon to intercept final flushes
const originalSendBeacon = navigator.sendBeacon;
navigator.sendBeacon = (url, data) => {
  if (typeof url === 'string' && (url.includes('/api/ingest') || url.includes('/api/v1/ingest'))) {
    let payload;
    if (typeof data === 'string') {
      try {
        payload = JSON.parse(data);
      } catch {
        payload = { _parseError: true, raw: data };
      }
    } else if (data instanceof Blob) {
      // Blob data is harder to parse synchronously in sendBeacon, just log it as blob
      payload = { _type: 'Blob', size: data.size };
    }
    logTransport('sendBeacon', payload);
    // Execute real sendBeacon for end-to-end verification
    return originalSendBeacon.call(navigator, url, data);
  }
  return originalSendBeacon.call(navigator, url, data);
};

// --- DOM Elements ---
const statusContent = document.getElementById('status-content')!;
const transportLog = document.getElementById('transport-log')!;

// --- Status Panel Updater ---
function updateStatus() {
  const v = (window as any).__vigil;
  if (!v) {
    statusContent.innerHTML = '<p>SDK not initialized or __vigil not exposed.</p>';
    return;
  }

  // HTML-escape function to prevent XSS
  const escapeHtml = (str: string) => {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  const newHtml = `
    <div><span class="status-key">Session ID:</span> <span class="status-val">${v.sessionId || 'N/A'}</span></div>
    <div><span class="status-key">Lifecycle Epoch:</span> <span class="status-val">${v.lifecycleEpoch || 0}</span></div>
    <div><span class="status-key">Final Flush Sent:</span> <span class="status-val">${!!v.finalFlushSent}</span></div>
    <div><span class="status-key">Replay Enabled:</span> <span class="status-val">${v.config?.replay !== false}</span></div>
    <div><span class="status-key">Current URL:</span> <span class="status-val">${escapeHtml(window.location.href)}</span></div>
    <div><span class="status-key">Events Queue:</span> <span class="status-val">${v.events?.length || 0}</span></div>
    <div><span class="status-key">Summary Queue:</span> <span class="status-val">${v.summaryEvents?.length || 0}</span></div>
  `;

  if (statusContent.innerHTML !== newHtml) {
    statusContent.innerHTML = newHtml;
  }
}
// Update status frequently for debug visibility
setInterval(updateStatus, 500);

// --- Transport Log ---
function logTransport(method: string, payload: any) {
  const d = new Date();
  const time = d.toLocaleTimeString() + '.' + d.getMilliseconds().toString().padStart(3, '0');
  
  const eventsCount = payload?.events?.length || 0;
  const summaryCount = payload?.summary?.length || 0;
  const isFinal = payload?.summary?.[summaryCount - 1]?.isFinal || false;
  
  const div = document.createElement('div');
  div.className = 'log-entry';
  div.innerHTML = `
    <span class="log-time">[${time}]</span>
    <span class="log-type">${method.toUpperCase()}</span>
    <span class="log-detail">Events: ${eventsCount} | Summary: ${summaryCount} | isFinal: ${isFinal}</span>
  `;
  transportLog.prepend(div);
}

document.getElementById('btn-clear-logs')!.addEventListener('click', () => {
  transportLog.innerHTML = '';
});

// --- Triggers ---

document.getElementById('btn-js-error')!.addEventListener('click', () => {
  // Throws an unhandled error asynchronously so it bubbles to window.onerror
  setTimeout(() => {
    throw new Error('Test JS Error from Playground');
  }, 0);
});

document.getElementById('btn-promise-reject')!.addEventListener('click', () => {
  Promise.reject(new Error('Test Unhandled Promise Rejection'));
});

document.getElementById('btn-console-error')!.addEventListener('click', () => {
  console.error('Test Console Error', { data: 123 });
});

document.getElementById('btn-console-warn')!.addEventListener('click', () => {
  console.warn('Test Console Warning', { data: 456 });
});

document.getElementById('btn-rage-click')!.addEventListener('click', (e) => {
  if (!e.isTrusted) return; // Prevent infinite loop from our own dispatched events
  // Simulate 4 fast clicks to trigger rage click detector
  for (let i=0; i<4; i++) {
    const evt = new MouseEvent('click', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY });
    e.target!.dispatchEvent(evt);
  }
});

document.getElementById('btn-dead-click')!.addEventListener('click', () => {
  // Stop propagation/default to simulate a dead click (often custom logic in SDK)
  // For the SDK, clicking on something that doesn't change DOM or route might be dead.
});

document.getElementById('btn-sig-click')!.addEventListener('click', () => {
  // Significant click usually happens on A or BUTTON
});

document.getElementById('btn-spa-nav')!.addEventListener('click', () => {
  const newUrl = new URL(window.location.href);
  newUrl.searchParams.set('page', Math.random().toString(36).substring(7));
  window.history.pushState({}, '', newUrl.toString());
});

document.getElementById('btn-dom-mutation')!.addEventListener('click', () => {
  const target = document.getElementById('mutation-target')!;
  const div = document.createElement('div');
  div.textContent = 'Mutation ' + Date.now();
  target.appendChild(div);
});

document.getElementById('btn-vis-flush')!.addEventListener('click', () => {
  // Simulate pagehide/visibilitychange
  document.dispatchEvent(new Event('visibilitychange'));
});

document.getElementById('btn-final-flush')!.addEventListener('click', () => {
  // Trigger shutdown manually if exposed, or dispatch pagehide
  window.dispatchEvent(new Event('pagehide'));
});
