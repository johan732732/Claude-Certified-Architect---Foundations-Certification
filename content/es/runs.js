window.CCARF = window.CCARF || {};

// JavaScript of the same case the flowchart walks. `code` and `watch` stay in English.
(function () {
  const step = (code, watch, focus) => ({ code: code.replace(/^\n/, "").replace(/\n$/, ""), watch: watch, focus: focus || [] });
  const loopSource = `
const messages = [
  { role: "user", content: "Has the refund for order 10091 gone out?" }
];
while (true) {
  const response = await client.messages.create({
    max_tokens: 1024,
    tools: [{ name: "lookup_order" }, { name: "process_refund" }],
    messages
  });
  if (response.stop_reason === "end_turn") {
    return response.content[0].text;
  }
  if (response.stop_reason !== "tool_use") {
    throw new Error("truncated: do not run a partial tool");
  }
  const calls = response.content.filter((block) => block.type === "tool_use");
  messages.push({ role: "assistant", content: response.content });
  messages.push({
    role: "user",
    content: calls.map((block) => ({
      type: "tool_result",
      tool_use_id: block.id,
      content: run(block)
    }))
  });
}`.replace(/^\n/, "").replace(/\n$/, "");
  const answer = "Refund for 10091 was issued on 2026-03-03 for 48.20 USD.";
  const mocked = {
    tool: { stop_reason: "tool_use", content: [{ type: "tool_use", id: "toolu_01", name: "lookup_order", input: { order_id: "10091" } }] },
    done: { stop_reason: "end_turn", content: [{ type: "text", text: answer }] },
    cut: { stop_reason: "max_tokens", content: [{ type: "tool_use", id: "toolu_09", name: "process_refund", input: { order_id: "10091", amount: 48 } }] },
    text: { stop_reason: "tool_use", content: [{ type: "text", text: "Done. The refund is complete." }, { type: "tool_use", id: "toolu_10", name: "lookup_order", input: { order_id: "10091" } }] },
  };

  const program = (source, mocks) => ({
    source: source.replace(/^\n/, "").replace(/\n$/, ""),
    mocks: mocks || { run: [] },
    tools: {}
  });
  const branch = (label, queue) => ({ label: label, queue: queue || [] });

  CCARF.runs = {
    "1.1": {
      source: loopSource,
      tools: { lookup_order: "issued 2026-03-03, 48.20 USD" },
      mocks: {
        turn: [mocked.tool, mocked.done],
        cut: [mocked.cut],
        text: [mocked.text, mocked.done],
      },
    },
    "1.2": program(`
const plan = ["lookup order", "read policy", "draft reply"];
const first = {
  orders: "issued 2026-03-03, 48.20 USD",
  policy: "policy does not state the window",
  draft: "draft, missing the window"
};
const received = ["digital art", "graphic design", "photography"];
const missing = ["music", "writing", "film"];
let findings = [first.orders, first.policy, first.draft];
const whoDecides = "coordinator";
if (scene === "gap" && findings[1].includes("does not state")) {
  findings[1] = "30 days from issue";
}
if (scene === "fine") findings = missing;
return { plan, findings, whoDecides, received };
`, {
      gap: branch("s12gap"),
      fine: branch("s12fine")
    }),
    "1.3": program(`
const known = { order_id: "10091", issued: "2026-03-03", amount: "48.20 USD", source: "lookup_order" };
const prompt = scene === "cited" ? "Write the reply." : "Write the reply. Use what the search agent found.";
const claim = scene === "cited" ? known : null;
const reply = claim
  ? claim.amount + ", issued " + claim.issued + ", source " + claim.source
  : "issued on 2026-03-04 for 50 USD";
return { known, prompt, claim, reply };
`, {
      invented: branch("s13bad"),
      cited: branch("s13good")
    }),
    "1.4": program(`
const session = { verified: scene === "allowed" };
const asked = { tool: "process_refund", order_id: "10091", amount: "48.20 USD" };
if (!session.verified) throw new Error("verify the customer first");
const result = "refund issued";
return { session, asked, result };
`, {
      blocked: branch("s14blocked"),
      allowed: branch("s14allowed")
    }),
    "1.5": program(`
const call = { name: "process_refund", input: { order_id: "10091", amount: 800 } };
const ran = call.input.amount <= 500;
const gate = ran ? "allowed" : "blocked: over 500 USD, escalate";
const raw = { issued_at: 1740960000, status: 2 };
const normalized = { issued_at: "2026-03-03", status: raw.status === 2 ? "issued" : String(raw.status) };
return { call, gate, ran, raw, normalized };
`),
    "1.6": program(`
let row = null;
let discovered = null;
if (scene === "fixed") {
  const stages = ["extract invoice", "validate totals", "write the row"];
  for (const stage of stages) {
    if (stage === "extract invoice") row = { order_id: "10091" };
    if (stage === "validate totals") row = { order_id: "10091", total: "48.20 USD" };
    if (stage === "write the row") row = { order_id: "10091", total: "48.20 USD", written: true };
  }
} else {
  const open = "Why did the refund never arrive?";
  discovered = ["payment", "address", "bank"];
  row = { open: open, discovered: discovered };
}
return { scene, row, discovered };
`, {
      fixed: branch("s16fixed"),
      open: branch("s16open")
    }),
    "1.7": program(`
const session = { id: "billing-refactor", files: { "src/invoice.ts": { asOf: "yesterday" } } };
const disk = { changed: ["src/invoice.ts"] };
const stale = session.files["src/invoice.ts"];
const fresh = disk.changed.indexOf("src/invoice.ts") >= 0 ? { asOf: "today" } : stale;
const branch = { id: "compare-designs", parent: session.id };
return { session, disk, stale, fresh, branch };
`),
    "2.1": program(`
const tools = [
  { name: "analyze_document", description: "Analyze the content" },
  { name: "analyze_invoice", description: "Extract number, amount and date from an invoice. Not for contracts." }
];
const picked = "analyze_document";
tools[0].description = "Summarize a contract. Do not use on invoices.";
const again = "analyze_invoice";
return { tools, picked, again };
`),
    "2.2": program(`
const vague = { error: "Operation failed" };
const transient = { isError: true, errorCategory: "transient", isRetryable: true, description: "Payment service timed out. Retry the same request once." };
const overLimit = { isError: true, errorCategory: "business", isRetryable: false, description: "Refund 800 USD is over the 500 USD policy." };
const vagueNext = "isRetryable" in vague ? "retry" : "unknown";
const transientNext = transient.isRetryable ? "retry once" : "do not retry";
const limitNext = overLimit.isRetryable ? "retry once" : "explain the limit, do not retry";
return { vague, transient, overLimit, vagueNext, transientNext, limitNext };
`),
    "2.3": program(`
let allowedTools = ["web_search", "summarize", "cite"];
let called = allowedTools.indexOf("web_search") >= 0 ? "web_search" : allowedTools[0];
allowedTools = ["summarize", "cite", "verify_fact"];
called = allowedTools.indexOf("web_search") >= 0 ? "web_search" : "not allowed";
const toolChoice = { type: "tool", name: "extract_metadata" };
return { allowedTools, called, toolChoice };
`),
    "2.4": program(`
const project = { file: ".mcp.json", servers: { jira: { url: "https://jira.example", token: "\${JIRA_TOKEN}" } } };
const user = { file: "~/.claude.json", servers: { scratch: { url: "http://localhost:9" } } };
const choice = "jira.search";
return { project, user, choice };
`),
    "2.5": program(`
const hits = ["src/refund.js", "src/order.js", "test/refund.js", "docs/refund.md"];
const file = { path: hits[0], text: "function calculateRefund() {}\\nfunction calculateRefund() {}" };
const oldString = "function calculateRefund";
const count = file.text.split(oldString).length - 1;
let editError = "";
let fallback = "";
if (count !== 1) {
  editError = "old_string is not unique";
  fallback = "read the whole file, then write it back";
  file.text = file.text.split(oldString).join("function computeRefund");
}
return { hits, file, editError, fallback };
`),
    "3.1": program(`
const loaded = ["repo/CLAUDE.md", "~/.claude/CLAUDE.md"];
const teammateSees = loaded.filter((path) => path.indexOf("~") !== 0);
const imported = "packages/api/standards/errors.md";
const uiLoadsIt = false;
return { loaded, teammateSees, imported, uiLoadsIt };
`),
    "3.2": program(`
const command = ".claude/commands/review-pr.md";
const sharedByGit = command.indexOf(".claude/") === 0;
const skill = {
  file: ".claude/skills/coverage/SKILL.md",
  frontmatter: { context: "fork", allowedTools: ["Read", "Write"], argumentHint: "ticket id" }
};
const mainThreadSees = skill.frontmatter.context === "fork" ? "summary only" : "everything";
return { command, sharedByGit, skill, mainThreadSees };
`),
    "3.3": program(`
const rule = { paths: "**/*.test.tsx", text: "Use Testing Library, not Enzyme." };
const editing = "src/checkout/Button.test.tsx";
const ruleLoaded = editing.endsWith(".test.tsx");
const other = "server/refunds.ts";
const loaded = other.endsWith(".test.tsx");
return { rule, editing, ruleLoaded, other, loaded };
`),
    "3.4": program(`
const change = { files: 40, architecture: "still open" };
const mode = change.architecture === "still open" ? "plan" : "execute";
const bug = { file: "refund.js", line: 42, cause: "off-by-one" };
const next = bug.cause ? "execute" : "plan";
return { change, mode, bug, next };
`),
    "3.5": program(`
let prompt = "Be careful and conservative with the format.";
let outputs = ["{total:48.2}", "total is 48.20", "48.2 USD"];
let sameShape = outputs.filter((item, index) => outputs.indexOf(item) === index).length === 1;
prompt = ["Input: invoice 10091. Output: { total: 48.20 }", "Input: invoice 10092. Output: { total: null }"].join("\\n");
outputs = ["{ total: 48.20 }", "{ total: 48.20 }", "{ total: 48.20 }"];
sameShape = outputs.filter((item, index) => outputs.indexOf(item) === index).length === 1;
const failures = ["expected 48.20, got 48"];
prompt = prompt + "\\nFailing tests:\\n" + failures.join("\\n");
return { prompt, outputs, sameShape, failures };
`),
    "3.6": program(`
const flags = ["-p", "--output-format json", "--json-schema"];
const waitsForKeyboard = flags.indexOf("-p") < 0;
const stdout = { findings: [{ file: "refund.js", line: 42, note: "amount unchecked" }] };
const posted = stdout.findings.length;
const prior = stdout.findings;
const again = { findings: [] };
return { flags, waitsForKeyboard, stdout, posted, prior, again };
`),
    "4.1": program(`
const vague = { falsePositives: "high" };
const criteria = { report: ["missing auth check", "amount not validated"], skip: ["rename suggestions", "comment style"] };
const second = { falsePositives: "low", categories: { naming: { falsePositives: "high", enabled: true } } };
if (second.categories.naming.falsePositives === "high") second.categories.naming.enabled = false;
return { vague, criteria, second };
`),
    "4.2": program(`
const examples = [
  { input: "refund 48.20, policy silent", decision: "escalate", because: "the policy has a gap" },
  { input: "refund 20, customer verified", decision: "allow", because: "under the cap and verified" }
];
const shot = { format: "matches the examples", schemaGuaranteed: false };
return { examples, shot };
`),
    "4.3": program(`
const schema = {
  type: "object",
  properties: {
    total: { type: "number" },
    issued: { type: ["string", "null"] },
    category: { enum: ["refund", "other"] },
    category_detail: { type: "string" }
  },
  required: ["total", "issued", "category"]
};
const out = await client.messages.create({ tools: [{ name: "save", input_schema: schema }], tool_choice: { type: "tool", name: "save" } });
const shapeValid = out.stop_reason === "tool_use";
const totalChecked = false;
return { schema, out, shapeValid, totalChecked };
`, {
      run: [{ stop_reason: "tool_use", content: [{ type: "tool_use", name: "save", input: { total: 48.2, issued: null, category: "other", category_detail: "goodwill" } }] }]
    }),
    "4.4": program(`
const extracted = { line_items: [20, 28.2], stated_total: 48.2 };
const calculated = extracted.line_items.reduce((sum, n) => sum + n, 0);
const conflict = calculated !== extracted.stated_total;
const bad = { line_items: [20], stated_total: 48.2 };
const badCalculated = bad.line_items.reduce((sum, n) => sum + n, 0);
let retry = null;
if (badCalculated !== bad.stated_total) retry = { errors: ["calculated_total 20 != stated_total 48.2"] };
const documentText = "total 48.20";
const issued = documentText.indexOf("issued") >= 0 ? "present" : null;
const fabricated = false;
return { extracted, calculated, conflict, badCalculated, retry, issued, fabricated };
`),
    "4.5": program(`
const fileCount = 10000;
const files = [{ name: "invoice-10091.pdf", text: "total 48.20" }];
const batch = { customIds: files.map((file) => file.name), someoneWaiting: false, fileCount: fileCount };
const results = [{ custom_id: "invoice-10091.pdf", result: { type: "errored" } }];
const failed = results.filter((row) => row.result.type === "errored");
const resent = failed.map((row) => row.custom_id);
const blocking = true;
const api = blocking ? "messages.create" : "messages.batches.create";
return { batch, failed, resent, api };
`),
    "4.6": program(`
const author = { remembersWritingIt: true };
const review = { remembersWritingIt: false };
const files = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n"];
const local = files.map((file, index) => ({ file: file, index: index }));
const integration = { looksAt: "findings, not the 14 raw files", count: local.length };
const findings = [{ confidence: 0.4 }, { confidence: 0.9 }, { confidence: 0.2 }, { confidence: 0.95 }];
const routed = findings.filter((row) => row.confidence < 0.8);
const confidenceIsProof = false;
return { author, review, integration, routed, confidenceIsProof };
`),
    "5.1": program(`
const history = "customer is upset about a refund";
const caseFacts = { refund: "48.20 USD", order_id: "10091", promised: "2026-04-02" };
const prompt = { caseFacts: caseFacts, history: history };
const order = { id: "10091", total: "48.20 USD", status: "issued", issued: "2026-03-03", currency: "USD", note: "extra", raw: "html" };
const kept = { id: order.id, total: order.total, status: order.status, issued: order.issued, currency: order.currency };
const longReport = { summaryAtTop: ["refund 48.20"], body: ["details"] };
return { history, caseFacts, prompt, order, kept, longReport };
`),
    "5.2": program(`
const customer = "I want to speak with a human.";
const askedHuman = /human/.test(customer);
const ask = "Match the competitor price";
const policy = "adjustments only on our own site";
const covers = ask.indexOf("competitor") < 0;
const escalated = [];
if (askedHuman) escalated.push({ reason: "customer asked" });
if (!covers) escalated.push({ reason: "policy gap" });
const inventedRule = false;
return { customer, askedHuman, ask, policy, covers, escalated, inventedRule };
`),
    "5.3": program(`
const sources = [
  { status: "fulfilled", value: "ok" },
  { status: "fulfilled", value: "ok" },
  { status: "rejected", reason: "timeout" }
];
const timeout = sources.find((row) => row.status === "rejected");
const result = {
  ok: sources.filter((row) => row.status === "fulfilled"),
  failed: { type: "timeout", query: "c", alternatives: ["search d"] }
};
const presentedAsEmptySuccess = false;
return { sources, timeout, result, presentedAsEmptySuccess };
`),
    "5.4": program(`
const scratch = [];
scratch.push({ phase: 3, classes: ["RefundService", "PolicyGate"] });
const answer = scratch[0].classes.join(", ");
const manifest = { done: ["scan", "map"], next: "review" };
const resumed = manifest;
const restartedFromZero = resumed.next !== "review";
return { scratch, answer, resumed, restartedFromZero };
`),
    "5.5": program(`
const overall = 0.97;
const byType = { invoice: 0.99, contract: 0.61 };
const rows = [
  { confidence: 0.4, sourcesConflict: false },
  { confidence: 0.9, sourcesConflict: true },
  { confidence: 0.95, sourcesConflict: false }
];
const threshold = 0.8;
const queue = rows.filter((row) => row.confidence < threshold || row.sourcesConflict);
const fromLabeledSet = true;
return { overall, byType, threshold, queue, fromLabeledSet };
`),
    "5.6": program(`
const sources = [
  { value: "48.20 USD", date: "2026-03-03", url: "lookup_order" },
  { value: "50 USD", date: "2026-01-01", url: "old-report" }
];
const report = { metric: "refund", values: sources, pickedSilently: null };
const documents = ["lookup_order", "old-report"];
const missing = documents.indexOf("competitor price") >= 0 ? null : "competitor price";
const filledFromMemory = false;
return { sources, report, missing, filledFromMemory };
`),
  };
})();
