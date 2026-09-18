/**
 * HCL Consent Card — Green Shield UI Component
 *
 * Renders a consent card overlay when an agent invokes a WebMCP tool.
 * Shows Entity, Data, Use, and Boundary context. The human clicks
 * Allow or Deny. Timeout triggers fail-closed denial (INV-FC).
 *
 * Zero dependencies. Pure browser JavaScript + inline CSS.
 *
 * @license Apache-2.0
 * @copyright Opnli Corporation
 */

(function (global) {
  'use strict';

  var HCLConsentCard = {};

  var _activeCard = null;

  /**
   * Show a consent card and wait for the human's decision.
   *
   * @param {object} options
   * @param {string} options.toolName - Name of the tool being invoked
   * @param {string} options.toolDescription - Description of the tool
   * @param {object} options.args - Arguments the agent passed to the tool
   * @param {object} options.cardContext - CARD context (entity, data, use, boundary)
   * @param {number} options.timeout - Timeout in ms before fail-closed denial
   * @param {function} options.onAllow - Called when human clicks Allow
   * @param {function} options.onDeny - Called when human clicks Deny
   * @param {function} options.onTimeout - Called on timeout (fail-closed)
   */
  HCLConsentCard.show = function (options) {
    // Remove any existing card
    if (_activeCard) {
      HCLConsentCard.dismiss();
    }

    var ctx = options.cardContext || {};
    var overlay = document.createElement('div');
    overlay.id = 'hcl-consent-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.5);z-index:999999;display:flex;' +
      'align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

    var card = document.createElement('div');
    card.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:420px;' +
      'width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:#1a1a1a;';

    // Shield header
    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:16px;';
    header.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<div><div style="font-weight:700;font-size:16px;color:#16a34a;">Green Shield</div>' +
      '<div style="font-size:12px;color:#666;">Consent Before Execution</div></div>';
    card.appendChild(header);

    // Tool info
    var toolInfo = document.createElement('div');
    toolInfo.style.cssText = 'background:#f8f9fa;border-radius:8px;padding:12px;margin-bottom:16px;';
    toolInfo.innerHTML = '<div style="font-weight:600;font-size:14px;margin-bottom:4px;">' +
      escapeHtml(options.toolName) + '</div>' +
      '<div style="font-size:13px;color:#555;">' +
      escapeHtml(options.toolDescription || '') + '</div>';
    card.appendChild(toolInfo);

    // CARD context
    var contexts = [
      { label: 'Who', icon: '👤', value: (ctx.entity && (ctx.entity.name || ctx.entity.summary)) || 'Unknown' },
      { label: 'What data', icon: '📄', value: (ctx.data && ctx.data.summary) || 'Not specified' },
      { label: 'Purpose', icon: '🎯', value: (ctx.use && ctx.use.summary) || 'Not specified' },
      { label: 'Limits', icon: '🔒', value: (ctx.boundary && ctx.boundary.summary) || 'Not specified' }
    ];

    var contextDiv = document.createElement('div');
    contextDiv.style.cssText = 'margin-bottom:20px;';
    for (var i = 0; i < contexts.length; i++) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #eee;font-size:13px;';
      row.innerHTML = '<span style="flex-shrink:0;">' + contexts[i].icon + '</span>' +
        '<span style="color:#888;min-width:70px;">' + contexts[i].label + '</span>' +
        '<span style="color:#333;">' + escapeHtml(contexts[i].value) + '</span>';
      contextDiv.appendChild(row);
    }
    card.appendChild(contextDiv);

    // Countdown
    var countdown = document.createElement('div');
    countdown.style.cssText = 'text-align:center;font-size:12px;color:#888;margin-bottom:12px;';
    var secondsLeft = Math.ceil(options.timeout / 1000);
    countdown.textContent = 'Auto-deny in ' + secondsLeft + 's';
    card.appendChild(countdown);

    // Buttons
    var buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;gap:12px;';

    var denyBtn = document.createElement('button');
    denyBtn.textContent = 'Deny';
    denyBtn.style.cssText = 'flex:1;padding:12px;border:2px solid #dc2626;border-radius:8px;' +
      'background:#fff;color:#dc2626;font-weight:600;font-size:15px;cursor:pointer;';

    var allowBtn = document.createElement('button');
    allowBtn.textContent = 'Allow';
    allowBtn.style.cssText = 'flex:1;padding:12px;border:none;border-radius:8px;' +
      'background:#16a34a;color:#fff;font-weight:600;font-size:15px;cursor:pointer;';

    buttons.appendChild(denyBtn);
    buttons.appendChild(allowBtn);
    card.appendChild(buttons);

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    var resolved = false;

    // Countdown timer
    var countdownInterval = setInterval(function () {
      secondsLeft--;
      if (secondsLeft > 0) {
        countdown.textContent = 'Auto-deny in ' + secondsLeft + 's';
      }
    }, 1000);

    // Timeout — fail-closed (INV-FC)
    var timeoutTimer = setTimeout(function () {
      if (!resolved) {
        resolved = true;
        clearInterval(countdownInterval);
        HCLConsentCard.dismiss();
        if (options.onTimeout) options.onTimeout();
      }
    }, options.timeout);

    function cleanup() {
      clearTimeout(timeoutTimer);
      clearInterval(countdownInterval);
      HCLConsentCard.dismiss();
    }

    allowBtn.addEventListener('click', function () {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (options.onAllow) options.onAllow();
      }
    });

    denyBtn.addEventListener('click', function () {
      if (!resolved) {
        resolved = true;
        cleanup();
        if (options.onDeny) options.onDeny();
      }
    });

    _activeCard = overlay;
    return overlay;
  };

  /**
   * Dismiss the active consent card.
   */
  HCLConsentCard.dismiss = function () {
    if (_activeCard && _activeCard.parentNode) {
      _activeCard.parentNode.removeChild(_activeCard);
    }
    _activeCard = null;
  };

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.appendChild(document.createTextNode(str));
    return div.innerHTML;
  }

  global.HCLConsentCard = HCLConsentCard;

})(typeof window !== 'undefined' ? window : this);
