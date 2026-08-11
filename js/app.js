/* ==================================================
   EINZBERN ROULETTE — V1.0.7
   app.js — Roll restaurado
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

let data =
  JSON.parse(localStorage.getItem(KEY) || "null") ||
  defaultData;

let selectedCategory = "Problemas / Dúvidas";
let lastWheelSignature = "";
let spinning = false;
let currentRotation = 0;
let pendingResult = null;


/* ==================================================
   PERSISTÊNCIA
   ================================================== */

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
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


/* ==================================================
   NOMES DA ROLETA
   ================================================== */

function renderWheelNames() {
  if (!wheel) return;

  const options =
    data.categories[selectedCategory] || [];

  const visibleOptions = options.slice(0, 5);

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

  selectedCategory = category;
  lastWheelSignature = "";
  pendingResult = null;

  hideResultActions();
  renderCategories();
  renderOptions();
  renderWheelNames();
}

function renderCategories() {
  const container =
    document.querySelector("#cats");

  if (!container) return;

  container.innerHTML = "";

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

    container.appendChild(button);
  });
}


/* ==================================================
   LISTA DE OPÇÕES
   ================================================== */

function renderOptions() {
  const list =
    document.querySelector("#list");

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

  const count =
    document.querySelector("#count");

  if (count) {
    count.textContent =
      `${options.length} disponíveis`;
  }

  const title =
    document.querySelector("#title");

  if (title) {
    title.textContent =
      selectedCategory;
  }
}


/* ==================================================
   ADICIONAR OPÇÃO
   ================================================== */

const addForm =
  document.querySelector("#addForm");

if (addForm) {
  addForm.addEventListener(
    "submit",
    event => {
      event.preventDefault();

      const input =
        document.querySelector("#newItem");

      if (!input) return;

      const value =
        input.value.trim();

      if (!value) return;

      const options =
        data.categories[selectedCategory];

      if (options.includes(value)) {
        return;
      }

      options.push(value);

      lastWheelSignature = "";
      input.value = "";

      save();

      renderOptions();
      renderWheelNames();
    }
  );
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
   ROLL
   ================================================== */

function spinWheel() {
  if (!wheel || !spinButton || spinning) {
    return;
  }

  const options =
    data.categories[selectedCategory] || [];

  /*
   * A Roleta visual possui cinco setores.
   * Apenas as opções existentes participam do Roll.
   */
  const visibleOptions =
    options.slice(0, 5);

  if (visibleOptions.length === 0) {
    showResult(
      "Adicione pelo menos uma opção."
    );

    return;
  }

  spinning = true;
  pendingResult = null;

  hideResultActions();

  spinButton.disabled = true;

  const selectedIndex =
    Math.floor(
      Math.random() * visibleOptions.length
    );

  const slice = 