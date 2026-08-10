const KEY="einzbern-roulette-v1";

const defaultData={
  categories:{
    "Problemas / Dúvidas":["Questão para analisar"],
    "Jogos":["Wuthering Waves","Honkai: Star Rail","Honkai Impact 3rd"],
    "Sugestões / Projetos":["Roleta","Rich Presence do Discord"],
    "Músicas":[],
    "Imagens":[]
  },
  cycles:{},
  history:[]
};

let data=JSON.parse(localStorage.getItem(KEY)||"null")||defaultData;
let cat=Object.keys(data.categories)[1];
let pending=null;
let spinning=false;
let rotation=0;

function save(){
  localStorage.setItem(KEY,JSON.stringify(data));
}

function ensure(){
  if(!data.cycles[cat]){
    data.cycles[cat]={
      available:[...data.categories[cat]],
      sorted:[]
    };
  }
}

function renderCats(){
  const el=document.querySelector("#cats");
  el.innerHTML="";

  Object.keys(data.categories).forEach(c=>{
    const b=document.createElement("button");

    b.className="cat"+(c===cat?" active":"");
    b.textContent=c;

    b.onclick=()=>{
      if(spinning)return;

      cat=c;
      pending=null;
      ensure();
      render();
    };

    el.appendChild(b);
  });
}

function render(){
  ensure();
  renderCats();

  document.querySelector("#title").textContent=cat;

  const c=data.cycles[cat];
  const all=data.categories[cat];

  document.querySelector("#count").textContent=
    `${c.available.length} disponíveis · ${c.sorted.length} sorteadas`;

  document.querySelector("#progress").textContent=
    `${c.sorted.length}/${all.length||0}`;

  const list=document.querySelector("#list");
  list.innerHTML="";

  all.forEach(x=>{
    const d=document.createElement("div");

    d.className="item"+(c.sorted.includes(x)?" done":"");

    const s=document.createElement("span");
    s.textContent=x;

    d.appendChild(s);

    const del=document.createElement("button");
    del.className="danger";
    del.textContent="Excluir";

    del.onclick=()=>{
      if(confirm(`Remover “${x}”?`)){
        data.categories[cat]=all.filter(y=>y!==x);
        c.available=c.available.filter(y=>y!==x);
        c.sorted=c.sorted.filter(y=>y!==x);

        save();
        render();
      }
    };

    d.appendChild(del);
    list.appendChild(d);
  });
}

document.querySelector("#addForm").onsubmit=e=>{
  e.preventDefault();

  const inp=document.querySelector("#newItem");
  const x=inp.value.trim();

  if(!x)return;

  if(data.categories[cat].includes(x)){
    alert("Esta opção já existe.");
    return;
  }

  data.categories[cat].push(x);

  ensure();
  data.cycles[cat].available.push(x);

  save();

  inp.value="";
  render();
};

document.querySelector("#resetCycle").onclick=()=>{
  if(spinning)return;

  data.cycles[cat]={
    available:[...data.categories[cat]],
    sorted:[]
  };

  pending=null;

  save();
  render();
  showResult("Ciclo reiniciado.");
};

function showResult(t){
  document.querySelector("#result").innerHTML=
    t
      ? `<strong>${t}</strong>`
      : `<span class="muted">Nenhum resultado.</span>`;
}

document.querySelector("#spin").onclick=()=>{
  if(spinning)return;

  ensure();

  const a=data.cycles[cat].available;

  if(!a.length){
    alert("Não há opções disponíveis. Inicie um novo ciclo.");
    return;
  }

  spinning=true;

  document.querySelector("#spin").disabled=true;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  pending=a[Math.floor(Math.random()*a.length)];

  const idx=a.indexOf(pending);
  const slice=360/a.length;

  rotation+=1440+(360-(idx+.5)*slice);

  document.querySelector("#wheel").style.transform=
    `rotate(${rotation}deg)`;

  setTimeout(()=>{
    spinning=false;

    document.querySelector("#spin").disabled=false;

    showResult(pending);

    document
      .querySelector("#resultActions")
      .classList.remove("hidden");

  },3250);
};

document.querySelector("#confirm").onclick=()=>{
  if(!pending)return;

  const c=data.cycles[cat];

  c.available=c.available.filter(x=>x!==pending);
  c.sorted.push(pending);

  data.history.unshift({
    category:cat,
    item:pending,
    date:new Date().toISOString()
  });

  data.history=data.history.slice(0,100);

  save();

  pending=null;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  render();
};

document.querySelector("#reject").onclick=()=>{
  pending=null;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  showResult("Resultado devolvido ao conjunto.");
};

document.querySelector("#cancel").onclick=()=>{
  pending=null;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  showResult(null);
};

ensure();
render();
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
                    details: details,
                    state: "Working on a Project."
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            console.error(
                "[RPC] Falha ao atualizar Rich Presence:",
                data
            );
            return;
        }

        console.log(
            "[RPC] Rich Presence atualizado:",
            data
        );

    } catch (error) {
        console.error(
            "[RPC] Bridge indisponível:",
            error
        );
    }
}async function updateRichPresence(details) {
    try {
        const response = await fetch(
            "http://127.0.0.1:6464/presence",
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    details
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
            "[RPC] Não foi possível conectar à Bridge:",
            error
        );
    }
}