/* Opnli Green Shield for WebMCP, OTN mode (test build, 01 Oct 2026). Apache-2.0.
 * A site's tool runs only after the MEMBER allows it on opn.li and the decision is on their chain.
 * The visiting agent proves who it is with a single-use OTN pass (argument "otn_pass").
 * The page never holds a badge or secret. */
(function (global) {
  'use strict';
  var CONSENT = 'https://consent.opn.li';
  var OTN = { tools: {}, evidence: [] };
  function text(t) { return { content: [{ type: 'text', text: t }] }; }
  function stripPass(args) { var c = {}; for (var k in (args || {})) if (k !== 'otn_pass') c[k] = args[k]; return c; }
  OTN.registerTool = function (toolDef, opts) {
    opts = opts || {};
    if (!toolDef || !toolDef.name || typeof toolDef.execute !== 'function') throw new Error('WebMCPOTN.registerTool needs name and execute');
    var schema = JSON.parse(JSON.stringify(toolDef.inputSchema || { type: 'object', properties: {} }));
    schema.properties = schema.properties || {};
    schema.properties.otn_pass = { type: 'string', description: 'Single-use Openly Trusted Network pass for this site, from https://consent.opn.li/v1/site-pass. Without it the site gives its standard response.' };
    var original = toolDef.execute;
    var wrapped = {
      name: toolDef.name,
      description: (toolDef.description || '') + ' The member approves on opn.li before this runs.',
      inputSchema: schema,
      execute: async function (args) {
        var pass = (args && typeof args.otn_pass === 'string') ? args.otn_pass.trim() : '';
        var clean = stripPass(args);
        if (!pass) {
          return opts.noPass ? opts.noPass(clean) : text('This site asks visiting agents to show an Openly Trusted Network pass. Nothing was done. Learn more at https://opn.li');
        }
        var d = {};
        try {
          var r = await fetch(CONSENT + '/v1/site-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pass: pass, tool_name: toolDef.name }) });
          d = await r.json().catch(function () { return {}; });
          if (!r.ok) d.allowed = false;
        } catch (e) { d = { allowed: false, reason: 'no answer from the Openly Trusted Network' }; }
        if (!d.allowed || !d.audit_hash || !d.proof) {
          return text('Not allowed. Nothing was done.' + (d.match_code ? ' Match code ' + d.match_code + '.' : '') + ' (' + (d.reason || 'refused') + ')');
        }
        var result = await original(clean);
        var ev = { tool: toolDef.name, decision_id: d.decision_id, audit_hash: d.audit_hash, match_code: d.match_code, proof: d.proof, at: new Date().toISOString() };
        OTN.evidence.push(ev);
        var body = (result && result.content && result.content[0] && result.content[0].text) || String(result);
        return { content: [{ type: 'text', text: body + '\n\nAllowed by the member on opn.li. Match code ' + d.match_code + '. Receipt ' + d.audit_hash }], otn: ev };
      }
    };
    OTN.tools[toolDef.name] = wrapped;
    var mc = (global.document && global.document.modelContext) || (global.navigator && global.navigator.modelContext);
    if (mc && typeof mc.registerTool === 'function') { try { mc.registerTool(wrapped); OTN.webmcp = true; } catch (e) { OTN.webmcp = false; OTN.webmcpError = e.message; } }
    return wrapped;
  };
  OTN.call = function (name, args) { var t = OTN.tools[name]; if (!t) return Promise.reject(new Error('no tool ' + name)); return t.execute(args || {}); };
  global.WebMCPOTN = OTN;
})(window);
