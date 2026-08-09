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

let data=JSON.parse(localStorage.getItem(KEY)||"null")||defaultData,
    cat=Object.keys(data.categories)[1],
    pending=null,
    spinning=false,
    rotation=0;

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

function setSpinState(active){
  const spin=document.querySelector("#spin");
  const wheel=document.querySelector("#wheel");
  const result=document.querySelector("#result");

  spin.disabled=active;
  spin.classList.toggle("spinning",active);
  wheel.classList.toggle("is-spinning",active);
  result.classList.toggle("is-spinning",active);

  if(active){
    spin.textContent="🎲 SORTEANDO...";
  }else{
    spin.textContent="🎲 GIRAR";
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

    d.className=
      "item"+(c.sorted.includes(x)?" done":"");

    const s=document.createElement("span");
    s.textContent=x;

    d.appendChild(s);

    const del=document.createElement("button");

    del.className="danger";
    del.textContent="Excluir";

    del.onclick=()=>{
      if(confirm(`Remover “${x}”?`)){
        data.categories[cat]=
          all.filter(y=>y!==x);

        c.available=
          c.available.filter(y=>y!==x);

        c.sorted=
          c.sorted.filter(y=>y!==x);

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
  const result=document.querySelector("#result");

  result.classList.remove("reveal");

  void result.offsetWidth;

  result.innerHTML=t
    ? `<strong>${t}</strong>`
    : `<span class="muted">Nenhum resultado.</span>`;

  if(t){
    result.classList.add("reveal");
  }
}

document.querySelector("#spin").onclick=()=>{
  if(spinning)return;

  ensure();

  const a=data.cycles[cat].available;

  if(!a.length){
    alert(
      "Não há opções disponíveis. Inicie um novo ciclo."
    );
    return;
  }

  spinning=true;

  pending=
    a[Math.floor(Math.random()*a.length)];

  const result=document.querySelector("#result");

  result.classList.remove("reveal");

  result.innerHTML=
    `<span class="muted">Sorteando...</span>`;

  document
    .querySelector("#resultActions")
    .classList.add("hidden");

  setSpinState(true);

  const idx=a.indexOf(pending);
  const slice=