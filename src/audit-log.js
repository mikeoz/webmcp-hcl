/**
 * HCL Audit Log — Browser-Side SHA-256 Hash Chain
 *
 * Records consent decisions in a tamper-evident chain per INV-TE.
 * Uses the Web Crypto API (SubtleCrypto) for SHA-256 — no dependencies.
 * Chain persists to localStorage and survives page refresh.
 *
 * @license Apache-2.0
 * @copyright Opnli Corporation
 */

(function (global) {
  'use strict';

  var STORAGE_KEY = 'hcl-audit-chain';

  /**
   * SHA-256 hex digest using Web Crypto API.
   *
   * @param {string} input
   * @returns {Promise<string>} 64-character hex hash
   */
  async function sha256(input) {
    if (global.crypto && global.crypto.subtle) {
      var encoder = new TextEncoder();
      var data = encoder.encode(input);
      var buffer = await global.crypto.subtle.digest('SHA-256', data);
      var array = Array.from(new Uint8Array(buffer));
      return array.map(function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    }
    throw new Error('SubtleCrypto not available — cannot compute SHA-256');
  }

  function HCLAuditLog() {
    this.entries = [];
    this._ready = Promise.resolve();
    this._loadFromStorage();
  }

  /**
   * Load chain from localStorage if present.
   * Silent on failure — a missing or corrupt store starts a fresh chain.
   */
  HCLAuditLog.prototype._loadFromStorage = function () {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.entries = parsed;
        }
      }
    } catch (_) {
      /* localStorage unavailable or corrupt — start fresh */
    }
  };

  /**
   * Persist the current chain to localStorage.
   * Silent on failure — the in-memory chain remains authoritative.
   */
  HCLAuditLog.prototype._saveToStorage = function () {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
    } catch (_) {
      /* localStorage full or unavailable — chain lives in memory */
    }
  };

  /**
   * Append a consent decision to the chain.
   *
   * @param {object} data - The decision record (tool, decision, args, etc.)
   * @returns {Promise<object>} The complete entry with hash
   */
  HCLAuditLog.prototype.append = function (data) {
    var self = this;

    self._ready = self._ready.then(function () {
      var index = self.entries.length;
      var previousHash = index === 0
        ? '0'.repeat(64)
        : self.entries[index - 1].hash;
      var timestamp = data.timestamp || new Date().toISOString();
      var serialized = JSON.stringify(data);

      return sha256(previousHash + timestamp + serialized).then(function (hash) {
        var entry = {
          index: index,
          timestamp: timestamp,
          data: data,
          previous_hash: previousHash,
          hash: hash
        };
        self.entries.push(entry);
        self._saveToStorage();
        return entry;
      });
    });

    return self._ready;
  };

  /**
   * Verify the integrity of the entire chain.
   *
   * @returns {Promise<{ valid: boolean, length: number, error: string|null, broken_at: number|null }>}
   */
  HCLAuditLog.prototype.verify = function () {
    var self = this;

    if (self.entries.length === 0) {
      return Promise.resolve({ valid: true, length: 0, error: null, broken_at: null });
    }

    var chain = Promise.resolve();
    var result = { valid: true, length: self.entries.length, error: null, broken_at: null };

    for (var i = 0; i < self.entries.length; i++) {
      (function (idx) {
        chain = chain.then(function () {
          if (!result.valid) return;

          var entry = self.entries[idx];
          var expectedPrev = idx === 0
            ? '0'.repeat(64)
            : self.entries[idx - 1].hash;

          if (entry.previous_hash !== expectedPrev) {
            result.valid = false;
            result.error = 'previous_hash mismatch at index ' + idx;
            result.broken_at = idx;
            return;
          }

          return sha256(
            entry.previous_hash + entry.timestamp + JSON.stringify(entry.data)
          ).then(function (recomputed) {
            if (entry.hash !== recomputed) {
              result.valid = false;
              result.error = 'hash mismatch at index ' + idx;
              result.broken_at = idx;
            }
          });
        });
      })(i);
    }

    return chain.then(function () { return result; });
  };

  /**
   * Export the chain as a JSON-serializable array.
   * @returns {object[]}
   */
  HCLAuditLog.prototype.export = function () {
    return JSON.parse(JSON.stringify(this.entries));
  };

  /**
   * Get the number of entries.
   * @returns {number}
   */
  HCLAuditLog.prototype.getLength = function () {
    return this.entries.length;
  };

  global.HCLAuditLog = HCLAuditLog;

})(typeof window !== 'undefined' ? window : this);
