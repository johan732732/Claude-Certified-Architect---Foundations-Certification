(function () {
  const C = window.CCARF;
  const app = document.getElementById("app");
  const STORE = "ccarf-study-v1";
  const LIVE = "ccarf-live-v1";

  const LANG_KEY = "ccarf-lang";
  let lang = loadLang();

  function loadLang() {
    try {
      const saved = localStorage.getItem(LANG_KEY);
      if (saved === "en" || saved === "es") return saved;
    } catch (error) {
      return "es";
    }
    return String(navigator.language || "").toLowerCase().startsWith("en") ? "en" : "es";
  }

  function pack() {
    return (C && C.ui && (C.ui[lang] || C.ui.es)) || {};
  }

  function t(key, vars) {
    const current = pack();
    const fallback = (C && C.ui && C.ui.es) || {};
    let text = current[key] != null ? current[key] : (fallback[key] != null ? fallback[key] : key);
    if (vars) {
      Object.keys(vars).forEach((name) => {
        text = String(text).split("{" + name + "}").join(vars[name]);
      });
    }
    return text;
  }

  function tx(value) {
    if (lang !== "en" || typeof value !== "string") return value;
    const dict = C && C.en;
    if (dict && Object.prototype.hasOwnProperty.call(dict, value)) return dict[value];
    return value;
  }

  function raw(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
  }

  function tt(key, vars) {
    return raw(t(key, vars));
  }

  if (!C || !C.lessons || !C.questions || !C.ui) {
    app.textContent = t("loadError");
    return;
  }

  const state = loadState();
  let live = loadLive();
  let ui = { q: "", deck: "due", practiceDomain: "all", practiceCount: "10", practiceMode: "study" };
  let cardBack = false;
  let cardQueue = [];
  let pair = null;
  let timerHandle = 0;

  function loadState() {
    try {
      return Object.assign(
        { lessons: {}, cards: {}, checklist: {}, history: [], misses: {}, notes: {} },
        JSON.parse(localStorage.getItem(STORE) || "{}")
      );
    } catch (error) {
      return { lessons: {}, cards: {}, checklist: {}, history: [], misses: {}, notes: {} };
    }
  }

  function saveState() {
    localStorage.setItem(STORE, JSON.stringify(state));
  }

  function loadLive() {
    try {
      return JSON.parse(sessionStorage.getItem(LIVE) || "null");
    } catch (error) {
      return null;
    }
  }

  function saveLive() {
    if (live) sessionStorage.setItem(LIVE, JSON.stringify(live));
    else sessionStorage.removeItem(LIVE);
  }

  function esc(value) {
    return raw(tx(value));
  }

  function domain(id) {
    return C.domains.find((item) => item.id === id);
  }

  function lesson(id) {
    return C.lessons.find((item) => item.id === id);
  }

  function question(id) {
    return C.questions.find((item) => item.id === id);
  }

  function shuffle(list) {
    const copy = list.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const swap = copy[i];
      copy[i] = copy[j];
      copy[j] = swap;
    }
    return copy;
  }

  function todayKey(date) {
    const value = date || new Date();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return value.getFullYear() + "-" + month + "-" + day;
  }

  function addDays(days) {
    const value = new Date();
    value.setDate(value.getDate() + days);
    return todayKey(value);
  }

  function parseRoute() {
    const parts = (location.hash.replace(/^#/, "") || "/").split("/").filter(Boolean);
    return { name: parts[0] || "inicio", arg: parts[1] ? decodeURIComponent(parts[1]) : "" };
  }

  function go(hash) {
    location.hash = hash;
  }

  function allCards() {
    const distinctions = C.distinctions.map((row, index) => ({
      id: "dist-" + index,
      lesson: "",
      domain: "",
      front: tx(row[0]) + "  vs  " + tx(row[1]),
      back: tx(row[2]),
    }));
    return C.cards.concat(distinctions);
  }

  function cardDue(card) {
    const record = state.cards[card.id];
    if (!record) return true;
    return record.due <= todayKey();
  }

  function dueCount() {
    return allCards().filter(cardDue).length;
  }

  function readCount() {
    return C.lessons.filter((item) => state.lessons[item.id]).length;
  }

  function sectionPlan() {
    return [
      ["que", t("secWhatShort"), t("secWhat"), 2],
      ["flujo", t("secFlowShort"), t("secFlow"), 2],
      ["reglas", t("secRulesShort"), t("secRules"), 4],
      ["caso", t("secCaseShort"), t("secCase"), 1],
      ["check", t("secCheckShort"), t("secCheck"), 2],
    ];
  }

  function sectionMinutes(total) {
    const plan = sectionPlan();
    const weights = plan.map((row) => row[3]);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const exact = weights.map((weight) => (total * weight) / weightSum);
    const minutes = exact.map((value) => Math.floor(value));
    let left = total - minutes.reduce((sum, value) => sum + value, 0);
    const order = exact
      .map((value, index) => ({ index: index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac || a.index - b.index);
    for (let index = 0; index < left; index += 1) minutes[order[index].index] += 1;
    return plan.map((row, index) => ({
      key: row[0],
      short: row[1],
      title: row[2],
      minutes: minutes[index],
    }));
  }

  function formatStudy(minutes) {
    const amount = Math.max(0, Math.round(minutes));
    if (amount < 60) return amount + "\u00a0min";
    const hours = Math.floor(amount / 60);
    const rest = amount % 60;
    return rest ? hours + "\u00a0h " + rest + "\u00a0min" : hours + "\u00a0h";
  }

  function studyPace() {
    const total = C.lessons.reduce((sum, item) => sum + item.minutes, 0);
    const done = C.lessons.reduce((sum, item) => sum + (state.lessons[item.id] ? item.minutes : 0), 0);
    return { total: total, done: done, left: total - done };
  }

  function paceBox(pace) {
    return '<section class="pace"><p class="kicker">' + tt("paceKicker") + '</p><div class="pace-nums"><div><b>' +
      formatStudy(pace.done) + '</b><span>' + tt("paceDone") + '</span></div><div><b>' +
      formatStudy(pace.left) + '</b><span>' + tt("paceLeft") + '</span></div><div><b>' +
      formatStudy(pace.total) + '</b><span>' + tt("paceTotal") + '</span></div></div><p class="small muted">' +
      tt("paceNote", { done: readCount(), total: C.lessons.length }) + "</p></section>";
  }

  function stepTitle(index, section) {
    return '<h3 class="step-title"><span>' + index + "</span>" + esc(section.title) + "<em>" + section.minutes + " min</em></h3>";
  }

  function nextLesson() {
    return C.lessons.find((item) => !state.lessons[item.id]) || C.lessons[0];
  }

  function grade(q, selected) {
    const want = (q.answer || []).slice().sort().join(",");
    const got = (selected || []).slice().sort().join(",");
    return want === got && want.length > 0;
  }

  const MISS_STEPS = [1, 3, 7];
  const CONFIDENCE = [["se", "confKnow"], ["creo", "confBelieve"], ["adivino", "confGuess"]];

  function rememberNote(questionId, text) {
    const clean = String(text || "").trim();
    if (!clean) return;
    if (!state.notes) state.notes = {};
    state.notes[questionId] = clean.slice(0, 600);
  }

  function advanceMiss(row) {
    if (!row || row.resolved) return;
    const step = row.step || 0;
    if (step >= MISS_STEPS.length) {
      row.resolved = true;
      row.last = new Date().toISOString();
      return;
    }
    row.due = addDays(MISS_STEPS[step]);
    row.step = step + 1;
    row.reason = "review";
    row.last = new Date().toISOString();
  }

  // A wrong answer comes back today, then after 1, 3 and 7 days.
  // A correct guess stays pending and comes back tomorrow.
  function recordAnswer(questionId, selected, confidence) {
    const q = question(questionId);
    if (!q || !selected || !selected.length) return;
    const known = state.misses[questionId];
    const active = known && !known.resolved ? known : null;
    if (grade(q, selected) && confidence !== "adivino") {
      advanceMiss(active);
      return;
    }
    if (grade(q, selected)) {
      state.misses[questionId] = {
        lesson: q.lesson,
        wrong: known ? known.wrong : 0,
        last: new Date().toISOString(),
        resolved: false,
        step: active ? active.step || 0 : 0,
        due: addDays(1),
        reason: "guess",
      };
      return;
    }
    state.misses[questionId] = {
      lesson: q.lesson,
      wrong: (known ? known.wrong : 0) + 1,
      last: new Date().toISOString(),
      resolved: false,
      step: 0,
      due: todayKey(),
      reason: "wrong",
    };
  }

  function pendingMisses() {
    return Object.keys(state.misses).filter((id) => !state.misses[id].resolved && question(id));
  }

  function dueMisses() {
    return pendingMisses().filter((id) => {
      const due = state.misses[id].due;
      return !due || due <= todayKey();
    });
  }

  function missBadgeHtml() {
    const due = dueMisses().length;
    const pending = pendingMisses().length;
    if (due) return ' <span class="count">' + due + "</span>";
    if (pending) return ' <span class="count later">' + pending + "</span>";
    return "";
  }

  function formatDay(key) {
    if (!key || key <= todayKey()) return t("today");
    const parts = key.split("-");
    const months = pack().months || [];
    return Number(parts[2]) + " " + months[Number(parts[1]) - 1];
  }

  function missPace(row) {
    if (row.due && row.due > todayKey()) return t("missFuture", { day: formatDay(row.due) });
    const step = row.step || 0;
    if (step >= MISS_STEPS.length) return t("missLast");
    const days = MISS_STEPS[step];
    return t("missNext", { when: t(days === 1 ? "dayOne" : "dayMany", { n: days }) });
  }

  function missStatus(row) {
    if (row.reason === "guess" && !row.wrong) return t("missGuess");
    const times = row.wrong || 1;
    return t(times === 1 ? "missWrongOne" : "missWrongMany", { n: times });
  }

  function confidenceControls(selected, act, questionId) {
    const extra = questionId ? ' data-q="' + questionId + '"' : "";
    const chips = CONFIDENCE.map(([id, label]) => '<button type="button" class="chip' + (selected === id ? " active" : "") + '" data-act="' + act + '" data-level="' + id + '"' + extra + ">" + tt(label) + "</button>").join("");
    return '<div class="conf"><p class="small muted">' + tt("confPrompt") + '</p><div class="row">' + chips + "</div></div>";
  }

  function whyField(value, attrs, prompt, placeholder) {
    return '<label class="why"><span class="small muted">' + raw(prompt || t("whyPrompt")) + '</span><textarea rows="3" ' + attrs + ' placeholder="' + raw(placeholder || t("whyPlaceholder")) + '">' + raw(value || "") + "</textarea></label>";
  }

  function byLessonOrder(a, b) {
    const order = (id) => C.lessons.findIndex((item) => item.id === question(id).lesson);
    return order(a) - order(b) || state.misses[b].wrong - state.misses[a].wrong;
  }

  function scoreLive() {
    const byDomain = {};
    C.domains.forEach((item) => {
      byDomain[item.id] = { correct: 0, total: 0 };
    });
    let correct = 0;
    live.questionIds.forEach((id) => {
      const q = question(id);
      if (!q) return;
      byDomain[q.domain].total += 1;
      if (grade(q, live.answers[id])) {
        correct += 1;
        byDomain[q.domain].correct += 1;
      }
    });
    return { correct, total: live.questionIds.length, byDomain };
  }

  function advice(percent, byDomain) {
    const weak = C.domains
      .filter((item) => byDomain[item.id].total > 0)
      .map((item) => ({
        item,
        pct: Math.round((100 * byDomain[item.id].correct) / byDomain[item.id].total),
      }))
      .filter((row) => row.pct < 75)
      .sort((a, b) => a.pct - b.pct);
    if (percent >= 85 && weak.length === 0) return t("adviceHigh");
    if (percent >= 70) {
      const names = weak.map((row) => row.item.name).join(", ");
      return names ? t("adviceMid", { names: names }) : t("adviceMidOk");
    }
    return t("adviceLow");
  }

  function finishLive() {
    if (!live || live.finished) return;
    const result = scoreLive();
    const confidence = live.confidence || {};
    const notes = live.notes || {};
    live.questionIds.forEach((id) => {
      recordAnswer(id, live.answers[id], confidence[id]);
      rememberNote(id, notes[id]);
    });
    const record = {
      id: "r" + Date.now(),
      at: new Date().toISOString(),
      kind: live.kind,
      mode: live.mode,
      questionIds: live.questionIds,
      answers: live.answers,
      confidence,
      notes,
      correct: result.correct,
      total: result.total,
      byDomain: result.byDomain,
    };
    state.history.unshift(record);
    state.history = state.history.slice(0, 30);
    saveState();
    live = null;
    saveLive();
    clearInterval(timerHandle);
    go("/resultado/" + record.id);
  }

  function armTimer() {
    clearInterval(timerHandle);
    if (!live || !live.deadline) return;
    timerHandle = setInterval(() => {
      const node = document.querySelector("[data-timer]");
      if (!live || !node) return;
      const left = live.deadline - Date.now();
      if (left <= 0) {
        finishLive();
        return;
      }
      node.textContent = formatLeft(left);
      node.classList.toggle("low", left < 10 * 60 * 1000);
    }, 500);
  }

  function formatLeft(ms) {
    const total = Math.max(0, Math.ceil(ms / 1000));
    const minutes = String(Math.floor(total / 60)).padStart(2, "0");
    const seconds = String(total % 60).padStart(2, "0");
    return minutes + ":" + seconds;
  }

  function startQuiz(kind, ids, mode, minutes) {
    live = {
      kind,
      mode,
      questionIds: ids,
      index: 0,
      answers: {},
      confidence: {},
      notes: {},
      flags: {},
      startedAt: Date.now(),
      deadline: minutes ? Date.now() + minutes * 60 * 1000 : 0,
      picked: [],
    };
    saveLive();
    go(kind === "mock" ? "/simulacro/examen" : "/practica/examen");
  }

  function buildMockIds() {
    const ids = [];
    C.domains.forEach((item) => {
      const pool = shuffle(C.questions.filter((q) => q.domain === item.id));
      pool.slice(0, item.mock).forEach((q) => ids.push(q.id));
    });
    return shuffle(ids);
  }

  function currentQuestion() {
    if (!live) return null;
    return question(live.questionIds[live.index]);
  }

  function shell(title, body, wide) {
    const route = parseRoute();
    const links = [
      ["inicio", tt("navHome")],
      ["ruta", tt("navPath")],
      ["mapa", tt("navMap")],
      ["tarjetas", tt("navCards")],
      ["practica", tt("navPractice")],
      ["fallos", tt("navMisses") + missBadgeHtml()],
      ["simulacro", tt("navMock")],
      ["escenarios", tt("navScenarios")],
    ];
    const nav = links.map(([id, label]) => {
      const active = route.name === id ? " active" : "";
      return '<a class="' + active.trim() + '" href="#/' + id + '">' + label + "</a>";
    }).join("");
    const langSwitch = '<div class="lang-switch" role="group" aria-label="' + tt("langLabel") + '">' +
      '<button type="button" class="chip' + (lang === "es" ? " active" : "") + '" data-act="lang" data-lang="es">ES</button>' +
      '<button type="button" class="chip' + (lang === "en" ? " active" : "") + '" data-act="lang" data-lang="en">EN</button></div>';
    document.documentElement.lang = lang;
    document.title = t("docTitle");
    app.innerHTML =
      '<div class="shell"><header class="topbar"><a class="brand" href="#/inicio"><strong>CCAR-F</strong><span>Architect Foundations</span></a><nav class="nav">' +
      nav +
      '</nav><div class="top-tools">' + langSwitch + '<div class="progress-pill">' +
      tt("progressPill", { read: readCount(), due: dueCount() }) +
      '</div></div></header><main class="page' +
      (wide ? "" : " narrow") +
      '">' +
      body +
      '<footer class="site-foot"><p>' + tt("repoNote") + '</p><p><a href="https://github.com/johan732732/Claude-Certified-Architect---Foundations-Certification"><svg class="gh-mark" viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"/></svg>' + tt("repoLink") + "</a></p></footer></main></div>";
    const box = app.querySelector(".search");
    if (box && ui.q) {
      box.focus();
      box.setSelectionRange(ui.q.length, ui.q.length);
    }
    armTimer();
  }

  function domainStripe(id) {
    return "var(--" + (id || "d1") + ")";
  }

  function renderHome() {
    const next = nextLesson();
    const last = state.history[0];
    const resume = live
      ? '<p class="callout"><strong>' + tt("resumeStrong") + '</strong> <a href="#/' + (live.kind === "mock" ? "simulacro/examen" : "practica/examen") + '">' + tt("resumeLink", { n: live.index + 1 }) + "</a></p>"
      : "";
    const pace = studyPace();
    const domains = C.domains.map((item) => {
      const lessons = C.lessons.filter((row) => row.domain === item.id);
      const done = lessons.filter((row) => state.lessons[row.id]).length;
      const left = lessons.reduce((sum, row) => sum + (state.lessons[row.id] ? 0 : row.minutes), 0);
      return (
        '<a class="card domain-card" href="#/ruta/' + item.id + '"><i style="background:' + domainStripe(item.id) + '"></i><div class="kicker">' +
        tt("domainKicker", { n: item.n, weight: item.weight }) + '</div><div class="weight">' + done + '<span class="small muted">/' + lessons.length + '</span></div><h3>' +
        esc(item.name) + '</h3><p class="small muted">' + tt(left ? "lessonsOpen" : "lessonsReady", { done: done, total: lessons.length, time: formatStudy(left) }) + " · " +
        esc(item.blurb) + "</p></a>"
      );
    }).join("");
    const pieces = C.fourPieces.map((row) => "<tr><th>" + esc(row[0]) + "</th><td>" + esc(row[1]) + "</td></tr>").join("");
    const lastBlock = last
      ? "<p>" + tt("lastSet", { score: last.correct + "/" + last.total, percent: Math.round((100 * last.correct) / last.total) }) + ' <a href="#/resultado/' + last.id + '">' + tt("seeResult") + "</a></p>"
      : '<p class="muted">' + tt("noSet") + "</p>";
    const how = (pack().howSteps || []).map((step) => "<li>" + raw(step) + "</li>").join("");
    shell(
      t("navHome"),
      '<p class="kicker">' + tt("homeKicker") + "</p><h1>" + tt("homeTitle") + '</h1><p class="lede">' + tt("homeLede") + '</p><div class="row" style="margin:18px 0"><a class="btn" href="#/leccion/' +
        next.id + '">' + tt("continueBtn", { id: next.id, title: tx(next.title) }) + '</a><a class="btn secondary" href="#/tarjetas">' + tt("todayCards") + '</a><a class="btn secondary" href="#/simulacro">' + tt("openMock") + "</a></div>" +
        paceBox(pace) + '<div class="grid domains">' +
        domains +
        '</div><div class="grid two"><section class="panel"><h2>' + tt("fourTitle") + '</h2><p class="muted">' + tt("fourNote") + "</p><table>" +
        pieces +
        '</table><p class="small" style="margin-top:12px"><a href="#/distinciones">' + tt("linkDist", { n: C.distinctions.length }) + '</a> · <a href="#/pares">' + tt("linkPairs") + '</a> · <a href="#/glosario">' + tt("linkGlossary") + '</a> · <a href="#/logistica">' + tt("linkLogistics") + '</a> · <a href="#/fuera">' + tt("linkOut") + '</a></p></section><section class="panel"><h2>' + tt("howTitle") + "</h2><ol>" + how + "</ol>" +
        resume + lastBlock +
        '<p class="small muted">' + tt("disclaimer") + "</p></section></div>",
      true
    );
  }

  function renderPath() {
    const route = parseRoute();
    const query = ui.q.trim().toLowerCase();
    const groups = C.domains
      .filter((item) => !route.arg || item.id === route.arg)
      .map((item) => {
        const lessons = C.lessons.filter((row) => {
          if (row.domain !== item.id) return false;
          if (!query) return true;
          return (row.id + " " + row.title + " " + tx(row.title)).toLowerCase().includes(query);
        });
        if (!lessons.length) return "";
        const domainLessons = C.lessons.filter((row) => row.domain === item.id);
        const domainLeft = domainLessons.reduce((sum, row) => sum + (state.lessons[row.id] ? 0 : row.minutes), 0);
        const rows = lessons.map((row) => {
          const on = state.lessons[row.id] ? " on" : "";
          return '<a class="lesson-link" href="#/leccion/' + row.id + '"><span class="id">' + esc(row.id) + '</span><span><strong>' + esc(row.title) + '</strong><br><span class="small muted">' + tt("minutes", { n: row.minutes }) + '</span></span><span class="done-dot' + on + '"></span></a>';
        }).join("");
        return '<section style="margin:22px 0"><p class="kicker">' + tt(domainLeft ? "domainOpen" : "domainReady", { n: item.n, weight: item.weight, time: formatStudy(domainLeft) }) + '</p><h2>' + esc(item.name) + '</h2><p class="muted">' + esc(item.blurb) + '</p><div class="lesson-list">' + rows + "</div></section>";
      }).join("");
    shell(
      "Ruta",
      '<p class="kicker">' + tt("pathKicker", { count: C.lessons.length, total: formatStudy(studyPace().total), left: formatStudy(studyPace().left) }) + '</p><h1>' + tt("pathTitle") + '</h1><input class="search" placeholder="' + tt("searchLesson") + '" value="' + raw(ui.q) + '">' +
        '<div class="row" style="margin:12px 0">' +
        '<a class="chip' + (route.arg ? "" : " active") + '" href="#/ruta">' + tt("allChip") + "</a>" +
        C.domains.map((item) => '<a class="chip' + (route.arg === item.id ? " active" : "") + '" href="#/ruta/' + item.id + '">' + item.n + "</a>").join("") +
        "</div>" + groups,
      true
    );
  }

  function diagramNode(node) {
    if (!node) return "";
    const tone = node.tone ? " " + node.tone : "";
    return '<div class="d-node' + tone + '"><strong>' + esc(node.label) + "</strong>" +
      (node.note ? "<span>" + esc(node.note) + "</span>" : "") + "</div>";
  }

  function renderProgram(diagram) {
    let stepNumber = 0;
    const items = diagram.steps.map((step) => {
      if (step.kind === "ask") {
        const paths = (step.paths || []).map((path) => {
          const follow = path.continues
            ? '<em class="d-follows">' + tt("follows") + "</em>"
            : (path.end ? '<em class="d-follows">' + tt("branchEnds") + "</em>" : "");
          return '<div class="d-path ' + esc(path.tone || "") + '" data-act="path-reveal"><b>' + esc(path.when) + '</b><div class="d-out"><span>' + esc(path.next) + "</span>" + follow + '</div><small class="d-hidden">' + tt("tapPath") + "</small></div>";
        }).join("");
        return '<li class="d-ask"><i>?</i><div><strong>' + esc(step.q) + "</strong>" +
          (step.note ? "<em>" + esc(step.note) + "</em>" : "") +
          '<div class="d-paths">' + paths + "</div></div></li>";
      }
      if (step.kind === "back") {
        return '<li class="d-back"><i>↻</i><div><strong>' + esc(step.label) + "</strong>" +
          (step.note ? "<span>" + esc(step.note) + "</span>" : "") + "</div></li>";
      }
      stepNumber += 1;
      return '<li class="d-do"><i>' + stepNumber + "</i><div><strong>" + esc(step.label) + "</strong>" +
        (step.code ? "<code>" + esc(step.code) + "</code>" : "") +
        (step.note ? "<span>" + esc(step.note) + "</span>" : "") + "</div></li>";
    }).join("");
    return '<ol class="d-program">' + items + "</ol>";
  }

  function renderDiagram(diagram) {
    const arrow = '<span class="d-arrow" aria-hidden="true"></span>';
    let body = "";
    if (diagram.layout === "program") {
      body = renderProgram(diagram);
    } else if (diagram.layout === "flow") {
      body = '<div class="d-flow">' + diagram.steps.map(diagramNode).join(arrow) + "</div>";
      if (diagram.loop) body += '<p class="d-loop">' + esc(diagram.loop) + "</p>";
    } else if (diagram.layout === "split") {
      body = '<div class="d-split">' + diagramNode(diagram.root) +
        '<span class="d-arrow down" aria-hidden="true"></span>' +
        '<div class="d-branches">' + diagram.branches.map(diagramNode).join("") + "</div></div>";
    } else if (diagram.layout === "hub") {
      body = '<div class="d-hub">' + diagramNode(diagram.center) +
        '<div class="d-spokes">' + diagram.spokes.map(diagramNode).join("") + "</div></div>";
    } else if (diagram.layout === "stack") {
      body = '<div class="d-stack">' + diagram.layers.map(diagramNode).join(arrow) + "</div>";
    } else if (diagram.layout === "columns") {
      body = '<div class="d-columns">' + diagram.columns.map((column) => {
        const items = (column.items || []).map((item) => "<li>" + esc(item) + "</li>").join("");
        return '<section class="d-col ' + esc(column.tone || "") + '"><h4>' + esc(column.title) + "</h4><ul>" + items + "</ul></section>";
      }).join("") + "</div>";
    }
    const test = diagram.layout === "program"
      ? '<button class="btn secondary d-test" data-act="diagram-test">' + tt("testMe") + "</button>"
      : "";
    return '<figure class="diagram"><div class="spread"><figcaption>' + esc(diagram.title) + "</figcaption>" + test + "</div>" +
      (test ? '<p class="d-help">' + tt("diagramHelp") + "</p>" : "") + body +
      (diagram.caption ? '<p class="d-caption">' + esc(diagram.caption) + "</p>" : "") + "</figure>";
  }

  function traceParts(trace) {
    const good = (trace.good && trace.good.steps) || [];
    const bad = (trace.bad && trace.bad.steps) || [];
    const firstBack = good.findIndex((step) => step.dir === "back");
    let cut = Number.isInteger(trace.askAfter) ? trace.askAfter : firstBack;
    if (cut < 0) cut = 0;
    if (cut >= good.length) cut = Math.max(good.length - 1, 0);
    const opening = good.slice(0, cut + 1);
    return {
      opening: opening.length ? opening : good.slice(0, 1),
      rest: good.slice(cut + 1),
      bad: bad,
    };
  }

  function flowState(lessonId) {
    if (!ui.flow || ui.flow.lesson !== lessonId) {
      ui.flow = { lesson: lessonId, seen: 1, branch: null, seenBranch: 0 };
    }
    return ui.flow;
  }

  function flowLines(value, max) {
    const words = String(tx(value) || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const next = line ? line + " " + word : word;
      if (next.length > max && line) {
        lines.push(line);
        line = word;
      } else line = next;
    });
    if (line) lines.push(line);
    return lines;
  }

  function flowClip(lines, maxLines) {
    if (lines.length <= maxLines) return lines;
    const cut = lines.slice(0, maxLines);
    cut[maxLines - 1] = cut[maxLines - 1].replace(/[.…]+$/, "") + "…";
    return cut;
  }

  function flowEdge(d, state, tone) {
    const toneCls = tone && state !== "future" ? " e-" + tone : "";
    const stateCls = state === "now" ? " e-now" : state === "past" ? " e-past" : "";
    return '<path class="e' + stateCls + toneCls + '" d="' + d + '" marker-end="url(#fc-head)"/>';
  }

  function flowLabelKey(step) {
    if (step.dir === "send" || step.dir === "back") return "trace_" + (step.via || "run") + "_" + step.dir;
    return "trace_" + step.dir;
  }

  function flowNode(x, y, w, h, label, mode, dir) {
    const rx = dir === "stop" || dir === "fail" ? h / 2 : 6;
    const tight = String(label).length > 18 ? " n-tight" : "";
    return '<g class="n n-' + mode + " n-" + dir + tight + '"><rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="' + rx + '"/>' +
      '<text x="' + (x + w / 2) + '" y="' + (y + h / 2) + '" text-anchor="middle" dominant-baseline="central">' + raw(label) + "</text></g>";
  }

  function flowLabel(x, y, w, h, lines, branch, atAsk, selected) {
    const act = atAsk ? ' data-act="flow-branch" data-branch="' + branch + '"' : "";
    const text = lines.map((line, index) => {
      const ty = y + 8 + index * 14 + 7;
      return '<text x="' + (x + w / 2) + '" y="' + ty + '" text-anchor="middle" dominant-baseline="central">' + raw(line) + "</text>";
    }).join("");
    return '<g class="fc-label ' + branch + (selected ? " on" : "") + (atAsk ? "" : " off") + '"' + act + ">" +
      '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + h + '" rx="8"/>' + text + "</g>";
  }

  function renderTrace(trace, lessonId) {
    const flow = flowState(lessonId);
    const parts = traceParts(trace);
    const openingLen = Math.max(parts.opening.length, 1);
    if (flow.seen > openingLen + 1) flow.seen = openingLen + 1;
    if (flow.seen < 1) flow.seen = 1;
    const atAsk = flow.seen > openingLen;
    const branchSteps = flow.branch === "bad" ? parts.bad : flow.branch === "good" ? parts.rest : [];
    if (flow.branch && flow.seenBranch < 1) flow.seenBranch = 1;
    if (flow.branch && flow.seenBranch > branchSteps.length) flow.seenBranch = Math.max(branchSteps.length, 1);

    const NW = 188;
    const NH = 40;
    const DW = 210;
    const DH = 118;
    const GAP = 28;
    const COL = 228;
    const cx = 12 + COL + NW / 2;
    const width = cx + COL + NW / 2 + 12;
    const lx = cx - COL;
    const rx = cx + COL;

    const openingMode = (index) => {
      if (index < flow.seen - 1) return "past";
      if (index === flow.seen - 1 && !atAsk) return "now";
      if (index < openingLen && atAsk) return "past";
      return "future";
    };
    const stepMode = (branch, index) => {
      if (flow.branch !== branch) return "future";
      if (index < flow.seenBranch - 1) return "past";
      if (index === flow.seenBranch - 1) return "now";
      return "future";
    };
    const exitState = (branch) => {
      if (!atAsk) return "future";
      if (!flow.branch) return "now";
      return flow.branch === branch ? "past" : "future";
    };

    let y = 14;
    const shapes = [];
    const edges = [];
    parts.opening.forEach((step, index) => {
      const mode = openingMode(index);
      shapes.push(flowNode(cx - NW / 2, y, NW, NH, t(flowLabelKey(step)), mode, step.dir));
      if (index) edges.push(flowEdge("M " + cx + " " + (y - GAP) + " L " + cx + " " + y, mode, ""));
      y += NH + GAP;
    });

    const diamondTop = y;
    const cy = diamondTop + DH / 2;
    const diamondMode = !atAsk ? "future" : flow.branch ? "past" : "now";
    if (parts.opening.length) {
      edges.push(flowEdge("M " + cx + " " + (diamondTop - GAP) + " L " + cx + " " + diamondTop, diamondMode, ""));
    }
    const forkLines = flowClip(flowLines(trace.fork || t("flowAsk"), 16), 4);
    const forkText = forkLines.map((line, index) => {
      const start = cy - ((forkLines.length - 1) * 14) / 2;
      return '<text x="' + cx + '" y="' + (start + index * 14) + '" text-anchor="middle" dominant-baseline="central">' + raw(line) + "</text>";
    }).join("");
    const diamond = '<g class="n n-' + diamondMode + ' n-ask"><polygon points="' +
      [cx, diamondTop, cx + DW / 2, cy, cx, diamondTop + DH, cx - DW / 2, cy].join(",") +
      '"/>' + forkText + "</g>";
    y = diamondTop + DH + GAP;

    const goodLines = flowClip(flowLines(atAsk ? (trace.goodWhen || t("traceGood")) : t("flowExit"), 22), 4);
    const badLines = flowClip(flowLines(atAsk ? (trace.badWhen || t("traceBad")) : t("flowExit"), 22), 4);
    const labelH = Math.max(40, 12 + Math.max(goodLines.length, badLines.length) * 14);
    const labelY = y;
    edges.push(flowEdge("M " + (cx - DW / 2) + " " + cy + " L " + lx + " " + cy + " L " + lx + " " + labelY, exitState("good"), "good"));
    edges.push(flowEdge("M " + (cx + DW / 2) + " " + cy + " L " + rx + " " + cy + " L " + rx + " " + labelY, exitState("bad"), "bad"));
    shapes.push(flowLabel(lx - NW / 2, labelY, NW, labelH, goodLines, "good", atAsk, flow.branch === "good"));
    shapes.push(flowLabel(rx - NW / 2, labelY, NW, labelH, badLines, "bad", atAsk, flow.branch === "bad"));
    y += labelH + GAP;

    const drawBranch = (branch, steps, center) => {
      steps.forEach((step, index) => {
        const mode = stepMode(branch, index);
        const top = y + index * (NH + GAP);
        shapes.push(flowNode(center - NW / 2, top, NW, NH, t(flowLabelKey(step)), mode, step.dir));
        const fromY = index ? top - GAP : labelY + labelH;
        edges.push(flowEdge("M " + center + " " + fromY + " L " + center + " " + top, mode, branch));
      });
    };
    drawBranch("good", parts.rest, lx);
    drawBranch("bad", parts.bad, rx);
    const rows = Math.max(parts.rest.length, parts.bad.length, 0);
    const height = (rows ? y + rows * (NH + GAP) - GAP : y) + 16;

    const ask = atAsk && !flow.branch;
    let panel;
    if (ask) {
      panel = '<aside class="fc-console fc-ask"><b>' + tt("flowAsk") + "</b><p>" + esc(trace.fork || t("flowAsk")) + "</p>" +
        '<div class="fc-picks"><button type="button" class="good" data-act="flow-branch" data-branch="good">' + esc(trace.goodWhen || t("traceGood")) + "</button>" +
        '<button type="button" class="bad" data-act="flow-branch" data-branch="bad">' + esc(trace.badWhen || t("traceBad")) + "</button></div></aside>";
    } else {
      const step = flow.branch ? branchSteps[flow.seenBranch - 1] : parts.opening[flow.seen - 1];
      panel = step
        ? '<aside class="fc-console fc-' + esc(step.dir) + '"><b>' + tt(flowLabelKey(step)) + "</b>" +
          (step.code ? "<pre>" + esc(step.code) + "</pre>" : "") +
          (step.note ? "<p>" + esc(step.note) + "</p>" : "") + "</aside>"
        : "";
    }

    const moreOpening = !flow.branch && flow.seen <= openingLen;
    const moreBranch = Boolean(flow.branch && flow.seenBranch < branchSteps.length);
    const canBack = flow.seen > 1 || Boolean(flow.branch);
    const back = '<button type="button" class="btn secondary" data-act="flow-back"' + (canBack ? "" : " disabled") + ">" + tt("flowBack") + "</button>";
    const next = moreOpening || moreBranch
      ? '<button type="button" class="btn" data-act="flow-next">' + tt("flowNext") + "</button>"
      : "";
    const hint = ask
      ? '<p class="small muted">' + tt("flowPick") + "</p>"
      : (!moreOpening && !moreBranch && flow.branch ? '<p class="small muted">' + tt("flowDone") + "</p>" : "");
    const shown = Math.min(flow.seen, openingLen) + (flow.branch ? Math.min(flow.seenBranch, branchSteps.length) : 0);
    const total = openingLen + (flow.branch ? branchSteps.length : 0);
    return '<figure class="trace"><figcaption>' + esc(trace.title) + '</figcaption><p class="t-help">' + tt("traceHelp") + '</p>' +
      '<div class="fc-run"><svg class="fc-svg" viewBox="0 0 ' + width + " " + height + '" role="img">' +
      '<defs><marker id="fc-head" markerUnits="userSpaceOnUse" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="9" markerHeight="9" orient="auto"><path d="M0 0 L10 5 L0 10 Z" fill="context-stroke"/></marker></defs>' +
      edges.join("") + diamond + shapes.join("") + "</svg>" + panel + "</div>" +
      '<div class="fc-controls">' + back + next + '<button type="button" class="btn secondary" data-act="flow-reset">' + tt("flowReset") + '</button><span class="small">' + tt("flowStep", { n: shown, total: total }) + "</span></div>" +
      hint + "</figure>";
  }

  function renderBlocks(blocks) {
    return blocks.map((block) => {
      if (block.type === "p") return "<p>" + esc(block.text) + "</p>";
      if (block.type === "h") return "<h3>" + esc(block.text) + "</h3>";
      if (block.type === "ul") return "<ul>" + block.items.map((item) => "<li>" + esc(item) + "</li>").join("") + "</ul>";
      if (block.type === "callout") {
        return '<div class="callout ' + esc(block.tone || "") + '"><strong>' + esc(block.title) + "</strong>" + esc(block.text) + "</div>";
      }
      if (block.type === "scenario") {
        const label = block.tone === "bad" ? tt("goesBadly") : tt("goesWell");
        return '<div class="scenario ' + esc(block.tone || "good") + '"><span>' + label + "</span><strong>" + esc(block.title) + "</strong><p>" + esc(block.text) + "</p></div>";
      }
      if (block.type === "code") {
        return (block.label ? '<p class="small muted">' + esc(block.label) + "</p>" : "") + "<pre>" + esc(block.code) + "</pre>";
      }
      if (block.type === "table") {
        const head = "<tr>" + block.headers.map((cell) => "<th>" + esc(cell) + "</th>").join("") + "</tr>";
        const body = block.rows.map((row) => "<tr>" + row.map((cell) => "<td>" + esc(cell) + "</td>").join("") + "</tr>").join("");
        return "<table>" + head + body + "</table>";
      }
      return "";
    }).join("");
  }

  function exampleBox(item) {
    const example = C.examples && C.examples[item.id];
    if (!example) return "";
    const link = example.connect
      ? '<p class="example-link"><b>' + tt("connects") + "</b> " + esc(example.connect) + "</p>"
      : "";
    return '<div class="example"><span>' + tt("example") + "</span><strong>" + esc(example.title) + "</strong><p>" + esc(example.text) + "</p>" + link + "</div>";
  }

  function renderLesson() {
    const item = lesson(parseRoute().arg);
    if (!item) {
      shell(t("kind_lesson"), "<h1>" + tt("missingLesson") + "</h1>");
      return;
    }
    const index = C.lessons.findIndex((row) => row.id === item.id);
    const prev = C.lessons[index - 1];
    const next = C.lessons[index + 1];
    const d = domain(item.domain);
    const checks = C.questions.filter((q) => q.lesson === item.id).length;
    const done = state.lessons[item.id] ? tt("studied") : tt("markStudied");
    const introCount = item.blocks.findIndex((block) => block.type !== "p");
    const split = introCount === -1 ? item.blocks.length : introCount;
    const sections = sectionMinutes(item.minutes);
    const diagram = C.diagrams && C.diagrams[item.id]
      ? stepTitle(2, sections[1]) + renderDiagram(C.diagrams[item.id])
      : "";
    const trace = C.traces && C.traces[item.id] ? renderTrace(C.traces[item.id], item.id) : "";
    const steps = '<ol class="lesson-steps">' + sections.map((section) => "<li>" + raw(section.short) + " <b>" + tt("minutes", { n: section.minutes }) + "</b></li>").join("") + "</ol>";
    const pace = studyPace();
    const breakdown = sections.map((section) => raw(section.short) + " " + tt("minutes", { n: section.minutes })).join(" · ");
    shell(
      tx(item.title),
      '<p class="kicker">' + esc(d.name) + " · " + tt("minutes", { n: item.minutes }) + "</p><h1>" +
        esc(item.id) + " · " + esc(item.title) + '</h1>' + steps + '<div class="prose">' +
        '<div class="goals"><strong>' + tt("goals") + "</strong><ul>" + item.objectives.map((row) => "<li>" + esc(row) + "</li>").join("") + "</ul></div>" +
        stepTitle(1, sections[0]) +
        renderBlocks(item.blocks.slice(0, split)) +
        exampleBox(item) +
        termsBox(item) +
        diagram +
        trace +
        stepTitle(3, sections[2]) +
        renderBlocks(item.blocks.slice(split)) +
        '</div>' + renderBridge(item, sections[3]) + renderLessonCheck(item, sections[4]) +
        '<section class="pace"><p class="kicker">' + tt("secCaseShort") + '</p><div class="pace-nums"><div><b>' + tt("minutes", { n: item.minutes }) +
        '</b><span>' + tt("thisLesson") + '</span></div><div><b>' + formatStudy(pace.done) +
        '</b><span>' + tt("courseSoFar") + '</span></div><div><b>' + formatStudy(pace.left) +
        '</b><span>' + tt("stillLeft") + '</span></div></div><p class="small muted">' + tt("lessonSum", { breakdown: breakdown, total: formatStudy(pace.total) }) + "</p></section>" +
        '<div class="row" style="margin-top:18px"><button class="btn" data-act="mark" data-id="' + item.id + '">' + done + '</button><button class="btn secondary" data-act="check-lesson" data-id="' + item.id + '">' + tt("repeatSet", { n: checks }) + '</button></div><div class="spread" style="margin-top:22px"><span>' +
        (prev ? '<a href="#/leccion/' + prev.id + '">← ' + esc(prev.id) + "</a>" : "") +
        "</span><span>" + (next ? '<a href="#/leccion/' + next.id + '">' + esc(next.id) + " →</a>" : "") + "</span></div>"
    );
  }

  function lessonText(item) {
    const parts = [item.title].concat(item.objectives);
    item.blocks.forEach((block) => {
      if (block.text) parts.push(block.text);
      if (block.title) parts.push(block.title);
      if (block.items) parts.push(block.items.join(" "));
      if (block.code) parts.push(block.code);
      if (block.rows) parts.push(block.rows.map((row) => row.join(" ")).join(" "));
    });
    return parts.join(" ").toLowerCase();
  }

  function termsBox(item) {
    const text = lessonText(item);
    const rows = C.glossary.filter((row) => row[0].split(" / ").some((name) => {
      const key = name.replace(/\s*<[^>]+>/, "").trim().toLowerCase();
      return key.length > 2 && text.includes(key);
    }));
    if (!rows.length) return "";
    return '<details class="terms"><summary>' + tt("termsSummary", { n: rows.length }) + "</summary><dl>" +
      rows.map((row) => "<dt>" + esc(row[0]) + "</dt><dd>" + esc(row[1]) + "</dd>").join("") + "</dl></details>";
  }

  function renderBridge(item, section) {
    const bridge = C.bridges && C.bridges[item.id];
    if (!bridge) return "";
    const beats = bridge.beats.map((text) => "<li>" + esc(text) + "</li>").join("");
    const links = (bridge.links || []).map((link) => {
      const target = lesson(link.id);
      const title = target ? target.title : "";
      return '<a class="bridge-link" href="#/leccion/' + link.id + '"><b>' + esc(link.id) + " · " + esc(title) + "</b><span>" + esc(link.text) + "</span></a>";
    }).join("");
    const tail = links
      ? '<div class="bridge-links"><p class="bridge-links-title">' + tt("howItConnects") + "</p>" + links + "</div>"
      : '<p class="bridge-base">' + esc(bridge.base || "") + "</p>";
    return '<section class="bridge">' + stepTitle(4, section) + '<p class="small muted">' + tt("bridgeIntro") + '</p><article class="bridge-card"><p class="kicker">' + tt("theCase") + "</p><h4>" +
      esc(bridge.title) + '</h4><ol class="bridge-beats">' + beats + '</ol><p class="bridge-now"><strong>' + tt("thisLessonBit") + "</strong>" + esc(bridge.now) + "</p></article>" + tail + "</section>";
  }

  function lessonCheckState(lessonId) {
    if (!ui.check || ui.check.lesson !== lessonId) {
      ui.check = { lesson: lessonId, picked: {}, shown: {}, confidence: {}, notes: {} };
    }
    ui.check.confidence = ui.check.confidence || {};
    ui.check.notes = ui.check.notes || {};
    return ui.check;
  }

  function renderLessonCheck(item, section) {
    const questions = C.questions.filter((q) => q.lesson === item.id);
    if (!questions.length) return "";
    const check = lessonCheckState(item.id);
    const answered = questions.filter((q) => check.shown[q.id]);
    const right = answered.filter((q) => grade(q, check.picked[q.id] || [])).length;
    const cards = questions.map((q, n) => {
      const picked = check.picked[q.id] || [];
      const shown = Boolean(check.shown[q.id]);
      const choices = q.choices.map((text, index) => {
        let cls = "choice";
        if (picked.includes(index)) cls += " selected";
        if (shown && q.answer.includes(index)) cls += " right";
        if (shown && picked.includes(index) && !q.answer.includes(index)) cls += " wrong";
        return '<button class="' + cls + '" data-act="lc-pick" data-q="' + q.id + '" data-index="' + index + '">' + esc(text) + "</button>";
      }).join("");
      const level = check.confidence[q.id] || "";
      const wrote = (check.notes[q.id] || "").trim();
      const guessedRight = shown && grade(q, picked) && level === "adivino";
      const verdict = shown
        ? '<div class="callout ' + (grade(q, picked) && !guessedRight ? "ok" : "trampa") + '"><strong>' +
          tt(guessedRight ? "guessedRight" : grade(q, picked) ? "correctWhy" : "wrongWhy") +
          "</strong>" + (guessedRight ? tt("guessedStays") : "") + esc(q.explain) +
          (q.trap ? "<br><br><strong>" + tt("tempting") + "</strong>" + esc(q.trap) : "") + "</div>" +
          (wrote ? '<p class="small"><strong>' + tt("youWrote") + "</strong>" + raw(wrote) + "</p>" : "")
        : confidenceControls(level, "lc-conf", q.id) + whyField(check.notes[q.id] || "", 'data-note="lc" data-q="' + q.id + '"') +
          '<button class="btn" data-act="lc-reveal" data-q="' + q.id + '"' + (picked.length && level ? "" : " disabled") + ">" + tt("answer") + "</button>" +
          (picked.length && !level ? '<p class="small muted">' + tt("needLevel") + "</p>" : "");
      return '<article class="lc-card"><p class="kicker">' + tt("qProgress", { n: n + 1, total: questions.length, mode: q.type === "multi" ? t("chooseN", { n: q.pick }) : t("oneAnswer") }) +
        '</p><p class="lc-stem">' + esc(q.stem) + "</p>" + choices + verdict + "</article>";
    }).join("");
    const score = answered.length
      ? '<p class="lc-score">' + tt("scoreOf", { right: right, answered: answered.length }) + (answered.length === questions.length ? tt(right === questions.length ? "mastered" : "reread") : "") +
        (answered.length ? ' <button class="btn secondary" data-act="lc-reset">' + tt("startOver") + "</button>" : "") + "</p>"
      : "";
    const heading = section ? stepTitle(5, section) : '<h3 class="step-title"><span>5</span>' + tt("secCheck") + "</h3>";
    return '<section class="lesson-check">' + heading + '<p class="small muted">' + tt("checkIntro") + "</p>" +
      cards + score + "</section>";
  }

  function refreshMissCount() {
    const link = app.querySelector('a[href="#/fallos"]');
    if (link) link.innerHTML = tt("navMisses") + missBadgeHtml();
  }

  function refreshLessonCheck() {
    refreshMissCount();
    const section = app.querySelector(".lesson-check");
    const item = lesson(parseRoute().arg);
    if (!section || !item) {
      render();
      return;
    }
    section.outerHTML = renderLessonCheck(item, sectionMinutes(item.minutes)[4]);
  }

  function rebuildQueue() {
    let cards = allCards();
    if (ui.deck === "due") cards = cards.filter(cardDue);
    else if (ui.deck.startsWith("d")) cards = cards.filter((card) => card.domain === ui.deck);
    else if (ui.deck === "dist") cards = cards.filter((card) => card.id.startsWith("dist-"));
    cardQueue = shuffle(cards);
    cardBack = false;
  }

  function renderCards() {
    if (!cardQueue.length) rebuildQueue();
    const chips = [
      ["due", tt("forToday")],
      ["all", tt("allCards")],
      ["dist", tt("distinctions")],
    ].concat(C.domains.map((item) => [item.id, item.n]));
    const chipHtml = chips.map(([id, label]) => '<button class="chip' + (ui.deck === id ? " active" : "") + '" data-act="deck" data-id="' + id + '">' + label + "</button>").join("");
    const card = cardQueue[0];
    let face = '<div class="panel"><h2>' + tt("emptyDeckTitle") + "</h2><p>" + tt("emptyDeckBody") + "</p></div>";
    if (card) {
      face =
        '<div class="flash" data-act="flip"><div><p class="kicker">' + tt(cardBack ? "answerFace" : "questionFace") + " · " + tt("inDeck", { n: cardQueue.length }) + '</p><div class="' +
        (cardBack ? "back" : "face") + '">' + esc(cardBack ? card.back : card.front) + '</div></div><p class="small muted">' + tt("flipHelp") + '</p></div><div class="row flash-actions"><button class="btn bad" data-act="grade" data-id="again">' + tt("again") + '</button><button class="btn" data-act="grade" data-id="good">' + tt("good") + '</button><button class="btn good" data-act="grade" data-id="easy">' + tt("easy") + "</button></div>";
    }
    shell(t("navCards"), '<p class="kicker">' + tt("distKicker") + "</p><h1>" + tt("navCards") + '</h1><div class="row" style="margin-bottom:14px">' + chipHtml + '</div><div class="flash-wrap">' + face + "</div>");
  }

  function scheduleCard(id, kind) {
    const record = state.cards[id] || { ease: 2.3, interval: 0, reps: 0, due: todayKey() };
    if (kind === "again") {
      record.reps = 0;
      record.interval = 0;
      record.ease = Math.max(1.3, record.ease - 0.2);
      record.due = todayKey();
    } else if (kind === "good") {
      record.reps += 1;
      record.interval = record.reps === 1 ? 1 : record.reps === 2 ? 3 : Math.max(1, Math.round(record.interval * record.ease));
      record.due = addDays(record.interval);
    } else {
      record.reps += 1;
      record.interval = Math.max(4, Math.round((record.interval || 1) * record.ease * 1.3));
      record.due = addDays(record.interval);
    }
    state.cards[id] = record;
  }

  function gradeCard(kind) {
    const card = cardQueue[0];
    if (!card) return;
    scheduleCard(card.id, kind);
    if (kind === "again") cardQueue.push(cardQueue.shift());
    else cardQueue.shift();
    saveState();
    cardBack = false;
    render();
  }

  function renderPractice() {
    const route = parseRoute();
    if (route.arg === "examen") {
      renderQuiz();
      return;
    }
    const options = '<option value="all">' + tt("allDomains") + "</option>" + C.domains.map((item) => '<option value="' + item.id + '"' + (ui.practiceDomain === item.id ? " selected" : "") + ">" + esc(item.name) + "</option>").join("");
    shell(
      t("practiceTitle"),
      '<p class="kicker">' + tt("practiceKicker") + "</p><h1>" + tt("practiceTitle") + '</h1><p class="lede">' + tt("practiceLede") + '</p><div class="panel"><label>' + tt("domainLabel") + '<br><select id="p-domain">' +
        options +
        '</select></label><label style="display:block;margin-top:10px">' + tt("countLabel") + '<br><select id="p-count">' +
        ["5", "10", "20"].map((n) => '<option' + (ui.practiceCount === n ? " selected" : "") + ">" + n + "</option>").join("") +
        '</select></label><label style="display:block;margin-top:10px">' + tt("modeLabel") + '<br><select id="p-mode"><option value="study"' +
        (ui.practiceMode === "study" ? " selected" : "") + ">" + tt("studyMode") + '</option><option value="exam"' +
        (ui.practiceMode === "exam" ? " selected" : "") + ">" + tt("examMode") + '</option></select></label><div class="row" style="margin-top:14px"><button class="btn" data-act="start-practice">' + tt("start") + "</button></div></div>"
    );
  }

  function renderMockHome() {
    const counts = C.domains.map((item) => "<li>" + tt("mockItem", { name: tx(item.name), n: item.mock, weight: item.weight }) + "</li>").join("");
    shell(
      t("mockTitle"),
      '<p class="kicker">' + tt("mockKicker") + "</p><h1>" + tt("mockTitle") + '</h1><p class="lede">' + tt("mockLede") + "</p><ul>" +
        counts +
        '</ul><button class="btn" data-act="start-mock">' + tt("startMock") + '</button><p class="small muted">' + tt("mockStay") + "</p>"
    );
  }

  function healLive() {
    if (!live) return;
    live.confidence = live.confidence || {};
    live.notes = live.notes || {};
    live.flags = live.flags || {};
    live.answers = live.answers || {};
  }

  function renderQuiz() {
    if (!live) {
      shell(t("examMode"), "<h1>" + tt("noLive") + '</h1><a href="#/practica">' + tt("back") + "</a>");
      return;
    }
    healLive();
    const q = currentQuestion();
    if (!q) {
      finishLive();
      return;
    }
    const picked = live.picked || [];
    const locked = live.mode === "study" && live.revealed;
    const level = live.confidence[q.id] || "";
    const ready = picked.length > 0 && Boolean(level);
    const choices = q.choices.map((text, index) => {
      let cls = "choice";
      if (picked.includes(index)) cls += " selected";
      if (locked && q.answer.includes(index)) cls += " right";
      if (locked && picked.includes(index) && !q.answer.includes(index)) cls += " wrong";
      return '<button class="' + cls + '" data-act="pick" data-index="' + index + '">' + esc(text) + "</button>";
    }).join("");
    const multi = q.type === "multi";
    const wrote = (live.notes[q.id] || "").trim();
    const guessedRight = locked && grade(q, picked) && level === "adivino";
    const explain = locked
      ? '<div class="callout ' + (guessedRight ? "trampa" : "") + '"><strong>' + tt(guessedRight ? "guessedQuiz" : "whyTitle") + "</strong>" +
        (guessedRight ? tt("guessedQuizNote") : "") + esc(q.explain) +
        (q.trap ? "<br><br><strong>" + tt("temptingInline") + "</strong> " + esc(q.trap) : "") + "</div>" +
        (wrote ? '<p class="small"><strong>' + tt("youWrote") + "</strong>" + raw(wrote) + "</p>" : "")
      : "";
    const beforeAnswer = !locked && live.mode === "study"
      ? confidenceControls(level, "conf") + whyField(live.notes[q.id] || "", 'data-note="quiz"') +
        (picked.length && !level ? '<p class="small muted">' + tt("needLevel") + "</p>" : "")
      : "";
    const examConfidence = live.mode === "exam"
      ? confidenceControls(level, "conf") + (picked.length && !level ? '<p class="small muted">' + tt("needLevelNext") + "</p>" : "")
      : "";
    const grid = live.questionIds.map((id, index) => {
      const flagged = live.flags[id] ? " flagged" : "";
      const answered = live.answers[id] && live.answers[id].length ? " answered" : "";
      const on = index === live.index ? " on" : "";
      return '<button class="' + (on + answered + flagged).trim() + '" data-act="goto" data-index="' + index + '">' + (index + 1) + "</button>";
    }).join("");
    const timer = live.deadline
      ? '<div class="timer' + (live.deadline - Date.now() < 600000 ? " low" : "") + '" data-timer>' + formatLeft(live.deadline - Date.now()) + "</div>"
      : '<div class="muted">' + tt("qCounter", { n: live.index + 1, total: live.questionIds.length }) + "</div>";
    const d = domain(q.domain);
    shell(
      t("practiceTitle"),
      '<div class="grid two quiz-board"><article><div class="spread"><div class="q-meta"><span class="tag">' + esc(d.n) + " " + esc(d.name) + '</span><span class="tag">' +
        tt(multi ? "chooseTag" : "oneTag", { n: q.pick }) + "</span>" +
        (live.flags[q.id] ? '<span class="tag">' + tt("flagged") + "</span>" : "") +
        '</div>' + timer + '</div><h2 style="font-family:Segoe UI,sans-serif;font-size:22px;letter-spacing:0">' +
        esc(q.stem) + "</h2>" + choices + explain + beforeAnswer + examConfidence +
        '<div class="row" style="margin-top:8px"><button class="btn secondary" data-act="flag">' + tt("flag") + "</button>" +
        (live.mode === "study" && !live.revealed ? '<button class="btn" data-act="reveal"' + (ready ? "" : " disabled") + ">" + tt("answer") + "</button>" : "") +
        (live.mode === "exam" || live.revealed ? '<button class="btn" data-act="next"' + (live.mode === "exam" && picked.length && !level ? " disabled" : "") + ">" + tt("next") + "</button>" : "") +
        '<button class="btn secondary" data-act="finish">' + tt("submit") + '</button></div></article><aside class="panel"><p class="kicker">' + tt("navLabel") + '</p><div class="q-grid">' +
        grid + "</div></aside></div>",
      true
    );
  }

  function renderResult() {
    const record = state.history.find((item) => item.id === parseRoute().arg) || state.history[0];
    if (!record) {
      shell(t("seeResult"), "<h1>" + tt("noResults") + "</h1>");
      return;
    }
    const percent = Math.round((100 * record.correct) / record.total);
    const bars = C.domains.map((item) => {
      const row = record.byDomain[item.id] || { correct: 0, total: 0 };
      const pct = row.total ? Math.round((100 * row.correct) / row.total) : 0;
      return "<p><strong>" + esc(item.name) + "</strong> " + row.correct + "/" + row.total + " · " + pct + '%</p><div class="bar"><span style="width:' + pct + "%;background:" + domainStripe(item.id) + '"></span></div>';
    }).join("");
    const wrong = record.questionIds.filter((id) => question(id) && !grade(question(id), record.answers[id]));
    const guessed = record.questionIds.filter((id) => question(id) && (record.confidence || {})[id] === "adivino" && grade(question(id), record.answers[id]));
    const reviewCard = (id) => {
      const q = question(id);
      const chosen = (record.answers[id] || []).map((index) => q.choices[index]).join(" · ") || t("noAnswer");
      const right = q.answer.map((index) => q.choices[index]).join(" · ");
      const note = String(((record.notes || {})[id] || (state.notes || {})[id] || "")).trim();
      const level = (record.confidence || {})[id];
      const marked = level === "se" ? tt("markedKnown") : level === "creo" ? tt("markedBelieved") : level === "adivino" ? tt("markedGuessed") : "";
      return '<article class="panel" style="margin:10px 0"><p class="small muted">' + esc(lesson(q.lesson).id) + " · " + esc(lesson(q.lesson).title) + '</p><p><strong>' + esc(q.stem) + "</strong></p><p>" + tt("youPicked", { text: chosen }) + "</p><p>" + tt("rightAnswer", { text: right }) + "</p>" +
        (marked ? "<p>" + marked + "</p>" : "") +
        (note ? "<p><strong>" + tt("youWrote") + "</strong>" + raw(note) + "</p>" : "") +
        "<p>" + esc(q.explain) + '</p><p><a href="#/leccion/' + q.lesson + '">' + tt("backLesson") + "</a></p></article>";
    };
    const review = wrong.map(reviewCard).join("");
    const guessReview = guessed.map(reviewCard).join("");
    shell(
      "Resultado",
      '<p class="kicker">' + tt("kind_" + record.kind) + "</p><h1>" + record.correct + " / " + record.total + " · " + percent + '%</h1><p class="lede">' +
        raw(advice(percent, record.byDomain)) + "</p>" + confidenceLine(record) + '<p class="small muted">' + tt("notOfficial") + "</p>" +
        bars + '<h2 style="margin-top:28px">' + tt("missesHeading") + "</h2>" + (review || "<p>" + tt("noneSet") + "</p>") +
        (guessReview ? '<h2 style="margin-top:28px">' + tt("guessedHeading") + "</h2><p>" + tt("guessedBody") + "</p>" + guessReview : ""),
      true
    );
  }

  function confidenceLine(record) {
    const conf = record.confidence || {};
    const right = record.questionIds.filter((id) => question(id) && grade(question(id), record.answers[id]) && conf[id]);
    if (!right.length) return "";
    const count = (level) => right.filter((id) => conf[id] === level).length;
    const parts = [];
    const known = count("se");
    const believed = count("creo");
    const guessed = count("adivino");
    if (known) parts.push(t(known === 1 ? "knownOne" : "knownMany", { n: known }));
    if (believed) parts.push(t(believed === 1 ? "believedOne" : "believedMany", { n: believed }));
    if (guessed) parts.push(t(guessed === 1 ? "guessedOne" : "guessedMany", { n: guessed }));
    const list = parts.length < 2 ? parts.join("") : parts.slice(0, -1).join(", ") + t("andJoin") + parts[parts.length - 1];
    let text = t("confLead", { list: list });
    if (guessed) text += t(guessed === 1 ? "guessedBackOne" : "guessedBackMany");
    return "<p>" + raw(text) + "</p>";
  }

  function renderScenarios() {
    const route = parseRoute();
    if (route.arg) {
      const item = C.scenarios.find((row) => row.id === route.arg);
      if (!item) {
        shell(t("navScenarios"), "<h1>" + tt("notThere") + "</h1>");
        return;
      }
      const rows = item.decisions.map((row) => '<article class="panel" style="margin:10px 0"><p class="small"><a href="#/leccion/' + row.lesson + '">' + tt("lessonLink", { id: row.lesson }) + "</a></p><h3>" + esc(row.q) + "</h3><p>" + esc(row.a) + "</p></article>").join("");
      shell(t("navScenarios"), '<p class="kicker">' + tt("studyScenario") + "</p><h1>" + esc(item.title) + '</h1><p class="lede">' + esc(item.brief) + '</p>' + rows + '<p><a href="#/escenarios">' + tt("allScenarios") + "</a></p>");
      return;
    }
    const cards = C.scenarios.map((item) => '<a class="card" href="#/escenarios/' + item.id + '"><p class="kicker">' + item.domains.map((id) => domain(id).n).join(" · ") + "</p><h3>" + esc(item.title) + "</h3><p>" + esc(item.brief) + "</p></a>").join("");
    shell(t("navScenarios"), '<p class="kicker">' + tt("scenariosKicker") + "</p><h1>" + tt("scenariosTitle") + '</h1><p class="lede">' + tt("scenariosLede") + '</p><div class="grid cards">' + cards + "</div>", true);
  }

  function renderMissCard(id, open) {
    const q = question(id);
    const row = state.misses[id];
    const item = lesson(q.lesson);
    const note = String((state.notes || {})[id] || "").trim();
    const head = '<article class="panel miss' + (open ? "" : " later") + '"><p class="small muted"><a href="#/leccion/' + esc(q.lesson) + '">' + esc(item.id + " · " + tx(item.title)) + "</a> · " + raw(missStatus(row)) + " · " + raw(missPace(row)) + "</p><p><strong>" + esc(q.stem) + "</strong></p>";
    if (!open) return head + "</article>";
    const right = q.answer.map((index) => q.choices[index]).join(" · ");
    return head + "<p>" + tt("answerWord", { text: right }) + "</p>" +
      (note ? "<p><strong>" + tt("youWrote") + "</strong>" + raw(note) + "</p>" : "") +
      "<p>" + esc(q.explain) + "</p>" +
      (q.trap ? "<p><strong>" + tt("temptingDot") + "</strong> " + esc(q.trap) + "</p>" : "") +
      '<button class="btn secondary" data-act="miss-dismiss" data-id="' + esc(id) + '">' + tt("gotIt") + "</button></article>";
  }

  function renderMisses() {
    const due = dueMisses().sort(byLessonOrder);
    const later = pendingMisses().filter((id) => due.indexOf(id) === -1).sort(byLessonOrder);
    if (!due.length && !later.length) {
      shell(t("navMisses"), '<p class="kicker">' + tt("distKicker") + "</p><h1>" + tt("navMisses") + '</h1><div class="panel"><h2>' + tt("missesEmptyTitle") + "</h2><p>" + tt("missesEmptyBody") + "</p></div>", true);
      return;
    }
    const review = due.length
      ? '<div class="row" style="margin-bottom:14px"><button class="btn" data-act="miss-review">' + tt(due.length === 1 ? "reviewOne" : "reviewMany", { n: due.length }) + "</button></div>" + due.map((id) => renderMissCard(id, true)).join("")
      : '<div class="panel"><h2>' + tt("nothingToday") + "</h2><p>" + tt("nextReturns", { day: formatDay(later.map((id) => state.misses[id].due).sort()[0]) }) + "</p></div>";
    const waiting = later.length
      ? '<h2 style="margin-top:28px">' + tt("laterTitle") + '</h2><p class="muted">' + tt("laterNote") + "</p>" + later.map((id) => renderMissCard(id, false)).join("")
      : "";
    shell(
      t("navMisses"),
      '<p class="kicker">' + tt("missesKicker", { due: due.length, later: later.length }) + "</p><h1>" + tt("navMisses") + '</h1><p class="lede">' + tt("missesLede") + "</p>" + review + waiting,
      true
    );
  }

  const MAP_LEFT = 190;
  const MAP_TOP = 44;
  const MAP_COLUMN = 136;
  const MAP_ROW = 130;
  const MAP_HALF_WIDTH = 62;
  const MAP_HALF_HEIGHT = 27;

  function mapCenter(item) {
    const row = C.domains.findIndex((d) => d.id === item.domain);
    const col = C.lessons.filter((other) => other.domain === item.domain).indexOf(item);
    return { x: MAP_LEFT + col * MAP_COLUMN + MAP_HALF_WIDTH, y: MAP_TOP + row * MAP_ROW + MAP_HALF_HEIGHT };
  }

  function mapLinks() {
    return C.lessons.flatMap((item) => ((C.bridges[item.id] && C.bridges[item.id].links) || []).map((link) => ({ from: link.id, to: item.id, text: link.text })));
  }

  // Cuts a segment at the node border so arrows touch the box instead of hiding under it.
  function clipToBox(center, dx, dy, length) {
    const ux = dx / length;
    const uy = dy / length;
    const t = Math.min(
      Math.abs(ux) > 0.0001 ? MAP_HALF_WIDTH / Math.abs(ux) : Infinity,
      Math.abs(uy) > 0.0001 ? MAP_HALF_HEIGHT / Math.abs(uy) : Infinity
    );
    return { x: center.x + ux * t, y: center.y + uy * t, ux, uy };
  }

  function edgePath(from, to) {
    const a = mapCenter(lesson(from));
    const b = mapCenter(lesson(to));
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const length = Math.hypot(dx, dy) || 1;
    const start = clipToBox(a, dx, dy, length);
    const end = clipToBox(b, -dx, -dy, length);
    const bend = Math.min(56, length * 0.16);
    const cx = (start.x + end.x) / 2 - (dy / length) * bend;
    const cy = (start.y + end.y) / 2 + (dx / length) * bend;
    return "M" + start.x.toFixed(1) + " " + start.y.toFixed(1) + " Q" + cx.toFixed(1) + " " + cy.toFixed(1) + " " + end.x.toFixed(1) + " " + end.y.toFixed(1);
  }

  function wrapLabel(text, width, maxLines) {
    const lines = [];
    let line = "";
    text.split(" ").forEach((word) => {
      const next = line ? line + " " + word : word;
      if (next.length > width && line) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    });
    if (line) lines.push(line);
    if (lines.length > maxLines) {
      lines.length = maxLines;
      lines[maxLines - 1] = lines[maxLines - 1].slice(0, width - 1) + "…";
    }
    return lines;
  }

  function mapSvg(selected) {
    const links = mapLinks();
    const linked = new Set();
    links.forEach((link) => {
      if (link.from === selected) linked.add(link.to);
      if (link.to === selected) linked.add(link.from);
    });
    const lanes = C.domains.map((d, row) =>
      wrapLabel(d.name, 20, 2).map((text, line) => '<text class="lane" x="14" y="' + (MAP_TOP + row * MAP_ROW + 22 + line * 16) + '">' + esc(text) + "</text>").join("")
    ).join("");
    const edges = links.map((link) => {
      const hot = selected && (link.from === selected || link.to === selected);
      return '<path class="edge' + (hot ? " hot" : "") + '" d="' + edgePath(link.from, link.to) + '" marker-end="url(#arrow)"><title>' + esc(link.from + " → " + link.to + ": " + link.text) + "</title></path>";
    }).join("");
    const nodes = C.lessons.map((item) => {
      const c = mapCenter(item);
      const x = c.x - MAP_HALF_WIDTH;
      const y = c.y - MAP_HALF_HEIGHT;
      const cls = "node" + (item.id === selected ? " sel" : "") + (linked.has(item.id) ? " linked" : "");
      const titleLines = wrapLabel(tx(item.title), 19, 2).map((text, line) => '<text class="t" x="' + (x + 12) + '" y="' + (y + 31 + line * 13) + '">' + raw(text) + "</text>").join("");
      return '<a href="#/mapa/' + esc(item.id) + '"><g class="' + cls + '"><rect x="' + x + '" y="' + y + '" width="' + MAP_HALF_WIDTH * 2 + '" height="' + MAP_HALF_HEIGHT * 2 +
        '" rx="10"/><rect class="stripe" x="' + x + '" y="' + y + '" width="5" height="' + MAP_HALF_HEIGHT * 2 + '" rx="2" style="fill:var(--' + item.domain + ')"/><text class="id" x="' + (x + 12) + '" y="' + (y + 16) + '">' + esc(item.id) + "</text>" + titleLines + "</g></a>";
    }).join("");
    return '<svg class="map' + (selected ? " focused" : "") + '" viewBox="0 0 1120 660" role="img" aria-label="' + tt("mapAria") + '"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/></marker></defs>' +
      lanes + edges + nodes + "</svg>";
  }

  function mapDetail(selected) {
    const item = lesson(selected);
    if (!item) return '<p class="small muted">' + tt("mapPick") + "</p>";
    const own = ((C.bridges[item.id] && C.bridges[item.id].links) || []).map((link) => {
      const source = lesson(link.id);
      return "<li><a href=\"#/mapa/" + esc(link.id) + '"><strong>' + esc(source.id) + " · " + esc(source.title) + "</strong></a><br>" + esc(link.text) + "</li>";
    }).join("");
    const later = mapLinks().filter((link) => link.from === item.id).map((link) => {
      const target = lesson(link.to);
      return "<li><a href=\"#/mapa/" + esc(link.to) + '"><strong>' + esc(target.id) + " · " + esc(target.title) + "</strong></a><br>" + esc(link.text) + "</li>";
    }).join("");
    return '<article class="panel map-detail"><p class="kicker">' + esc(item.id) + " · " + esc(domain(item.domain).name) + "</p><h2>" + esc(item.title) + '</h2><div class="grid two"><div><h3>' + tt("restsOn") + "</h3>" +
      (own ? "<ul>" + own + "</ul>" : '<p class="muted">' + tt("mapBase") + "</p>") +
      "</div><div><h3>" + tt("usedLater") + "</h3>" + (later ? "<ul>" + later + "</ul>" : '<p class="muted">' + tt("mapLaterNone") + "</p>") +
      '</div></div><p><a class="btn" href="#/leccion/' + esc(item.id) + '">' + tt("openLesson") + "</a></p></article>";
  }

  function mapList(selected) {
    return C.domains.map((item) => {
      const rows = C.lessons.filter((lessonItem) => lessonItem.domain === item.id).map((lessonItem) => {
        const on = lessonItem.id === selected ? " on" : "";
        return '<a class="map-item' + on + '" href="#/mapa/' + esc(lessonItem.id) + '"><i style="background:' + domainStripe(lessonItem.domain) + '"></i><b>' + esc(lessonItem.id) + "</b><span>" + esc(lessonItem.title) + "</span></a>";
      }).join("");
      return '<section class="map-group"><p class="kicker">' + esc(item.name) + '</p><div class="map-items">' + rows + "</div></section>";
    }).join("");
  }

  function renderMap() {
    const selected = parseRoute().arg;
    shell(
      t("navMap"),
      '<p class="kicker">' + tt("mapKicker") + "</p><h1>" + tt("mapTitle") + '</h1><p class="lede">' + tt("mapLede") + '</p><div class="map-wrap">' +
        mapSvg(selected) + '</div><div class="map-list">' + mapList(selected) + "</div>" + mapDetail(selected),
      true
    );
  }

  function todayPairIndexes() {
    const lapsed = [];
    const fresh = [];
    C.distinctions.forEach((_, index) => {
      const id = "dist-" + index;
      if (!cardDue({ id })) return;
      (state.cards[id] ? lapsed : fresh).push(index);
    });
    return lapsed.concat(shuffle(fresh).slice(0, Math.max(0, 8 - lapsed.length)));
  }

  function renderDistinctions() {
    const due = todayPairIndexes().length;
    const rows = C.distinctions.map((row) => "<tr><td><strong>" + esc(row[0]) + "</strong></td><td><strong>" + esc(row[1]) + "</strong></td><td>" + esc(row[2]) + "</td></tr>").join("");
    const cards = C.distinctions.map((row) => '<article class="dist-card"><b>' + esc(row[0]) + "</b><span>" + tt("versus") + "</span><b>" + esc(row[1]) + "</b><p>" + esc(row[2]) + "</p></article>").join("");
    shell(
      t("distinctions"),
      '<p class="kicker">' + tt("distKicker") + "</p><h1>" + tt("distTitle") + "</h1><p>" + tt("distLede") + '</p><p><a class="btn" href="#/pares">' + tt("linkPairs") + '</a> <span class="small muted">' + (due ? tt("duePairs", { n: due, total: C.distinctions.length }) : tt("noneDue")) + '</span></p><div class="dist-cards">' + cards + '</div><table class="dist-table"><tr><th>' + tt("colThis") + "</th><th>" + tt("colNot") + "</th><th>" + tt("colRule") + "</th></tr>" + rows + "</table>",
      true
    );
  }

  function startPairs(all) {
    const due = todayPairIndexes();
    const every = C.distinctions.map((_, index) => index);
    const queue = all ? shuffle(every) : due.length ? shuffle(due) : shuffle(every).slice(0, 8);
    pair = { queue, free: Boolean(all) || !due.length, revealed: false, note: "", done: 0, total: queue.length };
  }

  function renderPairs() {
    if (!pair) startPairs(false);
    const current = pair.queue[0];
    if (current === undefined) {
      shell(
        t("linkPairs"),
        '<p class="kicker">' + tt("distinctions") + "</p><h1>" + tt("pairsDone") + '</h1><p class="lede">' + tt("pairsDoneLede", { n: pair.done }) + '</p><div class="row"><a class="btn secondary" href="#/distinciones">' + tt("seeTable") + '</a><button class="btn" data-act="pair-restart">' + tt("anotherSet") + "</button></div>"
      );
      return;
    }
    const row = C.distinctions[current];
    const body = pair.revealed
      ? '<p class="small"><strong>' + tt("youWrote") + "</strong>" + (pair.note.trim() ? raw(pair.note) : tt("nothingYet")) + '</p><div class="callout"><strong>' + tt("criterion") + "</strong>" + esc(row[2]) + '</div><p class="small muted">' + tt("gradeHelp") + '</p><div class="row"><button class="btn good" data-act="pair-grade" data-id="easy">' + tt("hadIt") + '</button><button class="btn" data-act="pair-grade" data-id="good">' + tt("partial") + '</button><button class="btn bad" data-act="pair-grade" data-id="again">' + tt("didnt") + "</button></div>"
      : whyField(pair.note, 'data-note="pair"', t("pairWhyPrompt"), t("pairWhyPlaceholder")) + '<button class="btn" data-act="pair-reveal">' + tt("seeCriterion") + "</button>";
    shell(
      t("linkPairs"),
      '<p class="kicker">' + tt("pairKicker", { n: pair.done + 1, total: pair.total, tail: t(pair.free ? "freeTail" : "todayTail") }) + "</p><h1>" + tt("pairTitle") + '</h1><div class="pair"><b>' + esc(row[0]) + '</b><span class="vs">' + tt("versus") + "</span><b>" + esc(row[1]) + "</b></div>" + body +
        '<p class="small" style="margin-top:18px"><button class="btn secondary" data-act="pair-all">' + tt("practiceAll") + '</button> <a href="#/distinciones">' + tt("seeTable") + "</a></p>"
    );
  }

  function renderGlossary() {
    const query = ui.q.trim().toLowerCase();
    const rows = C.glossary
      .filter((row) => !query || (row[0] + " " + row[1] + " " + tx(row[0]) + " " + tx(row[1])).toLowerCase().includes(query))
      .map((row) => "<tr><th>" + esc(row[0]) + "</th><td>" + esc(row[1]) + "</td></tr>")
      .join("");
    shell(t("glossaryTitle"), '<p class="kicker">' + tt("glossaryKicker") + "</p><h1>" + tt("glossaryTitle") + '</h1><input class="search" placeholder="' + tt("searchTerm") + '" value="' + raw(ui.q) + '"><table>' + rows + "</table>", true);
  }

  function renderOut() {
    shell(
      t("outTitle"),
      '<p class="kicker">' + tt("outKicker") + "</p><h1>" + tt("outTitle") + "</h1><ul>" +
        C.outOfScope.map((item) => "<li>" + esc(item) + "</li>").join("") +
        "</ul><p>" + tt("outNote") + "</p>"
    );
  }

  function extraStudy() {
    const prep = C.prep.map((row) => "<li><strong>" + esc(row[0]) + ".</strong> " + esc(row[1]) + "</li>").join("");
    const drift = C.drift.map((row) => "<li><strong>" + esc(row[0]) + ".</strong> " + esc(row[1]) + "</li>").join("");
    const sources = C.sources.map((row) => '<li><a href="' + raw(row[1]) + '">' + esc(row[0]) + "</a>. " + esc(row[2]) + "</li>").join("");
    return '<h2 style="margin-top:28px">' + tt("prepTitle") + "</h2><ul>" + prep + '</ul><h2>' + tt("driftTitle") + '</h2><p class="small muted">' + tt("driftNote") + "</p><ul>" + drift + "</ul><h2>" + tt("sourcesTitle") + "</h2><ul>" + sources + "</ul>";
  }

  function samplesBlock() {
    const rows = C.samples.map((row) => "<li><strong>" + esc(row[0]) + ":</strong> " + esc(row[1]) + "</li>").join("");
    return '<h2 style="margin-top:28px">' + tt("samplesTitle") + '</h2><p class="small muted">' + tt("samplesNote") + "</p><ul>" + rows + "</ul>";
  }

  function renderLogistics() {
    const items = C.checklist.map((item) => {
      const on = state.checklist[item.id] ? " checked" : "";
      return '<label class="checkline"><input type="checkbox" data-act="check" data-id="' + item.id + '"' + on + '><span><strong>' + esc(item.title) + '</strong><br><span class="muted">' + esc(item.detail) + "</span></span></label>";
    }).join("");
    const facts = (pack().logisticsRows || []).map((row) => "<tr><td>" + raw(row[0]) + "</td><td>" + raw(row[1]) + "</td><td>" + raw(row[2]) + "</td></tr>").join("");
    const access = (pack().accessItems || []).map((item) => "<li>" + raw(item) + "</li>").join("");
    shell(
      t("logisticsTitle"),
      '<p class="kicker">' + tt("logisticsKicker") + "</p><h1>" + tt("logisticsTitle") + '</h1><div class="panel">' + items + '</div><h2 style="margin-top:28px">' + tt("factsTitle") + '</h2><table><tr><th>' + tt("colFact") + "</th><th>" + tt("colReported") + "</th><th>" + tt("colSource") + "</th></tr>" + facts + "</table>" + extraStudy() + samplesBlock() + "<h2>" + tt("accessTitle") + "</h2><ul>" + access + "</ul><h2>" + tt("mailTitle") + "</h2><p>" + tt("mailBody") + '</p><p><a href="https://claudecertificationguide.com/learn">' + tt("externalMap") + '</a> · <a href="https://anthropic-partners.skilljar.com/path/claude-architect">' + tt("skilljar") + '</a></p><p class="small muted">' + tt("skilljarNote") + '</p><button class="btn secondary" data-act="reset">' + tt("reset") + "</button>"
    );
  }

  function render() {
    const route = parseRoute();
    if (route.name === "inicio") renderHome();
    else if (route.name === "ruta") renderPath();
    else if (route.name === "leccion") renderLesson();
    else if (route.name === "tarjetas") renderCards();
    else if (route.name === "practica") renderPractice();
    else if (route.name === "simulacro" && route.arg === "examen") renderQuiz();
    else if (route.name === "simulacro") renderMockHome();
    else if (route.name === "resultado") renderResult();
    else if (route.name === "escenarios") renderScenarios();
    else if (route.name === "distinciones") renderDistinctions();
    else if (route.name === "pares") renderPairs();
    else if (route.name === "glosario") renderGlossary();
    else if (route.name === "fuera") renderOut();
    else if (route.name === "logistica") renderLogistics();
    else if (route.name === "fallos") renderMisses();
    else if (route.name === "mapa") renderMap();
    else renderHome();
  }

  document.body.addEventListener("click", (event) => {
    const node = event.target.closest("[data-act]");
    if (!node) return;
    const act = node.dataset.act;
    if (act === "lang") {
      const nextLang = node.dataset.lang;
      if (nextLang !== "es" && nextLang !== "en") return;
      if (nextLang === lang) return;
      lang = nextLang;
      localStorage.setItem(LANG_KEY, lang);
      cardQueue = [];
      render();
      return;
    }
    if (act === "flip") {
      cardBack = !cardBack;
      render();
      return;
    }
    if (act === "grade") {
      if (!cardBack) {
        cardBack = true;
        render();
        return;
      }
      gradeCard(node.dataset.id);
      return;
    }
    if (act === "deck") {
      ui.deck = node.dataset.id;
      cardQueue = [];
      render();
      return;
    }
    if (act === "mark") {
      const id = node.dataset.id;
      if (state.lessons[id]) delete state.lessons[id];
      else state.lessons[id] = new Date().toISOString();
      saveState();
      render();
      return;
    }
    if (act === "lc-pick" && ui.check) {
      const q = question(node.dataset.q);
      if (ui.check.shown[q.id]) return;
      const index = Number(node.dataset.index);
      let picked = (ui.check.picked[q.id] || []).slice();
      if (q.type === "multi") {
        picked = picked.includes(index) ? picked.filter((value) => value !== index) : picked.concat(index);
        if (q.pick && picked.length > q.pick) picked = picked.slice(picked.length - q.pick);
      } else {
        picked = [index];
      }
      ui.check.picked[q.id] = picked;
      refreshLessonCheck();
      return;
    }
    if (act === "lc-conf" && ui.check) {
      const id = node.dataset.q;
      if (!id || ui.check.shown[id]) return;
      ui.check.confidence[id] = node.dataset.level;
      refreshLessonCheck();
      return;
    }
    if (act === "lc-reveal" && ui.check) {
      const id = node.dataset.q;
      const picked = ui.check.picked[id] || [];
      if (!picked.length || !ui.check.confidence[id]) return;
      ui.check.shown[id] = true;
      rememberNote(id, ui.check.notes[id]);
      recordAnswer(id, picked, ui.check.confidence[id]);
      state.lessons[ui.check.lesson] = state.lessons[ui.check.lesson] || new Date().toISOString();
      saveState();
      refreshLessonCheck();
      return;
    }
    if (act === "miss-dismiss") {
      if (state.misses[node.dataset.id]) state.misses[node.dataset.id].resolved = true;
      saveState();
      render();
      return;
    }
    if (act === "miss-review") {
      const ids = dueMisses().sort(byLessonOrder);
      if (ids.length) startQuiz("review", ids, "study", 0);
      return;
    }
    if (act === "pair-reveal" && pair) {
      pair.revealed = true;
      render();
      return;
    }
    if (act === "pair-grade" && pair && pair.queue.length) {
      scheduleCard("dist-" + pair.queue[0], node.dataset.id);
      saveState();
      pair.queue.shift();
      pair.done += 1;
      pair.revealed = false;
      pair.note = "";
      render();
      return;
    }
    if (act === "pair-restart") {
      startPairs(false);
      render();
      return;
    }
    if (act === "pair-all") {
      startPairs(true);
      render();
      return;
    }
    if (act === "conf" && live && !(live.mode === "study" && live.revealed)) {
      healLive();
      const q = currentQuestion();
      if (!q) return;
      live.confidence[q.id] = node.dataset.level;
      saveLive();
      render();
      return;
    }
    if (act === "lc-reset") {
      ui.check = null;
      refreshLessonCheck();
      return;
    }
    if (act === "diagram-test") {
      const figure = node.closest(".diagram");
      figure.classList.toggle("testing");
      figure.querySelectorAll(".d-path").forEach((row) => row.classList.remove("shown"));
      node.textContent = figure.classList.contains("testing") ? t("showAll") : t("testMe");
      return;
    }
    if (act === "path-reveal") {
      if (node.closest(".diagram.testing")) node.classList.toggle("shown");
      return;
    }
    if (act === "check-lesson") {
      const ids = C.questions.filter((q) => q.lesson === node.dataset.id).map((q) => q.id);
      if (!ids.length) return;
      state.lessons[node.dataset.id] = state.lessons[node.dataset.id] || new Date().toISOString();
      saveState();
      startQuiz("lesson", ids, "study", 0);
      return;
    }
    if (act === "start-practice") {
      const domainId = document.getElementById("p-domain").value;
      const count = Number(document.getElementById("p-count").value);
      const mode = document.getElementById("p-mode").value;
      ui.practiceDomain = domainId;
      ui.practiceCount = String(count);
      ui.practiceMode = mode;
      let pool = C.questions.slice();
      if (domainId !== "all") pool = pool.filter((q) => q.domain === domainId);
      const ids = shuffle(pool).slice(0, count).map((q) => q.id);
      startQuiz("practice", ids, mode, 0);
      return;
    }
    if (act === "start-mock") {
      startQuiz("mock", buildMockIds(), "exam", 120);
      return;
    }
    if (act === "pick" && live && !(live.mode === "study" && live.revealed)) {
      const index = Number(node.dataset.index);
      const q = currentQuestion();
      let picked = (live.picked || []).slice();
      if (q.type === "multi") {
        picked = picked.includes(index) ? picked.filter((value) => value !== index) : picked.concat(index);
        if (q.pick && picked.length > q.pick) picked = picked.slice(picked.length - q.pick);
      } else {
        picked = [index];
      }
      live.picked = picked;
      if (live.mode === "exam") live.answers[q.id] = picked.slice();
      saveLive();
      render();
      return;
    }
    if (act === "reveal" && live) {
      healLive();
      const q = currentQuestion();
      if (!q || !(live.picked || []).length || !live.confidence[q.id]) return;
      live.answers[q.id] = live.picked.slice();
      live.revealed = true;
      rememberNote(q.id, live.notes[q.id]);
      saveState();
      saveLive();
      render();
      return;
    }
    if (act === "next" && live) {
      if (live.mode === "exam") {
        const q = currentQuestion();
        live.answers[q.id] = (live.picked && live.picked.length ? live.picked : live.answers[q.id] || []).slice();
      }
      if (live.index >= live.questionIds.length - 1) {
        if (window.confirm(t("confirmLast"))) finishLive();
        return;
      }
      live.index += 1;
      live.revealed = false;
      const upcoming = currentQuestion();
      live.picked = (live.answers[upcoming.id] || []).slice();
      saveLive();
      render();
      return;
    }
    if (act === "goto" && live) {
      live.index = Number(node.dataset.index);
      live.revealed = false;
      const q = currentQuestion();
      live.picked = (live.answers[q.id] || []).slice();
      saveLive();
      render();
      return;
    }
    if (act === "flag" && live) {
      const q = currentQuestion();
      live.flags[q.id] = !live.flags[q.id];
      saveLive();
      render();
      return;
    }
    if (act === "finish" && live) {
      if (window.confirm(t("confirmSubmit"))) finishLive();
      return;
    }
    if (act === "flow-next" || act === "flow-back" || act === "flow-branch" || act === "flow-reset") {
      const id = parseRoute().arg;
      const trace = C.traces && C.traces[id];
      if (!trace) return;
      const parts = traceParts(trace);
      const openingLen = Math.max(parts.opening.length, 1);
      const flow = flowState(id);
      if (act === "flow-reset") {
        ui.flow = { lesson: id, seen: 1, branch: null, seenBranch: 0 };
      } else if (act === "flow-back") {
        if (flow.branch) {
          if (flow.seenBranch > 1) flow.seenBranch -= 1;
          else {
            flow.branch = null;
            flow.seenBranch = 0;
          }
        } else if (flow.seen > 1) {
          flow.seen -= 1;
        }
      } else if (act === "flow-branch") {
        if (flow.seen <= openingLen) return;
        flow.branch = node.dataset.branch === "bad" ? "bad" : "good";
        flow.seenBranch = 1;
      } else if (flow.seen <= openingLen) {
        flow.seen += 1;
      } else if (flow.branch) {
        const steps = flow.branch === "bad" ? parts.bad : parts.rest;
        if (flow.seenBranch < steps.length) flow.seenBranch += 1;
      }
      render();
      const narrow = window.matchMedia("(max-width: 860px)").matches;
      const current = narrow ? app.querySelector(".fc-console") : app.querySelector(".fc-svg .n-now");
      if (current) current.scrollIntoView({ block: narrow ? "nearest" : "center", behavior: "smooth" });
      return;
    }
    if (act === "reset") {
        if (window.confirm(t("confirmReset"))) {
        localStorage.removeItem(STORE);
        sessionStorage.removeItem(LIVE);
        location.reload();
      }
    }
  });

  document.body.addEventListener("change", (event) => {
    const node = event.target;
    if (node.dataset.act === "check") {
      state.checklist[node.dataset.id] = node.checked;
      saveState();
    }
  });

  document.body.addEventListener("input", (event) => {
    if (event.target.dataset.note === "lc" && ui.check) {
      ui.check.notes[event.target.dataset.q] = event.target.value;
      return;
    }
    if (event.target.dataset.note === "quiz" && live) {
      healLive();
      const q = currentQuestion();
      if (!q) return;
      live.notes[q.id] = event.target.value;
      saveLive();
      return;
    }
    if (event.target.dataset.note === "pair" && pair) {
      pair.note = event.target.value;
      return;
    }
    if (event.target.classList && event.target.classList.contains("search")) {
      ui.q = event.target.value;
      render();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.target.matches("input, textarea, select")) return;
    const route = parseRoute();
    if (route.name === "tarjetas") {
      if (event.code === "Space") {
        event.preventDefault();
        cardBack = !cardBack;
        render();
      } else if (cardBack && event.key === "1") gradeCard("again");
      else if (cardBack && event.key === "2") gradeCard("good");
      else if (cardBack && event.key === "3") gradeCard("easy");
    }
  });

  window.addEventListener("beforeunload", (event) => {
    if (live && live.kind === "mock") {
      event.preventDefault();
      event.returnValue = "";
    }
  });

  window.addEventListener("hashchange", () => {
    if (parseRoute().name !== "tarjetas") cardQueue = [];
    window.scrollTo(0, 0);
    render();
  });

  if (!location.hash) location.hash = "#/inicio";
  render();
})();
