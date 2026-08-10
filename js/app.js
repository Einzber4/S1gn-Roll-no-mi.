/* ==================================================
   EINZBERN ROULETTE — V1.0.6
   app.js — Apenas nomes na Roleta
   ==================================================
   IMPORTANTE:
   - Mantém a Roleta anterior com 5 setores fixos.
   - NÃO altera o conic-gradient.
   - NÃO altera a quantidade de setores.
   - NÃO altera o mecanismo de sorteio.
   - Apenas adiciona os nomes das alternativas aos setores.
   ================================================== */

const KEY = "einzbern-roulette-v1";

/*
 * Estrutura existente.
 * Mantenha os dados já utilizados pelo projeto.
 */
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

/*
 * Cache da Roleta:
 * evita reconstruir os nomes quando categoria/opções
 * não sofreram alteração.
 */
let lastWheelSignature = "";

/* ==================================================
   Persistência
   ================================================== */

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

/* ==================================================
   Nomes da Roleta
   ==================================================
   A Roleta continua exatamente com os 5 setores
   definidos anteriormente.

   Esta função NÃO recria a Roleta.
   Ela somente coloca os nomes sobre os setores.
   ================================================== */

function renderWheelNames() {
  const wheel = document.querySelector("#wheel");

  if (!wheel) return;

  const options =
    data.categories[selectedCategory] || [];

  /*
   * Somente os cinco primeiros nomes participam
   * da representação visual da Roleta existente.
   */
  const visibleOptions = options.slice(0, 5);

  /*
   * Se nada mudou, não reconstruímos os elementos.
   */
  const signature =
    `${selectedCategory}|${visibleOptions.join("\u001f")}`;

  if (signature === lastWheelSignature) {
    return;
  }

  lastWheelSignature = signature;

  /*
   * Remove somente os nomes anteriores.
   * O conic-gradient e a própria Roleta permanecem intactos.
   */
  wheel
    .querySelectorAll(".wheel-label")
    .forEach(label => label.remove());

  /*
   * A Roleta possui 5 setores iguais.
   * Cada nome é colocado no centro geométrico
   * do respectivo setor.
   */
  const totalSectors = 5;
  const slice = 360 / totalSectors;
  const radius = 30;

  /*
   * Fragment evita múltiplas inserções no DOM.
   */
  const fragment = document.createDocumentFragment();

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
   Seleção de categoria
   ================================================== */

function selectCategory(category) {
  if (!data.categories[category]) return;

  selectedCategory = category;

  lastWheelSignature = "";

  renderCategories();
  renderOptions();
  renderWheelNames();
}

/* ==================================================
   Categorias
   ================================================== */

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
      (category === selectedCategory
        ? " active"
        : "");

    button.textContent = category;

    button.addEventListener("click", () => {
      selectCategory(category);
    });

    container.appendChild(button);
  });
}

/* ==================================================
   Lista de alternativas
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
    title.textContent = selectedCategory;
  }
}

/* ==================================================
   Adicionar alternativa
   ================================================== */

const addForm =
  document.querySelector("#addForm");

if (addForm) {
  addForm.addEventListener("submit", event => {
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
  });
}

/* ==================================================
   Inicialização
   ================================================== */

renderCategories();
renderOptions();

/*
 * ÚNICA alteração desta versão:
 * adicionar os nomes à Roleta existente.
 */
renderWheelNames();