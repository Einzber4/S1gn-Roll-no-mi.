/* ==================================================
   EINZBERN ROULETTE — V1.0.6
   app.js — Dynamic Wheel
   ================================================== */

const KEY = "einzbern-roulette-v1";

const defaultData = {
  categories: {
    "Problemas / Dúvidas": ["Questão para analisar"],
    "Jogos": ["Wuthering Waves", "Honkai: Star Rail", "Honkai Impact 3rd"],
    "Sugestões / Projetos": ["Roleta", "Rich Presence do Discord"],
    "Músicas": [],
    "Imagens": []
  },
  cycles: {},
  history: []
};

let data = JSON.parse(localStorage.getItem(KEY) || "null") || defaultData;
let cat = Object.keys(data.categories)[1];
let pending = null;
let spinning = false;
let rotation = 0;

/* ==================================================
   Persistência
   ================================================== */

function save() {
  localStorage.setItem(KEY, JSON.stringify(data));
}

/* ==================================================
   Rich Presence
   ================================================== */

async function updateRichPresence(details) {
  try {
    const response = await fetch("http://127.0.0.1:6464/presence", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        details,
        state: "Working on a Project."
      })
    });

    const result = await response.json();

    if (!response.ok || !result.success) {
      console.error("[RPC] Falha ao atualizar:", result);
      return;
    }

    console.log("[RPC] Activity atualizada:", details);
  } catch (error) {
    console.error("[RPC] Bridge indisponível:", error);
  }
}

/* ==================================================
   Ciclos
   ================================================== */

function ensure() {
  if (!data.cycles[cat]) {
    data.cycles[cat] = {
      available: [...data.categories[cat]],
      sorted: []
    };
  }

  /*
   * Garante que novas opções adicionadas à categoria
   * também possam entrar no ciclo atual.
   */
  const existing = new Set([
    ...data.cycles[cat].available,
    ...data.cycles[cat].sorted
  ]);

  data.categories[cat].forEach(item => {
    if (!existing.has(item)) {
      data.cycles[cat].available.push(item);
    }
  });
}

/* ==================================================
   Categorias
   ================================================== */

function renderCats() {
  const el = document.querySelector("#cats");

  el.innerHTML = "";

  Object.keys(data.categories).forEach(c => {
    const button = document.createElement("button");

    button.className = "cat" + (c === cat ? " active" : "");
    button.textContent = c;

    button.onclick = () => {
      if (spinning) return;

      cat = c;
      pending = null;

      ensure();
      render();
      showResult(null);

      updateRichPresence("Creating The S1gn.");
    };

    el.appendChild(button);
  });
}

/* ==================================================
   Roleta dinâmica
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

function buildWheel(items) {
  const wheel = document.querySelector("#wheel");

  if (!wheel) return;

  /*
   * Remove somente os rótulos anteriores.
   * O centro da roleta permanece intacto.
   */
  wheel.querySelectorAll(".wheel-label").forEach(label => {
    label.remove();
  });

  const total = items.length;

  if (!total) {
    wheel.style.background = "#202733";
    return;
  }

  const slice = 360 / total;

  /*
   * Cria o conic-gradient dinamicamente.
   */
  const stops = items.map((_, index) => {
    const start = index * slice;
    const end = (index + 1) * slice;
    const color = WHEEL_COLORS[index % WHEEL_COLORS.length];

    return `${color} ${start}deg ${end}deg`;
  });

  wheel.style.background = `conic-gradient(${stops.join(",")})`;

  /*
   * Cria um nome para cada segmento.
   *
   * O cálculo usa coordenadas trigonométricas para que
   * o texto permaneça visualmente centralizado no setor.
   */
  const radius = total <= 2
    ? 29
    : total <= 4
      ? 31
      : total <= 8
        ? 32
        : 34;

  items.forEach((item, index) => {
    const midpoint = index * slice + slice / 2;

    /*
     * 0° fica no topo.
     * CSS usa seno/cosseno para distribuir o texto.
     */
    const radians = (midpoint - 90) * Math.PI / 180;

    const x = 50 + Math.cos(radians) * radius;
    const y = 50 + Math.sin(radians) * radius;

    const label = document.createElement("div");
    label.className = "wheel-label";

    label.style.left = `${x}%`;
    label.style.top = `${y}%`;

    const text = document.createElement("span");
    text.textContent = item;

    label.appendChild(text);
    wheel.appendChild(label);
  });
}

/* ==================================================
   Interface
   ================================================== */

