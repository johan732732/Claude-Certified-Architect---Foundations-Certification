"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function load(rel, sandbox) {
  const file = path.join(root, rel);
  if (!fs.existsSync(file)) {
    fail("No está el archivo " + rel);
    return;
  }
  vm.runInContext(fs.readFileSync(file, "utf8"), sandbox, { filename: rel });
}

function sandbox() {
  const context = { console };
  context.window = context;
  vm.createContext(context);
  return context;
}

const contentFiles = [
  "content/es/meta.js",
  "content/es/lessons.js",
  "content/es/questions.js",
  "content/es/cards.js",
  "content/es/extra.js",
  "content/es/diagrams.js",
  "content/es/bridges.js",
  "content/es/examples.js",
  "content/es/traces.js",
];
const englishFiles = [
  "content/en/lessons.js",
  "content/en/questions.js",
  "content/en/meta.js",
  "content/en/narrative.js",
  "content/en/traces.js",
];

const context = sandbox();
contentFiles.forEach((rel) => load(rel, context));

const dictionaries = englishFiles.map((rel) => {
  const isolated = sandbox();
  load(rel, isolated);
  return { rel, dict: (isolated.CCARF && isolated.CCARF.en) || {} };
});

dictionaries.forEach(({ rel }) => load(rel, context));
load("content/es/ui.js", context);
load("content/en/ui.js", context);

const C = context.CCARF;
if (!C || !C.lessons || !C.questions || !C.ui || !C.ui.es || !C.ui.en || !C.en) {
  fail("El contenido no dejó CCARF.lessons, CCARF.questions, CCARF.ui.es, CCARF.ui.en y CCARF.en.");
}

const dict = (C && C.en) || {};
const skipFields = new Set(["code", "id", "domain", "lesson", "type", "answer", "pick", "minutes", "weight", "mock", "n", "kind", "layout", "tone", "stem", "choices"]);
const spanish = /[áéíóúñÁÉÍÓÚÑ¿¡]|\b(el|la|los|las|que|para|con|una|del|cuando|está|también|porque|qué|cómo|dónde|esto|esta|este|hay|son|más|pero|sin|sobre|entre|desde|hasta|según|donde|como)\b/i;
const seen = new Set();

function walk(value, field, trail) {
  if (typeof value === "string") {
    if (skipFields.has(field) || value.startsWith("http") || !spanish.test(value) || seen.has(value)) return;
    seen.add(value);
    if (!Object.prototype.hasOwnProperty.call(dict, value)) fail("Sin traducción en inglés: " + trail + " :: " + value.slice(0, 160));
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => walk(item, field, trail + "[" + index + "]"));
    return;
  }
  if (value && typeof value === "object") {
    Object.keys(value).forEach((key) => {
      if (key === "en" || key === "ui") return;
      walk(value[key], key, trail + "." + key);
    });
  }
}

if (C) walk(C, "", "CCARF");

const owners = new Map();
dictionaries.forEach(({ rel, dict: part }) => {
  Object.keys(part).forEach((key) => {
    if (part[key] === "") fail("Traducción vacía en " + rel + ": " + key.slice(0, 80));
    const previous = owners.get(key);
    if (previous && previous.value !== part[key]) {
      fail("La misma frase española tiene dos traducciones distintas (" + previous.rel + " y " + rel + "): " + key.slice(0, 80));
    } else if (!previous) {
      owners.set(key, { rel, value: part[key] });
    }
  });
});

function leaves(value, trail, found) {
  if (typeof value === "string") {
    if (value.trim() === "") found.push(trail + " está vacía");
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) found.push(trail + " está vacía");
    value.forEach((item, index) => leaves(item, trail + "[" + index + "]", found));
    return;
  }
  if (value && typeof value === "object") {
    Object.keys(value).forEach((key) => leaves(value[key], trail + "." + key, found));
  }
}

