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
   NOMES DA ROLETA
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

  const totalSectors = 5;
  const slice = 360 / totalSectors;
  const radius = 30;

  const fragment =
    document.createDocumentFragment();

  visibleOptions.forEach((option, index) => {
    const angle =
      index * slice + slice / 2;

    const radians =
      (angle - 90) * Math.PI / 180;

    const label =
      document.createElement("div");

    label.className = "wheel-label";

    label.style.position = "absolute";

    label.style.left =
      `${50 + Math.cos(radians) * radius}%`;

    label.style.top =
      `${50 + Math.sin(radians) * radius}%`;

    label.style.transform =
      "translate(-50%, -50%)";

    label.style.width = "25%";
    label.style.textAlign = "center";

    const text =
      document.createElement("span");

    text.textContent = option;

    label.appendChild(text);
    fragment.appendChild(label);
  });

  wheel.appendChild(fragment);
}


/* ==================================================
   CATEGORIAS
   ================================================== */

function selectCategory(category) {
  if (!data.categories[category]) return;
  if (spinning) return;

  selectedCategory = category;

  void updateRichPresence("Creating The S1gn.");

  lastWheelSignature = "";
  pendingResult = null;

  hideResultActions();
  clearResult();

  renderCategories();
  renderOptions();
  renderWheelNames();
  renderProgress();
}

function renderCategories() {
  if (!cats) return;

  cats.innerHTML = "";

  Object.keys(data.categories).forEach(category => {
    const button =
      document.createElement("button");

    button.className =
      "cat" +
      (
        category === selectedCategory
          ? " active"
          : ""
      );

    button.textContent = category;

    button.addEventListener(
      "click",
      () => selectCategory(category)
    );

    cats.appendChild(button);
  });
}


/* ==================================================
   LISTA DE OPÇÕES
   ================================================== */

function renderOptions() {
  if (!list) return;

  list.innerHTML = "";

  const options =
    data.categories[selectedCategory] || [];

  options.forEach(option => {
    const item =
      document.createElement("div");

    item.className = "item";

    const name =
      document.createElement("span");

    name.textContent = option;

    item.appendChild(name);
    list.appendChild(item);
  });

  if (count) {
    count.textContent =
      `${options.length} disponíveis`;
  }

  if (title) {
    title.textContent =
      selectedCategory;
  }
}


/* ==================================================
   ADICIONAR OPÇÃO
   ================================================== */

if (addForm) {
  addForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      if (!newItem) return;

      const value =
        newItem.value.trim();

      if (!value) return;

      const options =
        data.categories[selectedCategory];

      if (!options) return;

      if (options.includes(value)) {
        return;
      }

      options.push(value);

      void updateRichPresence("Creating The S1gn.");

      lastWheelSignature = "";
      newItem.value = "";

      save();

      renderOptions();
      renderWheelNames();
      renderProgress();
    }
  );
}


/* ==================================================
   NOVO CICLO
   ================================================== */

if (resetCycleButton) {
  resetCycleButton.addEventListener(
    "click",
    resetCycle
  );
}


/* ==================================================
   GIRAR
   ================================================== */

function spinWheel() {
  if (
    !wheel ||
    !spinButton ||
    spinning
  ) {
    return;
  }

  const options =
    data.categories[selectedCategory] || [];

  const cycle =
    getCycle(selectedCategory);

  const unusedOptions =
    options.filter(
      option => !cycle.includes(option)
    );

  if (options.length === 0) {
    showResult(
      "Adicione pelo menos uma opção."
    );

    return;
  }

  /*
   * Quando todas as opções já foram utilizadas,
   * inicia-se um novo ciclo automaticamente.
   */
  const availableOptions =
    unusedOptions.length > 0
      ? unusedOptions
      : options;

  if (unusedOptions.length === 0) {
    saveCycle(selectedCategory, []);
  }

  /*
   * A roleta visual possui cinco setores.
   */
  const visibleOptions =
    availableOptions.slice(0, 5);

  if (visibleOptions.length === 0) {
    return;
  }

  spinning = true;
  pendingResult = null;

  void updateRichPresence("Spinning The Roulette.");

  hideResultActions();

  spinButton.disabled = true;

  const selectedIndex =
    Math.floor(
      Math.random() *
      visibleOptions.length
    );

  const sectorSize =
    360 / 5;

  const sectorCenter =
    selectedIndex * sectorSize +
    sectorSize / 2;

  /*
   * O ponteiro permanece no topo.
   */
  const targetRotation =
    360 - sectorCenter;

  const normalizedCurrent =
    (
      currentRotation % 360 +
      360
    ) % 360;

  const correction =
    (
      targetRotation -
      normalizedCurrent +
      360
    ) % 360;

  /*
   * Cinco a sete voltas completas.
   */
  const extraTurns =
    (
      5 +
      Math.floor(Math.random() * 3)
    ) * 360;

  currentRotation +=
    extraTurns + correction;

  wheel.style.transform =
    `rotate(${currentRotation}deg)`;

  const selectedOption =
    visibleOptions[selectedIndex];

  /*
   * Duração compatível com a transição
   * original da roleta.
   */
  window.setTimeout(() => {
    pendingResult = selectedOption;

    void updateRichPresence("Reviewing The Result.");

    showResult(selectedOption);
    showResultActions();

    spinning = false;
    spinButton.disabled = false;
  }, 3250);
}


/* ==================================================
   EVENTO GIRAR
   ================================================== */

if (spinButton) {
  spinButton.addEventListener(
    "click",
    spinWheel
  );
}


/* ==================================================
   CONFIRMAR
   ================================================== */

if (confirmButton) {
  confirmButton.addEventListener(
    "click",
    () => {
      if (!pendingResult) return;

      const cycle =
        getCycle(selectedCategory);

      if (!cycle.includes(pendingResult)) {
        cycle.push(pendingResult);
        saveCycle(
          selectedCategory,
          cycle
        );
      }

      void updateRichPresence("Decision Confirmed.");

      showResult(pendingResult);

      pendingResult = null;

      hideResultActions();
      renderProgress();
    }
  );
}


/* ==================================================
   REJEITAR
   ================================================== */

if (rejectButton) {
  rejectButton.addEventListener(
    "click",
    () => {
      pendingResult = null;

      void updateRichPresence("Reconsidering The Result.");

      if (result) {
        result.innerHTML =
          '<span class="muted">Resultado rejeitado.</span>';
      }

      hideResultActions();
    }
  );
}


/* ==================================================
   CANCELAR
   ================================================== */

if (cancelButton) {
  cancelButton.addEventListener(
    "click",
    () => {
      pendingResult = null;

      void updateRichPresence("Creating The S1gn.");

      clearResult();
      hideResultActions();
    }
  );
}


/* ==================================================
   INICIALIZAÇÃO
   ================================================== */

function init() {
  void updateRichPresence("Creating The S1gn.");

  renderCategories();
  renderOptions();
  renderWheelNames();
  renderProgress();
  clearResult();
  hideResultActions();
}

init();