function render() {
  ensure();
  renderCats();

  const all = data.categories[cat];
  const cycle = data.cycles[cat];

  document.querySelector("#title").textContent = cat;

  document.querySelector("#count").textContent =
    `${cycle.available.length} disponíveis · ${cycle.sorted.length} sorteadas`;

  document.querySelector("#progress").textContent =
    `${cycle.sorted.length}/${all.length || 0}`;

  const list = document.querySelector("#list");

  list.innerHTML = "";

  all.forEach(item => {
    const element = document.createElement("div");

    element.className =
      "item" + (cycle.sorted.includes(item) ? " done" : "");

    const text = document.createElement("span");

    text.textContent = item;

    element.appendChild(text);

    const deleteButton = document.createElement("button");

    deleteButton.className = "danger";
    deleteButton.textContent = "Excluir";

    deleteButton.onclick = () => {
      if (!confirm(`Remover “${item}”?`)) {
        return;
      }

      data.categories[cat] =
        all.filter(value => value !== item);

      cycle.available =
        cycle.available.filter(value => value !== item);

      cycle.sorted =
        cycle.sorted.filter(value => value !== item);

      if (pending === item) {
        pending = null;
      }

      save();
      render();
      showResult(null);

      updateRichPresence("Creating The S1gn.");
    };

    element.appendChild(deleteButton);
    list.appendChild(element);
  });

  /*
   * A Roleta sempre representa as opções atualmente
   * disponíveis para sorteio.
   */
  buildWheel(cycle.available);
}

/* ==================================================
   Adicionar alternativa
   ================================================== */

document.querySelector("#addForm").onsubmit = event => {
  event.preventDefault();

  const input = document.querySelector("#newItem");
  const item = input.value.trim();

  if (!item) {
    return;
  }

  if (data.categories[cat].includes(item)) {
    alert("Esta opção já existe.");
    return;
  }

  data.categories[cat].push(item);

  ensure();

  /*
   * A nova opção entra imediatamente na roleta
   * do ciclo atual.
   */
  if (!data.cycles[cat].available.includes(item)) {
    data.cycles[cat].available.push(item);
  }

  input.value = "";

  save();
  render();

  updateRichPresence("Creating The S1gn.");
};

/* ==================================================
   Novo ciclo
   ================================================== */

document.querySelector("#resetCycle").onclick = () => {
  if (spinning) {
    return;
  }

  data.cycles[cat] = {
    available: [...data.categories[cat]],
    sorted: []
  };

  pending = null;

  save();
  render();
  showResult("Ciclo reiniciado.");

  updateRichPresence("Resetting The Cycle.");
};

/* ==================================================
   Resultado
   ================================================== */

function showResult(text) {
  const result = document.querySelector("#result");

  if (!text) {
    result.innerHTML =
      `<span class="muted">Nenhum resultado.</span>`;

    return;
  }

  result.innerHTML = `<strong>${text}</strong>`;
}

/* ==================================================
   Girar
   ================================================== */

document.querySelector("#spin").onclick = () => {
  if (spinning) {
    return;
  }

  ensure();

  const available = data.cycles[cat].available;

  if (!available.length) {
    alert("Não há opções disponíveis. Inicie um novo ciclo.");
    return;
  }

  spinning = true;

  document.querySelector("#spin").disabled = true;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  updateRichPresence("Spinning The Roulette.");

  const selectedIndex =
    Math.floor(Math.random() * available.length);

  pending = available[selectedIndex];

  const slice = 360 / available.length;

  /*
   * O centro do segmento selecionado deve terminar
   * exatamente sob o ponteiro, que está no topo.
   */
  const targetAngle =
    360 - (selectedIndex * slice + slice / 2);

  rotation += 1440 + targetAngle;

  document.querySelector("#wheel").style.transform =
    `rotate(${rotation}deg)`;

  setTimeout(() => {
    spinning = false;

    document.querySelector("#spin").disabled = false;

    showResult(pending);

    document
      .querySelector("#resultActions")
      .classList.remove("hidden");

    updateRichPresence("Reviewing The Result.");
  }, 3250);
};

/* ==================================================
   Confirmar
   ================================================== */

document.querySelector("#confirm").onclick = () => {
  if (!pending) {
    return;
  }

  const cycle = data.cycles[cat];

  cycle.available =
    cycle.available.filter(item => item !== pending);

  cycle.sorted.push(pending);

  data.history.unshift({
    category: cat,
    item: pending,
    date: new Date().toISOString()
  });

  data.history =
    data.history.slice(0, 100);

  const confirmedItem = pending;

  pending = null;

  save();
  render();

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  showResult(`Decision Confirmed: ${confirmedItem}`);

  updateRichPresence("Decision Confirmed.");
};

/* ==================================================
   Rejeitar
   ================================================== */

document.querySelector("#reject").onclick = () => {
  pending = null;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  showResult("Resultado devolvido ao conjunto.");

  updateRichPresence("Reconsidering The Result.");
};

/* ==================================================
   Cancelar
   ================================================== */

document.querySelector("#cancel").onclick = () => {
  pending = null;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  showResult(null);

  updateRichPresence("Creating The S1gn.");
};

/* ==================================================
   Inicialização
   ================================================== */

ensure();
render();

updateRichPresence("Creating The S1gn.");