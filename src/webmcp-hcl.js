/**
 * WebMCP + Human Consent Layer
 *
 * Wraps WebMCP tool registrations with HCL consent gates.
 * The tool does not execute until the human approves.
 *
 * Zero dependencies. Pure browser JavaScript.
 *
 * @license Apache-2.0
 * @copyright Opnli Corporation
 */

(function (global) {
  'use strict';

  const WebMCPHCL = {};

  // Internal registry of wrapped tools
  const _tools = {};

  // Audit log instance (created on first use)
  let _auditLog = null;

  function getAuditLog() {
    if (!_auditLog && global.HCLAuditLog) {
      _auditLog = new global.HCLAuditLog();
    }
    return _auditLog;
  }

  /**
   * Register a WebMCP tool with an HCL consent gate.
   *
   * The tool is registered with the browser's WebMCP API normally
   * so agents can discover it. When invoked, execution is intercepted
   * and a consent card is shown to the human before proceeding.
   *
   * @param {object} toolDef - Standard WebMCP tool definition
   *   (name, description, inputSchema, execute)
   * @param {object} cardContext - HCL CARD context for the consent card
   * @param {object} cardContext.entity - Entity CARD summary
   * @param {object} cardContext.data - Data CARD summary
   * @param {object} cardContext.use - Use CARD summary
   * @param {object} cardContext.boundary - Boundary CARD summary
   * @param {object} [options]
   * @param {number} [options.timeout=30000] - Consent timeout in ms (default 30s)
   */
  WebMCPHCL.registerTool = function (toolDef, cardContext, options) {
    if (!toolDef || !toolDef.name || !toolDef.execute) {
      throw new Error('WebMCPHCL.registerTool requires a toolDef with name and execute');
    }
    if (!cardContext) {
      throw new Error('WebMCPHCL.registerTool requires cardContext (entity, data, use, boundary)');
    }

    const opts = options || {};
    const timeout = opts.timeout || 30000;
    const originalExecute = toolDef.execute;

    // Store the tool context for reference
    _tools[toolDef.name] = {
      def: toolDef,
      cardContext: cardContext,
      timeout: timeout
    };

    // Create the wrapped tool definition
    const wrappedDef = Object.assign({}, toolDef, {
      execute: function (args) {
        return new Promise(function (resolve, reject) {
          // Show consent card and wait for decision
          var card = global.HCLConsentCard.show({
            toolName: toolDef.name,
            toolDescription: toolDef.description,
            args: args,
            cardContext: cardContext,
            timeout: timeout,
            onAllow: function () {
              // Log the Allow decision
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'allow',
                  args: args,
                  entity: cardContext.entity,
                  timestamp: new Date().toISOString()
                });
              }
              // Execute the original function
              try {
                var result = originalExecute(args);
                resolve(result);
              } catch (err) {
                reject(err);
              }
            },
            onDeny: function () {
              // Log the Deny decision
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'deny',
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
            onTimeout: function () {
              // INV-FC: fail-closed on timeout
              var log = getAuditLog();
              if (log) {
                log.append({
                  tool: toolDef.name,
                  decision: 'timeout',
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

    // Register with the browser's WebMCP API if available
    if (global.navigator && global.navigator.modelContext &&
        typeof global.navigator.modelContext.registerTool === 'function') {
      global.navigator.modelContext.registerTool(wrappedDef);
    }

    return wrappedDef;
  };

  /**
   * Auto-scan the DOM for forms with data-hcl-consent="true"
   * and wrap their WebMCP tool registrations with consent gates.
   *
   * Call this after the DOM is loaded.
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

      // Build input schema from form fields
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
            // Fill and submit the form
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
   * @returns {object} Map of tool name to { def, cardContext }
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

  // Auto-scan on DOMContentLoaded
  if (typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', function () {
      WebMCPHCL.scanDeclarative();
    });
  }

  global.WebMCPHCL = WebMCPHCL;

})(typeof window !== 'undefined' ? window : this);
