/**
 * HCL Consent Card — Green Shield UI Component
 *
 * Renders a consent card overlay when an agent invokes a WebMCP tool.
 * Shows Entity, Data, Use, and Boundary context. Five choices:
 *   1. Allow once
 *   2. Allow until I change it (standing allow rule)
 *   3. Set a time limit (standing allow with expiry)
 *   4. No (deny once)
 *   5. Never allow this (standing deny rule)
 *
 * Standing rules stored in localStorage by tool name.
 * Timeout triggers fail-closed denial (INV-FC).
 *
 * Zero dependencies. Pure browser JavaScript + inline CSS.
 *
 * @license Apache-2.0
 * @copyright Opnli Corporation
 */

(function (global) {
  'use strict';

  var HCLConsentCard = {};
  var RULES_KEY = 'hcl-standing-rules';

  var _activeCard = null;

  /* ── Standing Rules ────────────────────────────────── */

  function loadRules() {
    try {
      var raw = global.localStorage.getItem(RULES_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (_) { return {}; }
  }

  function saveRules(rules) {
    try {
      global.localStorage.setItem(RULES_KEY, JSON.stringify(rules));
    } catch (_) { /* best effort */ }
  }

  /**
   * Check if a standing rule exists for this tool.
   * Returns { decision: 'allow'|'deny' } or null if no rule / rule expired.
   */
  HCLConsentCard.checkRule = function (toolName) {
    var rules = loadRules();
    var rule = rules[toolName];
    if (!rule) return null;
    if (rule.expires_at && Date.now() > rule.expires_at) {
      delete rules[toolName];
      saveRules(rules);
      return null;
    }
    return { decision: rule.decision };
  };

  /**
   * Set a standing rule.
   * @param {string} toolName
   * @param {string} decision - 'allow' or 'deny'
   * @param {number|null} durationMs - null for permanent, ms for time-limited
   */
  HCLConsentCard.setRule = function (toolName, decision, durationMs) {
    var rules = loadRules();
    rules[toolName] = {
      decision: decision,
      created_at: Date.now(),
      expires_at: durationMs ? Date.now() + durationMs : null
    };
    saveRules(rules);
  };

  /**
   * Revoke a standing rule for a tool.
   */
  HCLConsentCard.revokeRule = function (toolName) {
    var rules = loadRules();
    delete rules[toolName];
    saveRules(rules);
  };

  /**
   * Get all standing rules (for the Review panel).
   * Cleans expired rules before returning.
   */
  HCLConsentCard.getRules = function () {
    var rules = loadRules();
    var now = Date.now();
    var changed = false;
    for (var key in rules) {
      if (rules[key].expires_at && now > rules[key].expires_at) {
        delete rules[key];
        changed = true;
      }
    }
    if (changed) saveRules(rules);
    return rules;
  };

  /* ── Review Rules Panel ────────────────────────────── */

  HCLConsentCard.showReviewPanel = function () {
    if (_activeCard) HCLConsentCard.dismiss();

    var rules = HCLConsentCard.getRules();
    var keys = Object.keys(rules);

    var overlay = document.createElement('div');
    overlay.id = 'hcl-consent-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;' +
      'background:rgba(0,0,0,0.5);z-index:999999;display:flex;' +
      'align-items:center;justify-content:center;font-family:-apple-system,BlinkMacSystemFont,sans-serif;';

    var panel = document.createElement('div');
    panel.style.cssText = 'background:#fff;border-radius:12px;padding:24px;max-width:480px;' +
      'width:90%;box-shadow:0 8px 32px rgba(0,0,0,0.2);color:#1a1a1a;max-height:80vh;overflow-y:auto;';

    var header = document.createElement('div');
    header.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:16px;';
    header.innerHTML = '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">' +
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
      '<div><div style="font-weight:700;font-size:16px;color:#16a34a;">Standing Rules</div>' +
      '<div style="font-size:12px;color:#666;">Review and revoke your consent rules</div></div>';
    panel.appendChild(header);

    if (keys.length === 0) {
      var empty = document.createElement('div');
      empty.style.cssText = 'text-align:center;color:#888;padding:24px 0;font-size:14px;';
      empty.textContent = 'No standing rules set.';
      panel.appendChild(empty);
    } else {
      for (var i = 0; i < keys.length; i++) {
        (function (toolName) {
          var rule = rules[toolName];
          var row = document.createElement('div');
          row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;' +
            'padding:10px 0;border-bottom:1px solid #eee;';

          var info = document.createElement('div');
          info.style.cssText = 'font-size:13px;';
          var label = rule.decision === 'allow' ? '✅ Allow' : '🚫 Deny';
          var expiry = '';
          if (rule.expires_at) {
            var mins = Math.max(0, Math.round((rule.expires_at - Date.now()) / 60000));
            expiry = ' · ' + mins + ' min remaining';
          }
          info.innerHTML = '<div style="font-weight:600;">' + escapeHtml(toolName) + '</div>' +
            '<div style="color:#666;">' + label + (rule.expires_at ? expiry : ' · permanent') + '</div>';

          var revokeBtn = document.createElement('button');
          revokeBtn.textContent = 'Revoke';
          revokeBtn.style.cssText = 'padding:6px 14px;border:1px solid #dc2626;border-radius:6px;' +
            'background:#fff;color:#dc2626;font-size:12px;font-weight:600;cursor:pointer;flex-shrink:0;';
          revokeBtn.addEventListener('click', function () {
            HCLConsentCard.revokeRule(toolName);
            row.parentNode.removeChild(row);
            if (panel.querySelectorAll('div[style*="border-bottom"]').length === 0) {
              HCLConsentCard.dismiss();
              HCLConsentCard.showReviewPanel();
            }
          });

          row.appendChild(info);
          row.appendChild(revokeBtn);
          panel.appendChild(row);
        })(keys[i]);
      }
    }

    var closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = 'display:block;width:100%;margin-top:16px;padding:12px;border:none;' +
      'border-radius:8px;background:#f3f4f6;color:#333;font-weight:600;font-size:14px;cursor:pointer;';
    closeBtn.addEventListener('click', function () { HCLConsentCard.dismiss(); });
    panel.appendChild(closeBtn);

    overlay.appendChild(panel);
    document.body.appendChild(overlay);
    _activeCard = overlay;
  };

  /* ── Consent Card ──────────────────────────────────── */

  /**
   * Show a consent card and wait for the human's decision.
   *
   * @param {object} options
   * @param {string} options.toolName
   * @param {string} options.toolDescription
   * @param {object} options.args
   * @param {object} options.cardContext - CARD context (entity, data, use, boundary)
   * @param {number} options.timeout - Timeout in ms before fail-closed denial
   * @param {function} options.onAllow - Called with { standing: false }
   * @param {function} options.onStandingAllow - Called with { duration: null|ms }
   * @param {function} options.onDeny - Called with { standing: false }
   * @param {function} options.onStandingDeny - Called with {}
   * @param {function} options.onTimeout
   */
  HCLConsentCard.show = function (options) {
    if (_activeCard) HCLConsentCard.dismiss();

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
      { label: 'Who', icon: '\u{1F464}', value: (ctx.entity && (ctx.entity.name || ctx.entity.summary)) || 'Unknown' },
      { label: 'What data', icon: '\u{1F4C4}', value: (ctx.data && ctx.data.summary) || 'Not specified' },
      { label: 'Purpose', icon: '\u{1F3AF}', value: (ctx.use && ctx.use.summary) || 'Not specified' },
      { label: 'Limits', icon: '\u{1F512}', value: (ctx.boundary && ctx.boundary.summary) || 'Not specified' }
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

    // Five-choice buttons
    var buttons = document.createElement('div');
    buttons.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    var btnDefs = [
      { text: 'Allow once', style: 'background:#16a34a;color:#fff;border:none;', action: 'allow_once' },
      { text: 'Allow until I change it', style: 'background:#22c55e;color:#fff;border:none;', action: 'allow_standing' },
      { text: 'Set a time limit', style: 'background:#fff;color:#333;border:2px solid #d1d5db;', action: 'allow_timed' },
      { text: 'No', style: 'background:#fff;color:#333;border:2px solid #d1d5db;', action: 'deny_once' },
      { text: 'Never allow this', style: 'background:#dc2626;color:#fff;border:none;', action: 'deny_standing' }
    ];

    var resolved = false;

    var countdownInterval = setInterval(function () {
      secondsLeft--;
      if (secondsLeft > 0) {
        countdown.textContent = 'Auto-deny in ' + secondsLeft + 's';
      }
    }, 1000);

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

    function handleAction(action) {
      if (resolved) return;

      if (action === 'allow_timed') {
        showTimePicker(card, buttons, function (ms) {
          resolved = true;
          cleanup();
          HCLConsentCard.setRule(options.toolName, 'allow', ms);
          if (options.onStandingAllow) options.onStandingAllow({ duration: ms });
          else if (options.onAllow) options.onAllow();
        });
        return;
      }

      resolved = true;
      cleanup();

      if (action === 'allow_once') {
        if (options.onAllow) options.onAllow();
      } else if (action === 'allow_standing') {
        HCLConsentCard.setRule(options.toolName, 'allow', null);
        if (options.onStandingAllow) options.onStandingAllow({ duration: null });
        else if (options.onAllow) options.onAllow();
      } else if (action === 'deny_once') {
        if (options.onDeny) options.onDeny();
      } else if (action === 'deny_standing') {
        HCLConsentCard.setRule(options.toolName, 'deny', null);
        if (options.onStandingDeny) options.onStandingDeny();
        else if (options.onDeny) options.onDeny();
      }
    }

    for (var j = 0; j < btnDefs.length; j++) {
      (function (def) {
        var btn = document.createElement('button');
        btn.textContent = def.text;
        btn.style.cssText = 'padding:12px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;' + def.style;
        btn.addEventListener('click', function () { handleAction(def.action); });
        buttons.appendChild(btn);
      })(btnDefs[j]);
    }

    card.appendChild(buttons);
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    _activeCard = overlay;
    return overlay;
  };

  /* ── Time Picker (inline) ──────────────────────────── */

  function showTimePicker(card, buttonsDiv, callback) {
    buttonsDiv.style.display = 'none';

    var picker = document.createElement('div');
    picker.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    var label = document.createElement('div');
    label.style.cssText = 'font-size:13px;color:#555;text-align:center;margin-bottom:4px;';
    label.textContent = 'Allow for how long?';
    picker.appendChild(label);

    var durations = [
      { text: '15 minutes', ms: 15 * 60 * 1000 },
      { text: '1 hour', ms: 60 * 60 * 1000 },
      { text: '4 hours', ms: 4 * 60 * 60 * 1000 },
      { text: '24 hours', ms: 24 * 60 * 60 * 1000 }
    ];

    for (var i = 0; i < durations.length; i++) {
      (function (dur) {
        var btn = document.createElement('button');
        btn.textContent = dur.text;
        btn.style.cssText = 'padding:10px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;' +
          'background:#fff;color:#333;border:2px solid #d1d5db;';
        btn.addEventListener('click', function () { callback(dur.ms); });
        picker.appendChild(btn);
      })(durations[i]);
    }

    var cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Back';
    cancelBtn.style.cssText = 'padding:10px;border-radius:8px;font-size:13px;cursor:pointer;' +
      'background:#f3f4f6;color:#666;border:none;margin-top:4px;';
    cancelBtn.addEventListener('click', function () {
      card.removeChild(picker);
      buttonsDiv.style.display = 'flex';
    });
    picker.appendChild(cancelBtn);

    card.appendChild(picker);
  }

  /* ── Dismiss + Helpers ─────────────────────────────── */

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
