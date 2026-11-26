window.CCARF = window.CCARF || {};

// JavaScript of the same case the flowchart walks. `code` and `watch` stay in English.
(function () {
  const step = (code, watch, focus) => ({ code: code.replace(/^\n/, "").replace(/\n$/, ""), watch: watch, focus: focus || [] });
  const loopSource = `
const user = "Has the refund for order 10091 gone out?";
const messages = [
  { role: "user", content: user }
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
  const branch = (label, queue, source) => ({
    label: label,
    queue: queue || [],
    source: source ? source.replace(/^\n/, "").replace(/\n$/, "") : ""
  });

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
const user = "Summarize refund 10091: the order, the policy, and a draft reply.";
const messages = [{ role: "user", content: user }];
const first = await client.messages.create({
  max_tokens: 1024,
  tools: [{ name: "Task" }],
  messages
});
const tasks = first.content.filter((block) => block.name === "Task");
const notes = {
  papers: "order 10091, 48.20 USD",
  policy: "policy does not state the window",
  draft: "draft, missing the window"
};
const notesBack = tasks.map((task) => ({
  job: task.input.agent,
  sawOnly: task.input.prompt,
  note: notes[task.input.agent]
}));
messages.push({ role: "assistant", content: first.content });
messages.push({
  role: "user",
  content: notesBack.map((item) => item.job + ": " + item.note).join("\\n")
});
const second = await client.messages.create({
  max_tokens: 1024,
  tools: [{ name: "Task" }],
  messages
});
const missingDate = second.content.filter((block) => block.name === "Task");
const date = "2026-03-03";
messages.push({ role: "assistant", content: second.content });
messages.push({ role: "user", content: "date: " + date });
const third = await client.messages.create({ max_tokens: 1024, messages });
const reply = third.stop_reason === "end_turn" ? third.content[0].text : "";
return { user, tasks, notesBack, missingDate, reply };
`, {
      gap: branch("s12gap", [
        {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "task_01", name: "Task", input: { agent: "papers", prompt: "order 10091" } },
            { type: "tool_use", id: "task_02", name: "Task", input: { agent: "policy", prompt: "refund policy" } },
            { type: "tool_use", id: "task_03", name: "Task", input: { agent: "draft", prompt: "draft the reply" } }
          ]
        },
        {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "task_04", name: "Task", input: { agent: "papers", prompt: "date of refund 10091" } }
          ]
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Refund for 10091 was issued on 2026-03-03 for 48.20 USD." }]
        }
      ]),
      fine: branch("s12fine", [
        {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "task_11", name: "Task", input: { agent: "digital art", prompt: "digital art only" } },
            { type: "tool_use", id: "task_12", name: "Task", input: { agent: "graphic design", prompt: "graphic design only" } },
            { type: "tool_use", id: "task_13", name: "Task", input: { agent: "photography", prompt: "photography only" } }
          ]
        }
      ], `
const user = "Summarize creative industries.";
const messages = [{ role: "user", content: user }];
const first = await client.messages.create({
  max_tokens: 1024,
  tools: [{ name: "Task" }],
  messages
});
const tasks = first.content.filter((block) => block.name === "Task");
const received = tasks.map((task) => task.input.agent);
const missing = ["music", "writing", "film"];
const whoDecides = "coordinator";
return { user, tasks, received, missing, whoDecides };
`)
    }),
    "1.3": program(`
const user = "Write the reply for order 10091.";
const messages = [{ role: "user", content: user }];
const prompt = "Use what the search agent found about 10091.";
const notesInPrompt = prompt.indexOf("http") >= 0;
messages.push({ role: "user", content: prompt });
const replyCall = await client.messages.create({ max_tokens: 1024, messages });
const reply = replyCall.content[0].text;
const sources = [];
return { user, prompt, notesInPrompt, reply, sources };
`, {
      invented: branch("s13bad", [
        { stop_reason: "end_turn", content: [{ type: "text", text: "Order 10091 shipped recently." }] }
      ]),
      cited: branch("s13good", [
        {
          stop_reason: "tool_use",
          content: [
            { type: "tool_use", id: "task_01", name: "Task", input: { agent: "orders", prompt: "status of 10091" } },
            { type: "tool_use", id: "task_02", name: "Task", input: { agent: "shipping", prompt: "address of 10091" } }
          ]
        },
        {
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Order 10091 shipped on 2026-03-03, per the order system." }]
        }
      ], `
const user = "Where is order 10091, and what is the shipping address?";
const messages = [{ role: "user", content: user }];
const first = await client.messages.create({
  max_tokens: 1024,
  tools: [{ name: "Task" }],
  messages
});
const tasks = first.content.filter((block) => block.name === "Task");
const orders = { claim: "shipped 2026-03-03", source: "https://orders.example/10091" };
const shipping = { claim: "dock 4, Austin", source: "https://shipping.example/10091" };
const prompt = [
  "Write one reply.",
  "Note A: " + orders.claim,
  "  source: " + orders.source,
  "Note B: " + shipping.claim,
  "  source: " + shipping.source
].join("\\n");
messages.push({ role: "user", content: prompt });
const replyCall = await client.messages.create({ max_tokens: 1024, messages });
const reply = replyCall.content[0].text;
return { user, tasks, orders, shipping, prompt, reply };
`)
    }),
    "1.4": program(`
const user = "Refund order 10091 and change the shipping address.";
const items = ["refund", "address_change"];
const session = { verified_customer_id: null };
const asked = { tool: "process_refund", order_id: "10091", amount: 48.2 };
const rejectedBeforeVerify = session.verified_customer_id === null;
session.verified_customer_id = "cus_44";
const issued = "refund issued";
const handoff = {
  customer_id: session.verified_customer_id,
  cause: "duplicate charge",
  amount: 48.2,
  action: "confirm the refund"
};
return { items, rejectedBeforeVerify, issued, handoff };
`, {
      blocked: branch("s14blocked"),
      prompt: branch("s14prompt", [], `
const user = "Refund order 10091 and change the shipping address.";
const session = { verified_customer_id: null };
const rule = "NEVER transfer money before verifying identity.";
const asked = { tool: "process_refund", order_id: "10091", amount: 48.2 };
const result = "issued";
const addressChange = "lost";
const handoff = "the customer is upset";
return { rule, session, asked, result, addressChange, handoff };
`)
    }),
    "1.5": program(`
const asked = "Refund 800 USD on order 10091.";
const call = { name: "process_refund", input: { order_id: "10091", amount: 800 } };
const ran = call.input.amount <= 500;
const gate = ran ? "allowed" : "blocked: over 500 USD, hand to a person";
const raw = { timestamp: 1773014400, status: 200 };
const normalized = { date: "2026-03-09", state: "issued" };
return { call, ran, gate, raw, normalized };
`, {
      hook: branch("s15hook"),
      prompt: branch("s15prompt", [], `
const asked = "Refund 620 USD on order 10091.";
const rule = "Escalate refunds over 500 USD.";
const call = { name: "process_refund", input: { amount: 620 } };
const hook = false;
const result = "issued 620 USD";
return { rule, call, hook, result };
`)
    }),
    "1.6": program(`
const asked = "Review this change. Look at each file, then at what crosses between them.";
const pass1 = [
  { file: "src/invoice.ts", found: "local bugs" },
  { file: "src/tax.ts", found: "local bugs" }
];
const pass2 = { input: "findings from pass 1", lookFor: "data that leaves one file and enters another" };
return { pass1, pass2 };
`, {
      fixed: branch("s16fixed"),
      open: branch("s16open", [], `
const asked = "Add tests to this legacy repo. The steps are not known yet.";
const chain = ["scan", "test the service layer", "cannot be skipped"];
const repo = { serviceLayer: false };
const stuck = "step 2 asks for a layer the repo does not have";
return { chain, repo, stuck };
`)
    }),
    "1.7": program(`
const asked = "Resume billing-refactor. src/invoice.ts changed since Monday.";
const session = { id: "billing-refactor" };
const told = "src/invoice.ts changed since Monday";
const reread = "src/invoice.ts";
const branch = { id: "compare-designs", parent: session.id, original: "untouched" };
return { session, told, reread, branch };
`, {
      named: branch("s17named"),
      silent: branch("s17silent", [], `
const asked = "Resume billing-refactor. It is faster than starting over.";
const session = { id: "billing-refactor" };
const changed = "payments.ts now returns a number, not a string";
const told = false;
const oldResult = "payments.charge -> string";
const proposal = "keep parsing the string";
return { session, changed, told, oldResult, proposal };
`)
    }),
    "2.1": program(`
const asked = "What is the refund policy for order 10091?";
const tools = [
  { name: "extract_web_results", description: "Web pages. Example: query 'refund policy'. Returns titles and urls. Do not use for an internal PDF." },
  { name: "summarize_document", description: "One uploaded document. Example: a PDF invoice. Do not use for a web search." }
];
const picked = "extract_web_results";
return { tools, picked };
`, {
      clear: branch("s21clear"),
      vague: branch("s21vague", [], `
const asked = "Summarize this PDF invoice.";
const tools = [
  { name: "analyze_content", description: "Analyze the content." },
  { name: "analyze_document", description: "Analyze the document." }
];
const picked = "analyze_content";
return { tools, asked, picked };
`)
    }),
    "2.2": program(`
const asked = "What is the payment status for order 10091?";
const transient = { isError: true, errorCategory: "transient", isRetryable: true, description: "timeout, retry the same call once" };
const afterRetry = { status: "issued", amount: 48.2 };
const permission = { isError: true, errorCategory: "permission", isRetryable: false, description: "no access to the refunds folder" };
const hidden = { isError: false, value: [] };
const vague = { error: "Operation failed" };
const transientNext = transient.isRetryable ? "retry once" : "do not retry";
const permissionNext = permission.isRetryable ? "retry once" : "do not retry";
const hiddenNext = "the report says there are no papers";
const vagueNext = "isRetryable" in vague ? "retry" : "unknown";
return { transient, afterRetry, permission, hidden, vague, transientNext, permissionNext, hiddenNext, vagueNext };
`),
    "2.3": program(`
const asked = "Read invoice 10091. Type it before you enrich the vendor.";
const tools = ["extract_metadata", "enrich_vendor"];
const toolChoice = { type: "tool", name: "extract_metadata" };
const called = toolChoice.type === "tool" ? toolChoice.name : "text only";
const synthesizer = ["verify_fact"];
return { tools, toolChoice, called, synthesizer };
`, {
      forced: branch("s23forced"),
      auto: branch("s23auto", [], `
const asked = "What kind of document is invoice 10091?";
const tools = ["web_search", "draft_reply"];
const toolChoice = { type: "auto" };
const called = "none";
const reply = "This document is an invoice.";
return { tools, toolChoice, called, reply };
`)
    }),
    "2.4": program(`
const asked = "What is open in Jira for the duplicate refund on 10091?";
const project = { file: ".mcp.json", token: "\${GITHUB_TOKEN}", committed: true };
const jira = { source: "community", resource: ["PROJ-14 Refund duplicate on 10091", "PROJ-15 Address change stuck"] };
const choice = "search_issues";
const leaked = { file: ".mcp.json", token: "ghp_live_secret", server: "http://localhost:9999" };
const vagueTool = { name: "jira_search", description: "Search Jira." };
const leakedChoice = "Grep";
return { project, jira, choice, leaked, vagueTool, leakedChoice };
`),
    "2.5": program(`
const asked = "Find processRefund and change the return that means the refund is missing.";
const hits = ["src/billing/refund.ts", "src/api/routes.ts", "src/billing/refund.test.ts"];
const file = { path: hits[0], text: "return null;\\nreturn null;\\nreturn null;\\nreturn null;\\nreturn null;\\nreturn null;" };
const oldString = "return null;";
const count = file.text.split(oldString).length - 1;
let editError = "";
let fallback = "";
if (count !== 1) {
  editError = "old_string is not unique";
  fallback = "read the whole file, then write it back";
}
const unique = "return null; // refund missing";
return { hits, file, oldString, count, editError, fallback, unique };
`),
    "3.1": program(`
const asked = "Open this repo and follow the team's rules.";
const loaded = [
  { file: "~/.claude/CLAUDE.md", rule: "Answer me in Spanish." },
  { file: "./CLAUDE.md", rule: "Use the internal logger. Do not use console.log." },
  { file: "./packages/api/CLAUDE.md", imports: "./standards/errors.md" }
];
const teammateSees = loaded.filter((item) => item.file.indexOf("~") !== 0);
const uiLoadsIt = false;
const personalOnly = { file: "~/.claude/CLAUDE.md", rule: "Use the internal logger. Do not use console.log." };
const freshCloneSeesLogger = false;
return { loaded, teammateSees, uiLoadsIt, personalOnly, freshCloneSeesLogger };
`),
    "3.2": program(`
const asked = "/review-pr 10091";
const command = { invoke: asked, file: ".claude/commands/review-pr.md", sharedByGit: true };
const skill = { file: ".claude/skills/coverage/SKILL.md", context: "fork", allowedTools: ["Read", "Write"], argumentHint: "ticket id" };
const mainThreadSees = skill.context === "fork" ? "summary only" : "everything";
const needsId = "Which ticket id?";
const alwaysLoaded = { file: "./CLAUDE.md", steps: 40, evenFor: "Fix the comma in the title." };
return { command, skill, mainThreadSees, needsId, alwaysLoaded };
`),
    "3.3": program(`
const asked = "Edit the checkout button test.";
const rule = { paths: "**/*.test.tsx", text: "Use Testing Library. No snapshots for stateful components." };
const editing = "src/components/Button.test.tsx";
const also = "src/billing/invoice.test.tsx";
const css = "src/components/Button.module.css";
const ruleLoaded = editing.endsWith(".test.tsx");
const alsoLoaded = also.endsWith(".test.tsx");
const cssLoadsIt = css.endsWith(".test.tsx");
const folderRule = { file: "/tests/CLAUDE.md", sees: editing, loaded: false };
return { rule, editing, also, ruleLoaded, alsoLoaded, css, cssLoadsIt, folderRule };
`),
    "3.4": program(`
const asked = "Migrate the billing dates. There are two ways to do it and the design is still open.";
const migration = { files: 45, design: "two options still open" };
const mode = "plan";
const bug = { file: "src/billing/date.ts", cause: "the stack trace names the line" };
const bugMode = "execute";
const unmapped = { edited: "src/billing/date.ts", knownFiles: 0, revert: true };
return { migration, mode, bug, bugMode, unmapped };
`),
    "3.5": program(`
const asked = "Format this refund log line.";
let prompt = "Be careful with nulls. Format the log nicely.";
let outputs = ["INFO | 2026-03-03 | refund", "2026-03-03 INFO refund"];
let sameShape = outputs.filter((item, index) => outputs.indexOf(item) === index).length === 1;
prompt = [
  'in: "2026-03-03 INFO refund 10091"',
  'out: "2026-03-03 | INFO | refund 10091"',
  'in: "INFO refund 10091"',
  'out: "— | INFO | refund 10091"'
].join("\\n");
outputs = ["2026-03-09 | ERROR | payment timeout"];
sameShape = outputs.filter((item, index) => outputs.indexOf(item) === index).length === 1;
const failures = ['assert format("") == "— | — | —"', 'got " |  | "'];
prompt = prompt + "\\n" + failures.join("\\n");
return { prompt, outputs, sameShape, failures };
`),
    "3.6": program(`
const asked = "Review this pull request. Nobody is here to answer questions.";
const flags = ["-p", "--output-format json", "--json-schema"];
const waitsForKeyboard = flags.indexOf("-p") < 0;
const stdout = { findings: [{ file: "src/billing/refund.ts", line: 40, severity: "high", summary: "amount is not checked" }] };
const reviewer = "new instance";
const prior = ["amount is not checked"];
const withoutFlag = { command: "claude", waits: "Which file should I review?", republished: 8 };
return { flags, waitsForKeyboard, stdout, reviewer, prior, withoutFlag };
`),
    "4.1": program(`
const asked = "Review src/billing/refund.ts. The comment says it never returns null.";
const criterion = "Flag a comment only when it contradicts the code.";
const comment = "never returns null";
const body = "return null";
const flagged = { file: "src/billing/refund.ts", severity: "high" };
const style = "trailing space omitted";
const naming = { falsePositives: "high", enabled: false };
const vague = { instruction: "Be conservative.", findings: ["extra comma", "rename this local variable"] };
return { criterion, comment, body, flagged, style, naming, vague };
`),
    "4.2": program(`
const asked = "Review src/billing/refund.ts. Show me the hard cases, not the obvious one ten times.";
const examples = [
  { case: "comment says never null, code returns null", decision: "flag", severity: "high" },
  { case: "claim without a source", decision: "flag", ask: "the url" },
  { case: "early return used across this repo", decision: "do not flag" }
];
const repeated = { copies: 10, case: "the obvious null comment" };
const wrong = "early return is a bug";
return { examples, repeated, wrong };
`),
    "4.3": program(`
const asked = "Extract invoice 10091. The page has no tax number.";
const schema = {
  type: "object",
  properties: {
    tax_id: { type: ["string", "null"] },
    kind: { enum: ["invoice", "unclear", "other"] },
    detail: { type: ["string", "null"] }
  }
};
const out = await client.messages.create({
  tools: [{ name: "extract_invoice", input_schema: schema }],
  tool_choice: { type: "tool", name: "extract_invoice" }
});
const shapeValid = out.stop_reason === "tool_use";
const taxId = out.content[0].input.tax_id;
const totalChecked = false;
return { schema, out, shapeValid, taxId, totalChecked };
`, {
      nullable: branch("s43null", [{ stop_reason: "tool_use", content: [{ type: "tool_use", name: "extract_invoice", input: { tax_id: null, kind: "invoice", total: 48.2, detail: null } }] }]),
      required: branch("s43required", [{ stop_reason: "tool_use", content: [{ type: "tool_use", name: "extract_invoice", input: { tax_id: "000000", kind: "invoice", total: 48.2 } }] }], `
const asked = "Extract invoice 10091. The page has no tax number.";
const schema = {
  type: "object",
  properties: { tax_id: { type: "string" } },
  required: ["tax_id"]
};
const out = await client.messages.create({
  tools: [{ name: "extract_invoice", input_schema: schema }],
  tool_choice: { type: "tool", name: "extract_invoice" }
});
const shapeValid = out.stop_reason === "tool_use";
const taxId = out.content[0].input.tax_id;
const lineItemsSum = 40;
const statedTotal = 48.2;
const totalChecked = false;
return { schema, out, shapeValid, taxId, lineItemsSum, statedTotal, totalChecked };
`)
    }),
    "4.4": program(`
const asked = "Read this invoice and give me the date and the tax.";
const documentText = "9 March 2026, total 48.20";
const first = { date: "9 March 2026", total: 48.2 };
const formatError = "date must be YYYY-MM-DD";
const date = "2026-03-09";
const calculated = 48.2;
const stated = 48.2;
const conflict = calculated !== stated;
const tax = null;
const inventedTax = 4.2;
return { documentText, first, formatError, date, calculated, stated, conflict, tax, inventedTax };
`),
    "4.5": program(`
const asked = "Extract 2,000 invoices overnight. Nobody is waiting until morning.";
const night = { waiting: false, count: 2000, sample: 20, api: "messages.batches.create" };
const failed = ["invoice-08810.pdf"];
const resent = failed.slice();
const resentAll = false;
const merge = { waiting: true, request: "search, then read, then comment", api: "messages.create" };
return { night, failed, resent, resentAll, merge };
`),
    "4.6": program(`
const asked = "Review the refund patch. You did not write it. One file at a time.";
const author = { remembersWritingIt: true, reviews: false };
const review = { instance: "new", file: "src/billing/refund.ts" };
const local = { file: "refund.ts", line: 40, summary: "amount unchecked", confidence: 0.4 };
const integration = "amount is a number on one side and a string on the other";
const route = local.confidence < 0.8 ? "human review" : "auto";
const sameSession = { files: 14, verdict: "Looks consistent.", missed: integration };
return { author, review, local, integration, route, sameSession };
`),
    "5.1": program(`
const asked = "After 30 turns, the customer asks again: how much was the refund?";
const caseFacts = { refund: "48.20 USD", order_id: "10091", promised: "2026-04-02" };
const summary = "The customer is upset about a refund.";
const order = { id: "10091", status: "issued", amount: "48.20 USD", date: "2026-03-03", promised: "2026-04-02", note: "extra", raw: "html" };
const kept = { order_id: order.id, status: order.status, amount: order.amount, date: order.date, promised: order.promised };
const reply = "The refund is 48.20 USD, promised by 2026-04-02.";
const vague = "The refund was about fifty dollars.";
return { caseFacts, summary, kept, reply, vague };
`),
    "5.2": program(`
const customer = "Transfer me to a person.";
const askedHuman = /person|human/.test(customer);
const handoff = askedHuman ? { reason: "customer asked for a person", order: "10091" } : null;
const ask = "Match the competitor price of 40 USD.";
const policy = "price adjustments on our own site only";
const covers = ask.indexOf("competitor") < 0;
const policyHandoff = covers ? null : { reason: "policy does not cover competitor matching" };
const matches = ["ana@a.example", "ana@b.example"];
const picked = null;
const password = { angry: true, action: "reset the password" };
const inventedRule = false;
return { customer, askedHuman, handoff, ask, policy, covers, policyHandoff, matches, picked, password, inventedRule };
`),
    "5.3": program(`
const asked = "Write the report on remote work in 2024. Include the academic papers.";
const query = "remote work 2024";
const attempts = ["timeout", "timeout"];
const toCoordinator = {
  failure: "timeout",
  query: query,
  partial: ["paper A", "paper B", "paper C"],
  alternative: "company reports index"
};
const cancelledOthers = false;
const hidden = { isError: false, value: [], report: "No research exists on this topic." };
return { query, attempts, toCoordinator, cancelledOthers, hidden };
`),
    "5.4": program(`
const asked = "Where is billing state stored? I asked an hour ago and the chat is huge.";
const scratch = { store: "src/billing/store.ts", refund: "processRefund" };
const tests = ["refund.test.ts", "routes.test.ts"];
const manifest = { agent: "explorer", state: { store: scratch.store, tests: tests.length } };
const resumed = manifest;
const restartedFromZero = false;
const onlyInChat = "In a typical React app this would use Redux.";
return { scratch, tests, manifest, resumed, restartedFromZero, onlyInChat };
`),
    "5.5": program(`
const asked = "Can we stop reviewing vendor B? Overall accuracy is 97%.";
const overall = 0.97;
const byType = { "vendor B invoices": 0.7 };
const rows = [
  { id: "10091", confidence: 0.42, sourcesConflict: false },
  { id: "10088", confidence: 0.9, sourcesConflict: true },
  { id: "receipt", confidence: 0.93, sourcesConflict: false }
];
const threshold = 0.8;
const queue = rows.filter((row) => row.confidence < threshold || row.sourcesConflict);
const globalLooksFine = overall > 0.95;
const reviewStaysOn = true;
return { overall, byType, threshold, queue, globalLooksFine, reviewStaysOn };
`),
    "5.6": program(`
const asked = "What is the price per box, and what is the return window?";
const sources = [
  { value: "12 USD per box", date: "2026-03-01", url: "Catalog 2026, table 2" },
  { value: "9 USD per box", date: "2022-11-01", url: "Market report 2022, page 4" }
];
const report = { metric: "price per box", values: sources, pickedSilently: null, note: "different years, not the same moment" };
const question = "What is the return window?";
const missing = "Not in the sources.";
const filledFromMemory = false;
const silent = { text: "The price is 12 USD.", dropped: "9 USD per box" };
const invented = "The return window is 30 days.";
return { sources, report, question, missing, filledFromMemory, silent, invented };
`),
  };
})();
