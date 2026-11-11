(function () {
  const C = window.CCARF;
  const app = document.getElementById("app");
  const STORE = "ccarf-study-v1";
  const LIVE = "ccarf-live-v1";

  if (!C || !C.lessons || !C.questions) {
    app.textContent = "No se cargó el contenido de estudio.";
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
    return String(value).replace(/[&<>"']/g, (ch) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[ch]));
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
      front: row[0] + "  vs  " + row[1],
      back: row[2],
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

  const SECTION_PLAN = [
    ["que", "Qué es", "Qué es, desde cero", 2],
    ["flujo", "El flujo", "El flujo, paso a paso", 2],
    ["reglas", "Reglas y casos", "Reglas y casos", 4],
    ["caso", "El caso", "Un caso, unido a lo que ya viste", 1],
    ["check", "Comprobar", "Comprueba lo que aprendiste", 2],
  ];

  function sectionMinutes(total) {
    const weights = SECTION_PLAN.map((row) => row[3]);
    const weightSum = weights.reduce((sum, weight) => sum + weight, 0);
    const exact = weights.map((weight) => (total * weight) / weightSum);
    const minutes = exact.map((value) => Math.floor(value));
    let left = total - minutes.reduce((sum, value) => sum + value, 0);
    const order = exact
      .map((value, index) => ({ index: index, frac: value - Math.floor(value) }))
      .sort((a, b) => b.frac - a.frac || a.index - b.index);
    for (let index = 0; index < left; index += 1) minutes[order[index].index] += 1;
    return SECTION_PLAN.map((row, index) => ({
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
    return '<section class="pace"><p class="kicker">Tiempo de estudio</p><div class="pace-nums"><div><b>' +
      formatStudy(pace.done) + '</b><span>llevas</span></div><div><b>' +
      formatStudy(pace.left) + '</b><span>faltan</span></div><div><b>' +
      formatStudy(pace.total) + '</b><span>todo el curso</span></div></div><p class="small muted">' +
      readCount() + " de " + C.lessons.length + " lecciones marcadas. El tiempo es de lectura y práctica. Se cuenta al marcar la lección como estudiada.</p></section>";
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

  const KIND_LABEL = { lesson: "Lección", practice: "Práctica", mock: "Simulacro", review: "Repaso de fallos" };
  const MISS_STEPS = [1, 3, 7];
  const CONFIDENCE = [["se", "Lo sé"], ["creo", "Lo creo"], ["adivino", "Lo adivino"]];

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
    if (!key || key <= todayKey()) return "hoy";
    const parts = key.split("-");
    const months = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
    return Number(parts[2]) + " " + months[Number(parts[1]) - 1];
  }

  function missPace(row) {
    if (row.due && row.due > todayKey()) return "Vuelve el " + formatDay(row.due) + ".";
    const step = row.step || 0;
    if (step >= MISS_STEPS.length) return "Para hoy. Si la aciertas sabiéndola, sale de Fallos.";
    const days = MISS_STEPS[step];
    return "Para hoy. Si la aciertas sabiéndola, el siguiente repaso es en " + days + (days === 1 ? " día." : " días.");
  }

  function missStatus(row) {
    if (row.reason === "guess" && !row.wrong) return "acertada al azar";
    const times = row.wrong || 1;
    return "fallada " + times + (times === 1 ? " vez" : " veces");
  }

  function confidenceControls(selected, act, questionId) {
    const extra = questionId ? ' data-q="' + questionId + '"' : "";
    const chips = CONFIDENCE.map(([id, label]) => '<button type="button" class="chip' + (selected === id ? " active" : "") + '" data-act="' + act + '" data-level="' + id + '"' + extra + ">" + label + "</button>").join("");
    return '<div class="conf"><p class="small muted">Antes de ver la respuesta, marca cómo llegaste a ella.</p><div class="row">' + chips + "</div></div>";
  }

  function whyField(value, attrs, prompt, placeholder) {
    return '<label class="why"><span class="small muted">' + esc(prompt || "En una o dos frases: ¿por qué gana tu opción y por qué pierde la tentadora?") + '</span><textarea rows="3" ' + attrs + ' placeholder="' + esc(placeholder || "La gana porque… La otra pierde porque…") + '">' + esc(value || "") + "</textarea></label>";
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
    if (percent >= 85 && weak.length === 0) {
      return "En este banco estás explicando las decisiones, no solo reconociendo la respuesta. Mantén un simulacro más y vuelve a leer el PDF en los puntos que aún dudes.";
    }
    if (percent >= 70) {
      const names = weak.map((row) => row.item.name).join(", ");
      return names
        ? "Hay base. Antes de agendar, sube estos dominios por encima de un 75% en práctica: " + names + "."
        : "El global está bien y ningún dominio de esta tanda quedó por debajo del 75%. Haz otra tanda: el banco rota.";
    }
    return "Todavía no es momento de sentarte al examen. Vuelve a la lección de cada fallo y dilo en voz alta: por qué la opción tentadora pierde.";
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
      ["inicio", "Inicio"],
      ["ruta", "Ruta"],
      ["mapa", "Mapa"],
      ["tarjetas", "Tarjetas"],
      ["practica", "Práctica"],
      ["fallos", "Fallos" + missBadgeHtml()],
      ["simulacro", "Simulacro"],
      ["escenarios", "Escenarios"],
    ];
    const nav = links.map(([id, label]) => {
      const active = route.name === id ? " active" : "";
      return '<a class="' + active.trim() + '" href="#/' + id + '">' + label + "</a>";
    }).join("");
    app.innerHTML =
      '<div class="shell"><header class="topbar"><a class="brand" href="#/inicio"><strong>CCAR-F</strong><span>Architect Foundations</span></a><nav class="nav">' +
      nav +
      '</nav><div class="progress-pill">' +
      readCount() +
      "/30 lecciones · " +
      dueCount() +
      ' tarjetas</div></header><main class="page' +
      (wide ? "" : " narrow") +
      '">' +
      body +
      "</main></div>";
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
      ? '<p class="callout"><strong>Hay una tanda abierta.</strong> <a href="#/' + (live.kind === "mock" ? "simulacro/examen" : "practica/examen") + '">Volver a la pregunta ' + (live.index + 1) + "</a></p>"
      : "";
    const pace = studyPace();
    const domains = C.domains.map((item) => {
      const lessons = C.lessons.filter((row) => row.domain === item.id);
      const done = lessons.filter((row) => state.lessons[row.id]).length;
      const left = lessons.reduce((sum, row) => sum + (state.lessons[row.id] ? 0 : row.minutes), 0);
      return (
        '<a class="card domain-card" href="#/ruta/' + item.id + '"><i style="background:' + domainStripe(item.id) + '"></i><div class="kicker">Dominio ' +
        item.n + " · " + item.weight + '%</div><div class="weight">' + done + '<span class="small muted">/' + lessons.length + '</span></div><h3>' +
        esc(item.name) + '</h3><p class="small muted">' + done + "/" + lessons.length + " lecciones · " +
        (left ? "faltan " + formatStudy(left) : "listo") + " · " +
        esc(item.blurb) + "</p></a>"
      );
    }).join("");
    const pieces = C.fourPieces.map((row) => "<tr><th>" + esc(row[0]) + "</th><td>" + esc(row[1]) + "</td></tr>").join("");
    const lastBlock = last
      ? '<p>Última tanda: <strong>' + last.correct + "/" + last.total + "</strong> (" + Math.round((100 * last.correct) / last.total) + '%). <a href="#/resultado/' + last.id + '">Ver</a></p>'
      : "<p class=\"muted\">Todavía no hay una tanda guardada.</p>";
    shell(
      "Inicio",
      '<p class="kicker">Examen CCAR-F · Exam Guide v1.0 (julio 2026)</p><h1>Estudia la decisión, no la letra.</h1><p class="lede">60 preguntas en 120 minutos, sobre 4 escenarios de un banco de 6. Hay preguntas de una respuesta y de varias; cada una dice cuántas marcar. El puntaje es escalado de 100 a 1000 y se aprueba con 720. El examen pregunta qué diseño aguanta y por qué la alternativa tentadora falla.</p><div class="row" style="margin:18px 0"><a class="btn" href="#/leccion/' +
        next.id + '">Seguir: ' + esc(next.id) + " " + esc(next.title) + '</a><a class="btn secondary" href="#/tarjetas">Tarjetas de hoy</a><a class="btn secondary" href="#/simulacro">Simulacro</a></div>' +
        paceBox(pace) + '<div class="grid domains">' +
        domains +
        '</div><div class="grid two"><section class="panel"><h2>Las cuatro piezas</h2><p class="muted">Si se confunden, el resto de las preguntas se responde mal.</p><table>' +
        pieces +
        '</table><p class="small" style="margin-top:12px"><a href="#/distinciones">' + C.distinctions.length + ' distinciones</a> · <a href="#/pares">Practicar los pares</a> · <a href="#/glosario">Glosario</a> · <a href="#/logistica">Ruta y logística</a> · <a href="#/fuera">Qué no entra</a></p></section><section class="panel"><h2>Cómo usar esto</h2><ol><li>En cada lección, lee “Qué es, desde cero” y abre “Palabras de esta lección” si un término no te suena.</li><li>Sigue el flujo paso a paso. Luego pulsa “Ponerme a prueba”, intenta adivinar qué pasa en cada rama y toca para comprobarlo.</li><li>Lee los casos “Sale bien” y “Sale mal”, y di la regla con tus palabras.</li><li>Lee el caso del pedido 10091 y abre “Cómo se conecta”. Cada enlace vuelve a la lección de donde salió esa pieza.</li><li>Responde las preguntas del final sin volver arriba. Marca si lo sabes, lo crees o lo adivinas, y escribe por qué antes de ver la respuesta.</li><li>Un fallo vuelve hoy, y luego a 1, 3 y 7 días. Un acierto al azar también queda en Fallos y vuelve mañana.</li><li>En Distinciones, practica los pares: escribe el criterio antes de verlo.</li><li>Cuando un dominio se sienta estable, haz práctica. El simulacro es el ensayo, no el primer contacto.</li></ol>' +
        resume + lastBlock +
        '<p class="small muted">Material original, alineado a los objetivos públicos del examen. No está afiliado a Anthropic. Si el PDF y el producto de hoy discrepan, en la sala manda el PDF.</p></section></div>',
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
          return (row.id + " " + row.title).toLowerCase().includes(query);
        });
        if (!lessons.length) return "";
        const domainLessons = C.lessons.filter((row) => row.domain === item.id);
        const domainLeft = domainLessons.reduce((sum, row) => sum + (state.lessons[row.id] ? 0 : row.minutes), 0);
        const rows = lessons.map((row) => {
          const on = state.lessons[row.id] ? " on" : "";
          return '<a class="lesson-link" href="#/leccion/' + row.id + '"><span class="id">' + esc(row.id) + '</span><span><strong>' + esc(row.title) + '</strong><br><span class="small muted">' + row.minutes + ' min</span></span><span class="done-dot' + on + '"></span></a>';
        }).join("");
        return '<section style="margin:22px 0"><p class="kicker">Dominio ' + item.n + " · " + item.weight + "% · " + (domainLeft ? "faltan " + formatStudy(domainLeft) : "listo") + '</p><h2>' + esc(item.name) + '</h2><p class="muted">' + esc(item.blurb) + '</p><div class="lesson-list">' + rows + "</div></section>";
      }).join("");
    shell(
      "Ruta",
      '<p class="kicker">' + C.lessons.length + " lecciones · " + formatStudy(studyPace().total) + " · faltan " + formatStudy(studyPace().left) + '</p><h1>Ruta por dominio</h1><input class="search" placeholder="Buscar lección" value="' + esc(ui.q) + '">' +
        '<div class="row" style="margin:12px 0">' +
        '<a class="chip' + (route.arg ? "" : " active") + '" href="#/ruta">Todas</a>' +
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
            ? '<em class="d-follows">Sigue en el paso de abajo</em>'
            : (path.end ? '<em class="d-follows">Esta rama termina aquí</em>' : "");
          return '<div class="d-path ' + esc(path.tone || "") + '" data-act="path-reveal"><b>' + esc(path.when) + '</b><div class="d-out"><span>' + esc(path.next) + "</span>" + follow + '</div><small class="d-hidden">Toca para ver qué hace el programa</small></div>';
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
      ? '<button class="btn secondary d-test" data-act="diagram-test">Ponerme a prueba</button>'
      : "";
    return '<figure class="diagram"><div class="spread"><figcaption>' + esc(diagram.title) + "</figcaption>" + test + "</div>" +
      (test ? '<p class="d-help">Lee de arriba abajo. Los círculos con número son pasos que el programa ejecuta; el signo ? es una pregunta, y cada rama dice qué pasa. Con “Ponerme a prueba” se esconden las consecuencias: intenta adivinarlas y tócalas para comprobar.</p>' : "") + body +
      (diagram.caption ? '<p class="d-caption">' + esc(diagram.caption) + "</p>" : "") + "</figure>";
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
        const label = block.tone === "bad" ? "Sale mal" : "Sale bien";
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
      ? '<p class="example-link"><b>Se conecta con</b> ' + esc(example.connect) + "</p>"
      : "";
    return '<div class="example"><span>Ejemplo</span><strong>' + esc(example.title) + "</strong><p>" + esc(example.text) + "</p>" + link + "</div>";
  }

  function renderLesson() {
    const item = lesson(parseRoute().arg);
    if (!item) {
      shell("Lección", "<h1>No está esa lección.</h1>");
      return;
    }
    const index = C.lessons.findIndex((row) => row.id === item.id);
    const prev = C.lessons[index - 1];
    const next = C.lessons[index + 1];
    const d = domain(item.domain);
    const checks = C.questions.filter((q) => q.lesson === item.id).length;
    const done = state.lessons[item.id] ? "Estudiada" : "Marcar como estudiada";
    const introCount = item.blocks.findIndex((block) => block.type !== "p");
    const split = introCount === -1 ? item.blocks.length : introCount;
    const sections = sectionMinutes(item.minutes);
    const diagram = C.diagrams && C.diagrams[item.id]
      ? stepTitle(2, sections[1]) + renderDiagram(C.diagrams[item.id])
      : "";
    const steps = '<ol class="lesson-steps">' + sections.map((section) => "<li>" + esc(section.short) + " <b>" + section.minutes + " min</b></li>").join("") + "</ol>";
    const pace = studyPace();
    const breakdown = sections.map((section) => esc(section.short) + " " + section.minutes + " min").join(" · ");
    shell(
      item.title,
      '<p class="kicker">' + esc(d.name) + " · " + item.minutes + " min</p><h1>" +
        esc(item.id) + " · " + esc(item.title) + '</h1>' + steps + '<div class="prose">' +
        '<div class="goals"><strong>Al terminar sabrás</strong><ul>' + item.objectives.map((row) => "<li>" + esc(row) + "</li>").join("") + "</ul></div>" +
        stepTitle(1, sections[0]) +
        renderBlocks(item.blocks.slice(0, split)) +
        exampleBox(item) +
        termsBox(item) +
        diagram +
        stepTitle(3, sections[2]) +
        renderBlocks(item.blocks.slice(split)) +
        '</div>' + renderBridge(item, sections[3]) + renderLessonCheck(item, sections[4]) +
        '<section class="pace"><p class="kicker">Esta lección</p><div class="pace-nums"><div><b>' + item.minutes +
        ' min</b><span>esta lección</span></div><div><b>' + formatStudy(pace.done) +
        '</b><span>llevas del curso</span></div><div><b>' + formatStudy(pace.left) +
        '</b><span>faltan</span></div></div><p class="small muted">' + breakdown + ". El curso completo son " + formatStudy(pace.total) +
        ". Se suma al marcar la lección.</p></section>" +
        '<div class="row" style="margin-top:18px"><button class="btn" data-act="mark" data-id="' + item.id + '">' + done + '</button><button class="btn secondary" data-act="check-lesson" data-id="' + item.id + '">Repetir como tanda (' + checks + ')</button></div><div class="spread" style="margin-top:22px"><span>' +
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
    return '<details class="terms"><summary>Palabras de esta lección (' + rows.length + ")</summary><dl>" +
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
      ? '<div class="bridge-links"><p class="bridge-links-title">Cómo se conecta con lo anterior</p>' + links + "</div>"
      : '<p class="bridge-base">' + esc(bridge.base || "") + "</p>";
    return '<section class="bridge">' + stepTitle(4, section) + '<p class="small muted">El pedido 10091 recorre todo el curso. Aquí se lee de corrido, y cada enlace vuelve a la lección de donde salió esa pieza.</p><article class="bridge-card"><p class="kicker">El caso</p><h4>' +
      esc(bridge.title) + '</h4><ol class="bridge-beats">' + beats + '</ol><p class="bridge-now"><strong>Lo de esta lección. </strong>' + esc(bridge.now) + "</p></article>" + tail + "</section>";
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
          (guessedRight ? "Acertaste, y la marcaste como adivinada." : grade(q, picked) ? "Correcto. Por qué" : "No es esa. Por qué") +
          "</strong>" + (guessedRight ? "Queda en Fallos y vuelve mañana, para cuando puedas explicar por qué gana. " : "") + esc(q.explain) +
          (q.trap ? '<br><br><strong>La opción tentadora</strong>' + esc(q.trap) : "") + "</div>" +
          (wrote ? '<p class="small"><strong>Lo que escribiste. </strong>' + esc(wrote) + "</p>" : "")
        : confidenceControls(level, "lc-conf", q.id) + whyField(check.notes[q.id] || "", 'data-note="lc" data-q="' + q.id + '"') +
          '<button class="btn" data-act="lc-reveal" data-q="' + q.id + '"' + (picked.length && level ? "" : " disabled") + ">Responder</button>" +
          (picked.length && !level ? '<p class="small muted">Marca si lo sabes, lo crees o lo adivinaste.</p>' : "");
      return '<article class="lc-card"><p class="kicker">Pregunta ' + (n + 1) + " de " + questions.length + " · " + (q.type === "multi" ? "elige " + q.pick : "una respuesta") +
        '</p><p class="lc-stem">' + esc(q.stem) + "</p>" + choices + verdict + "</article>";
    }).join("");
    const score = answered.length
      ? '<p class="lc-score">' + right + " de " + answered.length + " correctas" + (answered.length === questions.length ? (right === questions.length ? ". Dominas este tema." : ". Relee los casos de arriba y vuelve a intentar.") : "") +
        (answered.length ? ' <button class="btn secondary" data-act="lc-reset">Empezar de nuevo</button>' : "") + "</p>"
      : "";
    const heading = section ? stepTitle(5, section) : '<h3 class="step-title"><span>5</span>Comprueba lo que aprendiste</h3>';
    return '<section class="lesson-check">' + heading + '<p class="small muted">Las preguntas están en inglés, como en el examen. La explicación sale en español al responder.</p>' +
      cards + score + "</section>";
  }

  function refreshMissCount() {
    const link = app.querySelector('a[href="#/fallos"]');
    if (link) link.innerHTML = "Fallos" + missBadgeHtml();
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
      ["due", "Para hoy"],
      ["all", "Todas"],
      ["dist", "Distinciones"],
    ].concat(C.domains.map((item) => [item.id, item.n]));
    const chipHtml = chips.map(([id, label]) => '<button class="chip' + (ui.deck === id ? " active" : "") + '" data-act="deck" data-id="' + id + '">' + label + "</button>").join("");
    const card = cardQueue[0];
    let face = '<div class="panel"><h2>No hay tarjetas en este mazo.</h2><p>Si elegiste “para hoy”, ya repasaste lo vencido. Cambia a Todas o espera a mañana.</p></div>';
    if (card) {
      face =
        '<div class="flash" data-act="flip"><div><p class="kicker">' + (cardBack ? "Respuesta" : "Pregunta") + " · " + cardQueue.length + ' en el mazo</p><div class="' +
        (cardBack ? "back" : "face") + '">' + esc(cardBack ? card.back : card.front) + '</div></div><p class="small muted">Toca la tarjeta para voltearla. Con la respuesta a la vista elige otra vez, bien o fácil.</p></div><div class="row flash-actions"><button class="btn bad" data-act="grade" data-id="again">Otra vez</button><button class="btn" data-act="grade" data-id="good">Bien</button><button class="btn good" data-act="grade" data-id="easy">Fácil</button></div>';
    }
    shell("Tarjetas", '<p class="kicker">Repaso</p><h1>Tarjetas</h1><div class="row" style="margin-bottom:14px">' + chipHtml + '</div><div class="flash-wrap">' + face + "</div>");
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
    const options = '<option value="all">Todos los dominios</option>' + C.domains.map((item) => '<option value="' + item.id + '"' + (ui.practiceDomain === item.id ? " selected" : "") + ">" + esc(item.name) + "</option>").join("");
    shell(
      "Práctica",
      '<p class="kicker">Por dominio</p><h1>Práctica</h1><p class="lede">En modo estudio ves la explicación al responder. En modo examen la ves al terminar. Antes marcas si lo sabes, lo crees o lo adivinas. En estudio, escribes el porqué antes de ver la explicación. Las preguntas están en inglés. Si una dice cuántas marcar, elige exactamente ese número.</p><div class="panel"><label>Dominio<br><select id="p-domain">' +
        options +
        '</select></label><label style="display:block;margin-top:10px">Cantidad<br><select id="p-count">' +
        ["5", "10", "20"].map((n) => '<option' + (ui.practiceCount === n ? " selected" : "") + ">" + n + "</option>").join("") +
        '</select></label><label style="display:block;margin-top:10px">Modo<br><select id="p-mode"><option value="study"' +
        (ui.practiceMode === "study" ? " selected" : "") + '>Estudio</option><option value="exam"' +
        (ui.practiceMode === "exam" ? " selected" : "") + ">Examen</option></select></label><div class=\"row\" style=\"margin-top:14px\"><button class=\"btn\" data-act=\"start-practice\">Empezar</button></div></div>"
    );
  }

  function renderMockHome() {
    const counts = C.domains.map((item) => "<li>" + esc(item.name) + ": " + item.mock + " preguntas (" + item.weight + "%)</li>").join("");
    shell(
      "Simulacro",
      '<p class="kicker">60 preguntas · 120 minutos</p><h1>Simulacro</h1><p class="lede">La guía 1.0 fija 60 ítems y 120 minutos. La mezcla de esta app sigue los pesos oficiales. Algunas preguntas piden dos respuestas, como en el examen. En cada una marcas si lo sabes, lo crees o lo adivinas; el reloj sigue igual. El porcentaje de aquí no es el 720 escalado: Anthropic no publica esa conversión.</p><ul>' +
        counts +
        '</ul><button class="btn" data-act="start-mock">Empezar simulacro</button><p class="small muted">Salir o recargar no borra la tanda: queda en esta pestaña hasta que la envíes.</p>'
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
      shell("Examen", '<h1>No hay una tanda abierta.</h1><a href="#/practica">Volver</a>');
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
      ? '<div class="callout ' + (guessedRight ? "trampa" : "") + '"><strong>' + (guessedRight ? "Acertaste, y la marcaste como adivinada" : "Por qué") + "</strong>" +
        (guessedRight ? "Queda en Fallos y vuelve mañana. " : "") + esc(q.explain) +
        (q.trap ? '<br><br><strong>La opción tentadora</strong> ' + esc(q.trap) : "") + "</div>" +
        (wrote ? '<p class="small"><strong>Lo que escribiste. </strong>' + esc(wrote) + "</p>" : "")
      : "";
    const beforeAnswer = !locked && live.mode === "study"
      ? confidenceControls(level, "conf") + whyField(live.notes[q.id] || "", 'data-note="quiz"') +
        (picked.length && !level ? '<p class="small muted">Marca si lo sabes, lo crees o lo adivinaste.</p>' : "")
      : "";
    const examConfidence = live.mode === "exam"
      ? confidenceControls(level, "conf") + (picked.length && !level ? '<p class="small muted">Marca si lo sabes, lo crees o lo adivinaste para seguir.</p>' : "")
      : "";
    const grid = live.questionIds.map((id, index) => {
      const flagged = live.flags[id] ? " flagged" : "";
      const answered = live.answers[id] && live.answers[id].length ? " answered" : "";
      const on = index === live.index ? " on" : "";
      return '<button class="' + (on + answered + flagged).trim() + '" data-act="goto" data-index="' + index + '">' + (index + 1) + "</button>";
    }).join("");
    const timer = live.deadline
      ? '<div class="timer' + (live.deadline - Date.now() < 600000 ? " low" : "") + '" data-timer>' + formatLeft(live.deadline - Date.now()) + "</div>"
      : '<div class="muted">Pregunta ' + (live.index + 1) + " / " + live.questionIds.length + "</div>";
    const d = domain(q.domain);
    shell(
      "Tanda",
      '<div class="grid two quiz-board"><article><div class="spread"><div class="q-meta"><span class="tag">' + esc(d.n) + " " + esc(d.name) + '</span><span class="tag">' +
        (multi ? "Elige " + q.pick : "Una respuesta") + "</span>" +
        (live.flags[q.id] ? '<span class="tag">Marcada</span>' : "") +
        '</div>' + timer + '</div><h2 style="font-family:Segoe UI,sans-serif;font-size:22px;letter-spacing:0">' +
        esc(q.stem) + "</h2>" + choices + explain + beforeAnswer + examConfidence +
        '<div class="row" style="margin-top:8px"><button class="btn secondary" data-act="flag">Marcar</button>' +
        (live.mode === "study" && !live.revealed ? '<button class="btn" data-act="reveal"' + (ready ? "" : " disabled") + ">Responder</button>" : "") +
        (live.mode === "exam" || live.revealed ? '<button class="btn" data-act="next"' + (live.mode === "exam" && picked.length && !level ? " disabled" : "") + ">Siguiente</button>" : "") +
        '<button class="btn secondary" data-act="finish">Enviar tanda</button></div></article><aside class="panel"><p class="kicker">Navegación</p><div class="q-grid">' +
        grid + "</div></aside></div>",
      true
    );
  }

  function renderResult() {
    const record = state.history.find((item) => item.id === parseRoute().arg) || state.history[0];
    if (!record) {
      shell("Resultado", "<h1>No hay resultados.</h1>");
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
      const chosen = (record.answers[id] || []).map((index) => q.choices[index]).join(" · ") || "Sin respuesta";
      const right = q.answer.map((index) => q.choices[index]).join(" · ");
      const note = String(((record.notes || {})[id] || (state.notes || {})[id] || "")).trim();
      const level = (record.confidence || {})[id];
      const marked = level === "se" ? "La marcaste como sabida." : level === "creo" ? "La marcaste como creída." : level === "adivino" ? "La marcaste como adivinada." : "";
      return '<article class="panel" style="margin:10px 0"><p class="small muted">' + esc(lesson(q.lesson).id) + " · " + esc(lesson(q.lesson).title) + '</p><p><strong>' + esc(q.stem) + "</strong></p><p>Elegiste: " + esc(chosen) + "</p><p>Respuesta: " + esc(right) + "</p>" +
        (marked ? "<p>" + marked + "</p>" : "") +
        (note ? "<p><strong>Lo que escribiste. </strong>" + esc(note) + "</p>" : "") +
        "<p>" + esc(q.explain) + '</p><p><a href="#/leccion/' + q.lesson + '">Volver a la lección</a></p></article>';
    };
    const review = wrong.map(reviewCard).join("");
    const guessReview = guessed.map(reviewCard).join("");
    shell(
      "Resultado",
      '<p class="kicker">' + esc(KIND_LABEL[record.kind] || record.kind) + "</p><h1>" + record.correct + " / " + record.total + " · " + percent + '%</h1><p class="lede">' +
        esc(advice(percent, record.byDomain)) + "</p>" + confidenceLine(record) + '<p class="small muted">El examen real informa un puntaje escalado de 100 a 1000, y el mínimo para aprobar es 720. El 720 no es “72% de aciertos”. Este porcentaje es de práctica: úsalo para ver huecos, no como nota oficial.</p>' +
        bars + '<h2 style="margin-top:28px">Fallos</h2>' + (review || "<p>Ninguno en esta tanda.</p>") +
        (guessReview ? '<h2 style="margin-top:28px">Acertadas al azar</h2><p>Estas vuelven mañana en Fallos. Un acierto que no puedes explicar sigue pendiente.</p>' + guessReview : ""),
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
    if (known) parts.push(known + (known === 1 ? " sabida" : " sabidas"));
    if (believed) parts.push(believed + (believed === 1 ? " creída" : " creídas"));
    if (guessed) parts.push(guessed + (guessed === 1 ? " adivinada" : " adivinadas"));
    let text = "De las que acertaste: " + parts.join(", ").replace(/, ([^,]+)$/, " y $1") + ".";
    if (guessed) text += guessed === 1 ? " La adivinada quedó en Fallos y vuelve mañana." : " Las adivinadas quedaron en Fallos y vuelven mañana.";
    return "<p>" + text + "</p>";
  }

  function renderScenarios() {
    const route = parseRoute();
    if (route.arg) {
      const item = C.scenarios.find((row) => row.id === route.arg);
      if (!item) {
        shell("Escenario", "<h1>No está.</h1>");
        return;
      }
      const rows = item.decisions.map((row) => '<article class="panel" style="margin:10px 0"><p class="small"><a href="#/leccion/' + row.lesson + '">Lección ' + row.lesson + "</a></p><h3>" + esc(row.q) + "</h3><p>" + esc(row.a) + "</p></article>").join("");
      shell("Escenario", '<p class="kicker">Escenario de estudio</p><h1>' + esc(item.title) + "</h1><p class=\"lede\">" + esc(item.brief) + "</p>" + rows + '<p><a href="#/escenarios">Todos los escenarios</a></p>');
      return;
    }
    const cards = C.scenarios.map((item) => '<a class="card" href="#/escenarios/' + item.id + '"><p class="kicker">' + item.domains.map((id) => domain(id).n).join(" · ") + "</p><h3>" + esc(item.title) + "</h3><p>" + esc(item.brief) + "</p></a>").join("");
    shell("Escenarios", '<p class="kicker">4 de estos 6 salen en cada examen</p><h1>Escenarios</h1><p class="lede">No son preguntas filtradas. Son los seis encargos que la guía publica, traducidos a las decisiones que ya estudiaste.</p><div class="grid cards">' + cards + "</div>", true);
  }

  function renderMissCard(id, open) {
    const q = question(id);
    const row = state.misses[id];
    const item = lesson(q.lesson);
    const note = String((state.notes || {})[id] || "").trim();
    const head = '<article class="panel miss' + (open ? "" : " later") + '"><p class="small muted"><a href="#/leccion/' + esc(q.lesson) + '">' + esc(item.id + " · " + item.title) + "</a> · " + esc(missStatus(row)) + " · " + esc(missPace(row)) + "</p><p><strong>" + esc(q.stem) + "</strong></p>";
    if (!open) return head + "</article>";
    const right = q.answer.map((index) => q.choices[index]).join(" · ");
    return head + "<p>Respuesta: " + esc(right) + "</p>" +
      (note ? "<p><strong>Lo que escribiste. </strong>" + esc(note) + "</p>" : "") +
      "<p>" + esc(q.explain) + "</p>" +
      (q.trap ? "<p><strong>La opción tentadora.</strong> " + esc(q.trap) + "</p>" : "") +
      '<button class="btn secondary" data-act="miss-dismiss" data-id="' + esc(id) + '">Ya lo tengo</button></article>';
  }

  function renderMisses() {
    const due = dueMisses().sort(byLessonOrder);
    const later = pendingMisses().filter((id) => due.indexOf(id) === -1).sort(byLessonOrder);
    if (!due.length && !later.length) {
      shell("Fallos", '<p class="kicker">Repaso</p><h1>Fallos</h1><div class="panel"><h2>No tienes fallos pendientes.</h2><p>Cada respuesta fallada en una lección, en práctica o en un simulacro queda aquí con su explicación y su opción tentadora. Vuelve hoy, y si la aciertas sabiéndola, otra vez en 1 día, luego a los 3 y luego a los 7. Un acierto marcado como adivinado también entra y vuelve mañana.</p></div>', true);
      return;
    }
    const review = due.length
      ? '<div class="row" style="margin-bottom:14px"><button class="btn" data-act="miss-review">' + (due.length === 1 ? "Repasar el de hoy" : "Repasar los " + due.length + " de hoy") + "</button></div>" + due.map((id) => renderMissCard(id, true)).join("")
      : '<div class="panel"><h2>Nada para hoy.</h2><p>El siguiente vuelve el ' + esc(formatDay(later.map((id) => state.misses[id].due).sort()[0])) + ".</p></div>";
    const waiting = later.length
      ? '<h2 style="margin-top:28px">Vuelven después</h2><p class="muted">La respuesta queda tapada hasta ese día, para que el repaso cuente.</p>' + later.map((id) => renderMissCard(id, false)).join("")
      : "";
    shell(
      "Fallos",
      '<p class="kicker">' + due.length + " para hoy · " + later.length + ' más adelante</p><h1>Fallos</h1><p class="lede">Un fallo vuelve hoy. Si lo aciertas sabiéndolo, el siguiente repaso es en 1 día, luego a los 3 y luego a los 7. Un acierto al azar vuelve mañana. “Ya lo tengo” lo quita a mano.</p>' + review + waiting,
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
      const titleLines = wrapLabel(item.title, 19, 2).map((text, line) => '<text class="t" x="' + (x + 12) + '" y="' + (y + 31 + line * 13) + '">' + esc(text) + "</text>").join("");
      return '<a href="#/mapa/' + esc(item.id) + '"><g class="' + cls + '"><rect x="' + x + '" y="' + y + '" width="' + MAP_HALF_WIDTH * 2 + '" height="' + MAP_HALF_HEIGHT * 2 +
        '" rx="10"/><rect class="stripe" x="' + x + '" y="' + y + '" width="5" height="' + MAP_HALF_HEIGHT * 2 + '" rx="2" style="fill:var(--' + item.domain + ')"/><text class="id" x="' + (x + 12) + '" y="' + (y + 16) + '">' + esc(item.id) + "</text>" + titleLines + "</g></a>";
    }).join("");
    return '<svg class="map' + (selected ? " focused" : "") + '" viewBox="0 0 1120 660" role="img" aria-label="Mapa de conexiones entre las 30 lecciones"><defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="var(--accent)"/></marker></defs>' +
      lanes + edges + nodes + "</svg>";
  }

  function mapDetail(selected) {
    const item = lesson(selected);
    if (!item) return '<p class="small muted">Elige una lección para ver con qué se conecta y qué la usa después.</p>';
    const own = ((C.bridges[item.id] && C.bridges[item.id].links) || []).map((link) => {
      const source = lesson(link.id);
      return "<li><a href=\"#/mapa/" + esc(link.id) + '"><strong>' + esc(source.id + " · " + source.title) + "</strong></a><br>" + esc(link.text) + "</li>";
    }).join("");
    const later = mapLinks().filter((link) => link.from === item.id).map((link) => {
      const target = lesson(link.to);
      return "<li><a href=\"#/mapa/" + esc(link.to) + '"><strong>' + esc(target.id + " · " + target.title) + "</strong></a><br>" + esc(link.text) + "</li>";
    }).join("");
    return '<article class="panel map-detail"><p class="kicker">' + esc(item.id) + ' · ' + esc(domain(item.domain).name) + "</p><h2>" + esc(item.title) + '</h2><div class="grid two"><div><h3>Se apoya en</h3>' +
      (own ? "<ul>" + own + "</ul>" : '<p class="muted">Es la base del caso: no depende de una lección anterior.</p>') +
      "</div><div><h3>La usan después</h3>" + (later ? "<ul>" + later + "</ul>" : '<p class="muted">Todavía no la retoma otra lección.</p>') +
      '</div></div><p><a class="btn" href="#/leccion/' + esc(item.id) + '">Abrir la lección</a></p></article>';
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
      "Mapa",
      '<p class="kicker">Conexiones</p><h1>Mapa de conexiones</h1><p class="lede">Cada dominio agrupa sus lecciones. Una conexión va de donde salió una pieza a la lección que la usa. Elige una para ver solo las suyas. El pedido 10091 sigue el mismo hilo en todas.</p><div class="map-wrap">' +
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
    const cards = C.distinctions.map((row) => '<article class="dist-card"><b>' + esc(row[0]) + '</b><span>frente a</span><b>' + esc(row[1]) + "</b><p>" + esc(row[2]) + "</p></article>").join("");
    shell(
      "Distinciones",
      '<p class="kicker">Repaso rápido</p><h1>La opción correcta es una distinción</h1><p>Si puedes explicar la fila sin mirar la tercera columna, esa pregunta ya no te sorprende. En el drill escribes el criterio y después lo comparas con la regla.</p><p><a class="btn" href="#/pares">Practicar los pares</a> <span class="small muted">' + (due ? due + " en la tanda de hoy, de " + C.distinctions.length : "ninguno vencido: puedes hacer una tanda libre") + '</span></p><div class="dist-cards">' + cards + '</div><table class="dist-table"><tr><th>Esto</th><th>No lo confundas con</th><th>Regla</th></tr>' + rows + "</table>",
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
        "Pares",
        '<p class="kicker">Distinciones</p><h1>Listo por hoy.</h1><p class="lede">Repasaste ' + pair.done + " pares. Los que marcaste como no sabidos vuelven en Tarjetas y en esta misma práctica.</p><div class=\"row\"><a class=\"btn secondary\" href=\"#/distinciones\">Ver la tabla</a><button class=\"btn\" data-act=\"pair-restart\">Otra tanda</button></div>"
      );
      return;
    }
    const row = C.distinctions[current];
    const body = pair.revealed
      ? '<p class="small"><strong>Lo que escribiste. </strong>' + (pair.note.trim() ? esc(pair.note) : "Nada todavía. Léelo y márcalo según si te salía.") + '</p><div class="callout"><strong>El criterio</strong>' + esc(row[2]) + '</div><p class="small muted">Lo tenía alarga el plazo. A medias lo deja en el repaso corto. No lo tenía lo vuelve a dejar para hoy.</p><div class="row"><button class="btn good" data-act="pair-grade" data-id="easy">Lo tenía</button><button class="btn" data-act="pair-grade" data-id="good">A medias</button><button class="btn bad" data-act="pair-grade" data-id="again">No lo tenía</button></div>'
      : whyField(pair.note, 'data-note="pair"', "Escribe cuándo eliges el primero y cuándo el segundo.", "Elijo el primero cuando… El segundo cuando…") + '<button class="btn" data-act="pair-reveal">Ver el criterio</button>';
    shell(
      "Pares",
      '<p class="kicker">Par ' + (pair.done + 1) + " de " + pair.total + (pair.free ? " · práctica libre" : " · para hoy") + '</p><h1>¿Cuándo eliges cada uno?</h1><div class="pair"><b>' + esc(row[0]) + '</b><span class="vs">frente a</span><b>' + esc(row[1]) + "</b></div>" + body +
        '<p class="small" style="margin-top:18px"><button class="btn secondary" data-act="pair-all">Practicar todos los pares</button> <a href="#/distinciones">Ver la tabla</a></p>'
    );
  }

  function renderGlossary() {
    const query = ui.q.trim().toLowerCase();
    const rows = C.glossary
      .filter((row) => !query || (row[0] + row[1]).toLowerCase().includes(query))
      .map((row) => "<tr><th>" + esc(row[0]) + "</th><td>" + esc(row[1]) + "</td></tr>")
      .join("");
    shell("Glosario", '<p class="kicker">Términos</p><h1>Glosario</h1><input class="search" placeholder="Buscar término" value="' + esc(ui.q) + '"><table>' + rows + "</table>", true);
  }

  function renderOut() {
    shell(
      "Fuera de alcance",
      '<p class="kicker">No estudies esto para este examen</p><h1>Qué deja fuera la guía</h1><ul>' +
        C.outOfScope.map((item) => "<li>" + esc(item) + "</li>").join("") +
        "</ul><p>Message Batches sí entra como decisión de arquitectura. De prompt caching basta con saber que existe. Los precios y la facturación no entran.</p>"
    );
  }

  function extraStudy() {
    const prep = C.prep.map((row) => "<li><strong>" + esc(row[0]) + ".</strong> " + esc(row[1]) + "</li>").join("");
    const drift = C.drift.map((row) => "<li><strong>" + esc(row[0]) + ".</strong> " + esc(row[1]) + "</li>").join("");
    const sources = C.sources.map((row) => '<li><a href="' + esc(row[1]) + '">' + esc(row[0]) + "</a>. " + esc(row[2]) + "</li>").join("");
    return '<h2 style="margin-top:28px">Cómo preparar, según la guía y lo público</h2><ul>' + prep + '</ul><h2>Dónde el producto de hoy no coincide con la guía</h2><p class="small muted">Estas diferencias salen de la documentación actual de Claude comparada con la guía 1.0. En el examen se responde como la guía.</p><ul>' + drift + '</ul><h2>Dónde seguir leyendo</h2><ul>' + sources + "</ul>";
  }

  function samplesBlock() {
    const rows = C.samples.map((row) => "<li><strong>" + esc(row[0]) + ":</strong> " + esc(row[1]) + "</li>").join("");
    return '<h2 style="margin-top:28px">Preguntas de muestra de la guía, por tema</h2><p class="small muted">La guía 1.0 publica 12 preguntas de muestra. Aquí solo se indica el tema. Las preguntas de esta app son originales, y el contenido del examen real no se puede copiar ni compartir.</p><ul>' + rows + "</ul>";
  }

  function renderLogistics() {
    const items = C.checklist.map((item) => {
      const on = state.checklist[item.id] ? " checked" : "";
      return '<label class="checkline"><input type="checkbox" data-act="check" data-id="' + item.id + '"' + on + '><span><strong>' + esc(item.title) + "</strong><br><span class=\"muted\">" + esc(item.detail) + "</span></span></label>";
    }).join("");
    shell(
      "Logística",
      '<p class="kicker">Pearson VUE</p><h1>Antes de sentarte</h1><div class="panel">' + items + '</div><h2 style="margin-top:28px">Datos y de dónde salen</h2><table><tr><th>Dato</th><th>Lo que se informa</th><th>Fuente</th></tr><tr><td>Formato</td><td>60 ítems, 120 minutos. Una o varias respuestas; la pregunta dice cuántas. 4 escenarios de 6.</td><td>Exam Guide v1.0, julio 2026.</td></tr><tr><td>Aprobado</td><td>720 en escala 100–1000. El informe muestra el porcentaje por dominio, pero no decide el resultado.</td><td>Exam Guide v1.0, sección 10.</td></tr><tr><td>Precio</td><td>125 USD por intento en la guía. En el checkout de partner puede haber descuento.</td><td>Guía 1.0. Confírmalo al pagar.</td></tr><tr><td>Reintentos</td><td>14 días, luego 30, luego 90. Máximo 4 intentos del mismo examen en 12 meses. Si apruebas, no se puede repetir para subir nota.</td><td>Guía 1.0 y la página de políticas de Partner Academy.</td></tr><tr><td>Vigencia</td><td>12 meses. Renovar a tiempo es una evaluación gratuita y sin vigilancia. Si caduca, se repite el examen de pago.</td><td>Guía 1.0, sección 15.</td></tr><tr><td>Cancelar la cita</td><td>La guía dice 24 horas. Pearson VUE, el 9 de noviembre de 2026, dice 48 horas. Usa 48 para no perder la tarifa.</td><td>Guía sección 11 y pearsonvue.com/us/en/anthropic.html.</td></tr><tr><td>Cambio de contenido</td><td>El 7 de diciembre de 2026 cambian Associate, Developer y Architect Professional. CCAR-F no está en esa lista. Las guías nuevas de esos otros exámenes salen el 17 de noviembre de 2026.</td><td>Pearson VUE, página de Anthropic.</td></tr></table>' + extraStudy() + samplesBlock() + '<h2>Accesos para practicar de verdad</h2><ul><li>Revisa si tu organización ofrece licencias de práctica para Claude Code y la API. Si no, usa una cuenta propia con un tope de gasto bajo.</li><li>La API key se crea en console.anthropic.com. Pon un límite de gasto antes de usarla en los ejercicios.</li></ul><h2>Si el correo de Pearson no llega</h2><p>Espera 3 días hábiles y escribe a certifications-support@anthropic.com. El nombre del ID tiene que coincidir con el registro. Después de aprobar, comparte la URL de Credly en el portal que indique tu programa de partners.</p><p><a href="https://claudecertificationguide.com/learn">Mapa de lecciones (guía externa)</a> · <a href="https://anthropic-partners.skilljar.com/path/claude-architect">Learning path en Skilljar</a></p><p class="small muted">El path de Skilljar puede haber migrado al portal nuevo de partners. Si un enlace pide cuenta vieja, entra por el portal de tu programa de partners y descarga el PDF desde la ficha del examen.</p><button class="btn secondary" data-act="reset">Borrar progreso de esta app</button>'
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
      node.textContent = figure.classList.contains("testing") ? "Mostrar todo" : "Ponerme a prueba";
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
        if (window.confirm("Es la última pregunta. ¿Enviar la tanda?")) finishLive();
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
      if (window.confirm("¿Enviar la tanda con lo que llevas respondido?")) finishLive();
      return;
    }
    if (act === "reset") {
        if (window.confirm("Esto borra lecciones, tarjetas, fallos y resultados solo en este navegador.")) {
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
