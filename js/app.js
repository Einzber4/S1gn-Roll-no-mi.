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

  render();
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

  if (!option) {
    clearResult();
    return;
  }

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

    wheel.style.setProperty(
      "--sector-size",
      "360deg"
    );

    return;
  }

  const sectorSize =
    360 / totalSectors;

  wheel.style.setProperty(
    "--sector-size",
    `${sectorSize}deg`
  );

  const stops = visibleOptions.map((_, index) => {
    const start = index * sectorSize;
    const end = (index + 1) * sectorSize;
    const color =
      WHEEL_COLORS[index % WHEEL_COLORS.length];

    return `${color} ${start}deg ${end}deg`;
  });

  wheel.style.background =
    `conic-gradient(${stops.join(",")})`;

  const radius =
    totalSectors <= 2
      ? 29
      : totalSectors <= 4
        ? 31
        : totalSectors <= 8
          ? 32
          : 34;

  visibleOptions.forEach((item, index) => {
    const midpoint =
      index * sectorSize + sectorSize / 2;

    const radians =
      (midpoint - 90) * Math.PI / 180;

    const x =
      50 + Math.cos(radians) * radius;

    const y =
      50 + Math.sin(radians) * radius;

    const label =
      document.createElement("div");

    label.className = "wheel-label";
    label.style.left = `${x}%`;
    label.style.top = `${y}%`;
    label.style.transform = "translate(-50%, -50%)";

    const text =
      document.createElement("span");

    text.textContent = item;

    label.appendChild(text);
    wheel.appendChild(label);
  });
}


/* ==================================================
   CORES DA ROLETA
   ================================================== */

const WHEEL_COLORS = [
  "#8ea8ff",
  "#566b9e",
  "#9aadd8",
  "#485a86",
  "#b0bee0",
  "#6f84b7",
  "#7890c5",
  "#435574",
  "#a4b5dc",
  "#6177a7"
];


/* ==================================================
   INTERFACE
   ================================================== */

function renderCats() {
  if (!cats) return;

  cats.innerHTML = "";

  Object.keys(data.categories).forEach(category => {
    const button =
      document.createElement("button");

    button.className =
      "cat" +
      (category === selectedCategory ? " active" : "");

    button.textContent = category;

    button.onclick = () => {
      if (spinning) return;

      selectedCategory = category;
      lastWheelSignature = "";
      pendingResult = null;

      hideResultActions();
      clearResult();
      render();

      void updateRichPresence("Creating The S1gn.");
    };

    cats.appendChild(button);
  });
}

function render() {
  renderCats();

  const options =
    data.categories[selectedCategory] || [];

  const cycle =
    getCycle(selectedCategory);

  if (title) {
    title.textContent = selectedCategory;
  }

  if (count) {
    count.textContent =
      `${options.length} disponíveis · ${cycle.length} sorteadas`;
  }

  if (list) {
    list.innerHTML = "";

    options.forEach(item => {
      const element =
        document.createElement("div");

      element.className =
        "item" +
        (cycle.includes(item) ? " done" : "");

      const text =
        document.createElement("span");

      text.textContent = item;
      element.appendChild(text);

      const deleteButton =
        document.createElement("button");

      deleteButton.className = "danger";
      deleteButton.textContent = "Excluir";

      deleteButton.onclick = () => {
        if (!confirm(`Remover “${item}”?`)) {
          return;
        }

        data.categories[selectedCategory] =
          options.filter(value => value !== item);

        saveCycle(
          selectedCategory,
          cycle.filter(value => value !== item)
        );

        if (pendingResult === item) {
          pendingResult = null;
        }

        save();
        lastWheelSignature = "";
        render();
        clearResult();
        hideResultActions();

        void updateRichPresence("Creating The S1gn.");
      };

      element.appendChild(deleteButton);
      list.appendChild(element);
    });
  }

  renderProgress();
  renderWheelNames();
}


/* ==================================================
   ADICIONAR ALTERNATIVA
   ================================================== */

if (addForm) {
  addForm.onsubmit = event => {
    event.preventDefault();

    const item =
      newItem ? newItem.value.trim() : "";

    if (!item) {
      return;
    }

    if (data.categories[selectedCategory].includes(item)) {
      alert("Esta opção já existe.");
      return;
    }

    data.categories[selectedCategory].push(item);

    save();
    lastWheelSignature = "";

    if (newItem) {
      newItem.value = "";
    }

    render();

    void updateRichPresence("Creating The S1gn.");
  };
}


/* ==================================================
   NOVO CICLO
   ================================================== */

if (resetCycleButton) {
  resetCycleButton.onclick = () => {
    if (spinning) {
      return;
    }

    resetCycle();

    showResult("Ciclo reiniciado.");
  };
}


/* ==================================================
   GIRAR
   ================================================== */

if (spinButton) {
  spinButton.onclick = () => {
    if (spinning) {
      return;
    }

    const options =
      data.categories[selectedCategory] || [];

    const cycle =
      getCycle(selectedCategory);

    const available =
      options.filter(option =>
        !cycle.includes(option)
      );

    if (!available.length) {
      alert(
        "Não há opções disponíveis. Inicie um novo ciclo."
      );
      return;
    }

    const visibleAvailable =
      available.slice(0, 5);

    const selectedIndex =
      Math.floor(
        Math.random() * visibleAvailable.length
      );

    pendingResult =
      visibleAvailable[selectedIndex];

    const sectorSize =
      360 / visibleAvailable.length;

    const targetAngle =
      360 -
      (
        selectedIndex * sectorSize +
        sectorSize / 2
      );

    currentRotation +=
      1440 + targetAngle;

    spinning = true;
    spinButton.disabled = true;

    hideResultActions();

    void updateRichPresence(
      "Spinning The Roulette."
    );

    wheel.style.transform =
      `rotate(${currentRotation}deg)`;

    setTimeout(() => {
      spinning = false;
      spinButton.disabled = false;

      showResult(pendingResult);
      showResultActions();

      void updateRichPresence(
        "Reviewing The Result."
      );
    }, 3250);
  };
}


/* ==================================================
   CONFIRMAR
   ================================================== */

if (confirmButton) {
  confirmButton.onclick = () => {
    if (!pendingResult) {
      return;
    }

    const cycle =
      getCycle(selectedCategory);

    if (!cycle.includes(pendingResult)) {
      cycle.push(pendingResult);
    }

    const confirmedItem =
      pendingResult;

    pendingResult = null;

    saveCycle(
      selectedCategory,
      cycle
    );

    save();
    lastWheelSignature = "";

    hideResultActions();
    render();

    showResult(
      `Decision Confirmed: ${confirmedItem}`
    );

    void updateRichPresence(
      "Decision Confirmed."
    );
  };
}


/* ==================================================
   REJEITAR
   ================================================== */

if (rejectButton) {
  rejectButton.onclick = () => {
    pendingResult = null;

    hideResultActions();

    showResult(
      "Resultado devolvido ao conjunto."
    );

    void updateRichPresence(
      "Reconsidering The Result."
    );
  };
}


/* ==================================================
   CANCELAR
   ================================================== */

if (cancelButton) {
  cancelButton.onclick = () => {
    pendingResult = null;

    hideResultActions();
    clearResult();

    void updateRichPresence(
      "Creating The S1gn."
    );
  };
}


/* ==================================================
   INICIALIZAÇÃO
   ================================================== */

render();

void updateRichPresence(
  "Creating The S1gn."
);