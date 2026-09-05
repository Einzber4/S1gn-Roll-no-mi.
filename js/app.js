/* ==================================================
   EINZBERN ROULETTE — V1.0.9
   app.js — Reconstructed
   ================================================== */

const KEY = "einzbern-roulette-v1";

const defaultData = {
  categories: {
    "Problemas / Dúvidas": ["Questão para analisar"],
    "Jogos": [
      "Wuthering Waves",
      "Honkai: Star Rail",
      "Honkai Impact 3rd"
    ],
    "Sugestões / Projetos": [
      "Roleta",
      "Rich Presence do Discord"
    ],
    "Músicas": [],
    "Imagens": []
  }
};


/* ==================================================
   ESTADO
   ================================================== */

let data;

try {
  data =
    JSON.parse(localStorage.getItem(KEY) || "null") ||
    structuredClone(defaultData);
} catch {
  data = structuredClone(defaultData);
}

let selectedCategory = "Problemas / Dúvidas";
let lastWheelSignature = "";
let spinning = false;
let currentRotation = 0;
let pendingResult = null;


/* ==================================================
   DISCORD RICH PRESENCE
   ================================================== */

async function updateRichPresence(details) {
  try {
    const response = await fetch(
      "http://127.0.0.1:6464/presence",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          details,
          state: "Working on a Project."
        })
      }
    );

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error(
        "[RPC] Falha ao atualizar:",
        result
      );

      return;
    }

    console.log(
      "[RPC] Activity atualizada:",
      details
    );
  } catch (error) {
    console.error(
      "[RPC] Bridge indisponível:",
      error
    );
  }
}


/* ==================================================
   ELEMENTOS
   ================================================== */

const wheel = document.querySelector("#wheel");
const spinButton = document.querySelector("#spin");
const result = document.querySelector("#result");
const resultActions = document.querySelector("#resultActions");

const confirmButton = document.querySelector("#confirm");
const rejectButton = document.querySelector("#reject");
const cancelButton = document.querySelector("#cancel");

const cats = document.querySelector("#cats");
const list = document.querySelector("#list");
const title = document.querySelector("#title");
const count = document.querySelector("#count");
const progress = document.querySelector("#progress");

const addForm = document.querySelector("#addForm");
const newItem = document.querySelector("#newItem");
const resetCycleButton = document.querySelector("#resetCycle");


/* ==================================================
   PERSISTÊNCIA
   ================================================== */

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}


/* ==================================================
   CICLO
   ================================================== */

function getCycleKey(category) {
  return `cycle_${category}`;
}

function getCycle(category) {
  const key = getCycleKey(category);
  const stored = localStorage.getItem(key);

  if (!stored) {
    return [];
  }

  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCycle(category, cycle) {
  localStorage.setItem(
    getCycleKey(category),
    JSON.stringify(cycle)
  );
}

function resetCycle() {
  saveCycle(selectedCategory, []);

  void updateRichPresence("Resetting The Cycle.");

  pendingResult = null;
  clearResult();
  hideResultActions();

  renderProgress();
}

function renderProgress() {
  if (!progress) return;

  const options =
    data.categories[selectedCategory] || [];

  const cycle =
    getCycle(selectedCategory);

  const used =
    cycle.filter(option =>
      options.includes(option)
    ).length;

  progress.textContent =
    `${used}/${options.length} utilizadas`;
}


/* ==================================================
   RESULTADO
   ================================================== */

function showResult(option) {
  if (!result) return;

  result.innerHTML = "";

  const strong =
    document.createElement("strong");

  strong.textContent = option;

  result.appendChild(strong);
}

function clearResult() {
  if (!result) return;

  result.innerHTML =
    '<span class="muted">Nenhum resultado.</span>';
}

function showResultActions() {
  if (!resultActions) return;

  resultActions.classList.remove("hidden");
}

function hideResultActions() {
  if (!resultActions) return;

  resultActions.classList.add("hidden");
}


/* ==================================================
   NOMES E SETORES DA ROLETA
   ================================================== */

function renderWheelNames() {
  if (!wheel) return;

  const options =
    data.categories[selectedCategory] || [];

  const visibleOptions =
    options.slice(0, 5);

  const signature =
    `${selectedCategory}|${visibleOptions.join("\u001f")}`;

  if (signature === lastWheelSignature) {
    return;
  }

  lastWheelSignature = signature;

  wheel
    .querySelectorAll(".wheel-label")
    .forEach(label => label.remove());

  const totalSectors =
    visibleOptions.length;

  if (totalSectors === 0) {
    wheel.style.background =
      "radial-gradient(circle, #171c25 0%, #0c1016 100%)";

    return;
  }

  const