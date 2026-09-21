/**
 * WebMCP + Human Consent Layer
 *
 * Wraps WebMCP tool registrations with HCL consent gates.
 * The tool does not execute until the human approves — unless a
 * standing rule exists for that tool (checked first, logged always).
 *
 * Zero dependencies. Pure browser JavaScript.
 *
 * @license Apache-2.0
 * @copyright Opnli Corporation
 */

(function (global) {
  'use strict';

  var WebMCPHCL = {};

  var _tools = {};
  var _auditLog = null;

  function getAuditLog() {
    if (!_auditLog && global.HCLAuditLog) {
      _auditLog = new global.HCLAuditLog();
    }
    return _auditLog;
  }

  /**
   * Register a WebMCP tool with an HCL consent gate.
   *
   * @param {object} toolDef - Standard WebMCP tool definition
   * @param {object} cardContext - HCL CARD context for the consent card
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - Consent timeout in ms
   */
  WebMCPHCL.registerTool = function (toolDef, cardContext, options) {
    if (!toolDef || !toolDef.name || !toolDef.execute) {
      throw new Error('WebMCPHCL.registerTool requires a toolDef with name and execute');
    }
    if (!cardContext) {
      throw new Error('WebMCPHCL.registerTool requires cardContext (entity, data, use, boundary)');
    }

    var opts = options || {};
    var timeout = opts.timeout || 30000;
    var originalExecute = toolDef.execute;

    _tools[toolDef.name] = {
      def: toolDef,
      cardContext: cardContext,
      timeout: timeout
    };

    var wrappedDef = Object.assign({}, toolDef, {
      execute: function (args) {
        return new Promise(function (resolve, reject) {

          // Check standing rules first
          var rule = global.HCLConsentCard.checkRule(toolDef.name);
          if (rule) {
            var log = getAuditLog();
            if (log) {
              log.append({
                tool: toolDef.name,
                decision: rule.decision,
                source: 'standing_rule',
                args: args,
                entity: cardContext.entity,
                timestamp: new Date().toISOString()
              });
            }
            if (rule.decision === 'allow') {
              try {
                resolve(originalExecute(args));
              } catch (err) {
                reject(err);
              }
            } else {
              resolve({
                error: 'consent_denied',
                message: 'Blocked by standing rule.',
                tool: toolDef.name
              });
            }
            return;
          }

          // No standing rule — show the consent card
          global.HCLConsentCard.show({
            toolName: toolDef.name,
            toolDescription: toolDef.description,
            args: args,
            cardContext: cardContext,
            timeout: timeout,
            onAllow: function () {
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'allow',
                  source: 'card',
                  args: args,
                  entity: cardContext.entity,
                  timestamp: new Date().toISOString()
                });
              }
              try {
                resolve(originalExecute(args));
              } catch (err) {
                reject(err);
              }
            },
            onStandingAllow: function (detail) {
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'allow',
                  source: 'card_standing',
                  duration: detail.duration,
                  args: args,
                  entity: cardContext.entity,
                  timestamp: new Date().toISOString()
                });
              }
              try {
                resolve(originalExecute(args));
              } catch (err) {
                reject(err);
              }
            },
            onDeny: function () {
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'deny',
                  source: 'card',
                  args: args,
                  entity: cardContext.entity,
                  timestamp: new Date().toISOString()
                });
              }
              resolve({
                error: 'consent_denied',
                message: 'The user denied this action.',
                tool: toolDef.name
              });
            },
            onStandingDeny: function () {
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'deny',
                  source: 'card_standing',
                  args: args,
                  entity: cardContext.entity,
                  timestamp: new Date().toISOString()
                });
              }
              resolve({
                error: 'consent_denied',
                message: 'Blocked. Standing deny rule set.',
                tool: toolDef.name
              });
            },
            onTimeout: function () {
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'timeout',
                  source: 'card',
                  args: args,
                  entity: cardContext.entity,
                  timestamp: new Date().toISOString()
                });
              }
              resolve({
                error: 'consent_timeout',
                message: 'Consent timed out. Action denied.',
                tool: toolDef.name
              });
            }
          });
        });
      }
    });

    var mc = (global.document && global.document.modelContext) || (global.navigator && global.navigator.modelContext);
    if (mc && typeof mc.registerTool === 'function') {
      mc.registerTool(wrappedDef);
    }

    return wrappedDef;
  };

  /**
   * Auto-scan the DOM for forms with data-hcl-consent="true".
   */
  WebMCPHCL.scanDeclarative = function () {
    var forms = document.querySelectorAll('form[data-hcl-consent="true"]');
    for (var i = 0; i < forms.length; i++) {
      var form = forms[i];
      var toolName = form.getAttribute('tool-name');
      var toolDesc = form.getAttribute('tool-description');
      if (!toolName) continue;

      var cardContext = {
        entity: { name: form.getAttribute('data-hcl-entity') || 'Unknown Agent' },
        data: { summary: form.getAttribute('data-hcl-data') || 'Form data' },
        use: { summary: form.getAttribute('data-hcl-use') || toolDesc || 'Perform action' },
        boundary: { summary: form.getAttribute('data-hcl-boundary') || 'This action only' }
      };

      var inputs = form.querySelectorAll('input[name], select[name], textarea[name]');
      var properties = {};
      var required = [];
      for (var j = 0; j < inputs.length; j++) {
        var input = inputs[j];
        var name = input.getAttribute('name');
        var type = input.getAttribute('type') || 'text';
        properties[name] = {
          type: (type === 'number') ? 'number' : 'string'
        };
        if (input.hasAttribute('required')) {
          required.push(name);
        }
      }

      (function (f, tn, td, cc, props, req) {
        WebMCPHCL.registerTool({
          name: tn,
          description: td || '',
          inputSchema: {
            type: 'object',
            properties: props,
            required: req
          },
          execute: function (args) {
            for (var key in args) {
              var el = f.querySelector('[name="' + key + '"]');
              if (el) el.value = args[key];
            }
            f.requestSubmit();
            return { submitted: true };
          }
        }, cc);
      })(form, toolName, toolDesc, cardContext, properties, required);
    }
  };

  /**
   * Get all registered tools and their CARD contexts.
   * @returns {object}
   */
  WebMCPHCL.getTools = function () {
    return Object.assign({}, _tools);
  };

  /**
   * Get the audit log instance.
   * @returns {HCLAuditLog|null}
   */
  WebMCPHCL.getAuditLog = function () {
    return getAuditLog();
  };

  /**
   * Open the standing rules review panel.
   */
  WebMCPHCL.reviewRules = function () {
    global.HCLConsentCard.showReviewPanel();
  };

  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      WebMCPHCL.scanDeclarative();
    });
  }

  global.WebMCPHCL = WebMCPHCL;

})(typeof window !== 'undefined' ? window : this);