if (C && C.ui && C.ui.es && C.ui.en) {
  const esKeys = Object.keys(C.ui.es);
  const enKeys = Object.keys(C.ui.en);
  esKeys.filter((key) => !Object.prototype.hasOwnProperty.call(C.ui.en, key)).forEach((key) => fail("Falta la clave de interfaz en inglés: " + key));
  enKeys.filter((key) => !Object.prototype.hasOwnProperty.call(C.ui.es, key)).forEach((key) => fail("Falta la clave de interfaz en español: " + key));
  esKeys.forEach((key) => {
    const esEmpty = [];
    const enEmpty = [];
    leaves(C.ui.es[key], "es." + key, esEmpty);
    leaves(C.ui.en[key], "en." + key, enEmpty);
    esEmpty.forEach(fail);
    enEmpty.forEach(fail);
    if (Array.isArray(C.ui.es[key]) && Array.isArray(C.ui.en[key]) && C.ui.es[key].length !== C.ui.en[key].length) {
      fail("La clave " + key + " tiene " + C.ui.es[key].length + " ítems en español y " + C.ui.en[key].length + " en inglés.");
    }
  });
}

function usedUiKeys(source) {
  const keys = new Set();
  const call = /\bt{1,2}\(/g;
  let match;
  while ((match = call.exec(source))) {
    const slice = source.slice(match.index + match[0].length, match.index + match[0].length + 500);
    const head = slice.split("{")[0].split(")")[0];
    const literal = /["']([A-Za-z][A-Za-z0-9_]*)["']/g;
    let item;
    while ((item = literal.exec(head))) {
      if (!item[1].endsWith("_")) keys.add(item[1]);
    }
    if (head.includes("kind_")) ["lesson", "practice", "mock", "review"].forEach((kind) => keys.add("kind_" + kind));
  }
  const confidence = source.match(/CONFIDENCE = \[([\s\S]*?)\];/);
  if (confidence) {
    const literal = /["']([A-Za-z][A-Za-z0-9_]*)["']/g;
    let item;
    while ((item = literal.exec(confidence[1]))) {
      if (!["se", "creo", "adivino"].includes(item[1])) keys.add(item[1]);
    }
  }
  const started = /startQuiz\(\s*["']([A-Za-z0-9_]+)["']/g;
  let kind;
  while ((kind = started.exec(source))) keys.add("kind_" + kind[1]);
  return keys;
}

if (C && C.ui && C.ui.es) {
  const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
  [...usedUiKeys(app)].filter((key) => !Object.prototype.hasOwnProperty.call(C.ui.es, key)).forEach((key) => {
    fail("app.js pide la clave de interfaz " + key + " y no está en content/es/ui.js.");
  });
}

const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]);
scripts.forEach((src) => {
  if (!fs.existsSync(path.join(root, src))) fail("index.html carga un archivo que no existe: " + src);
});

function folderScripts(dir) {
  const absolute = path.join(root, dir);
  if (!fs.existsSync(absolute)) {
    fail("No está la carpeta " + dir);
    return [];
  }
  return fs.readdirSync(absolute).filter((name) => name.endsWith(".js")).map((name) => dir + "/" + name).sort();
}

folderScripts("content/es").concat(folderScripts("content/en")).forEach((rel) => {
  if (!scripts.includes(rel)) fail("index.html no carga " + rel);
});

const firstEnglish = scripts.findIndex((src) => src.startsWith("content/en/"));
const lastSpanish = scripts.reduce((last, src, index) => (src.startsWith("content/es/") ? index : last), -1);
if (firstEnglish !== -1 && lastSpanish > firstEnglish) {
  fail("Un script de content/es se carga después de content/en. El español tiene que cargarse primero.");
}
if (scripts[scripts.length - 1] !== "app.js") fail("app.js tiene que ser el último script de index.html.");

if (failures.length) {
  console.error("Fallaron " + failures.length + " comprobaciones de idioma:\n");
  failures.forEach((message) => console.error("- " + message));
  process.exit(1);
}

console.log("Idioma en orden: " + seen.size + " textos de estudio con traducción, " + Object.keys(C.ui.es).length + " claves de interfaz en los dos idiomas, " + scripts.length + " scripts cargados.");
