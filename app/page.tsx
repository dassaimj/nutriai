"use client";

import { useState, useEffect } from "react";

// ── CONSTANTS ────────────────────────────────────────────────────────────────
const DIETAS = ["Ovolactovegetariana","Vegana","Cetogênica","Low Carb","Mediterrânea","Paleo","Sem restrição"];
const RESTRICOES = ["Glúten","Lactose","Frutos do mar","Amendoim","Soja","Ovos","Nenhuma"];
const ATIVIDADES_CATALOGO = [
  { nome:"Caminhada leve", met:2.8, icon:"🚶" },
  { nome:"Caminhada rápida", met:4.5, icon:"🚶‍♂️" },
  { nome:"Corrida", met:8.0, icon:"🏃" },
  { nome:"Musculação", met:4.0, icon:"🏋️" },
  { nome:"Ciclismo", met:6.0, icon:"🚴" },
  { nome:"Natação", met:7.0, icon:"🏊" },
  { nome:"Yoga / Pilates", met:2.5, icon:"🧘" },
  { nome:"HIIT", met:9.0, icon:"⚡" },
  { nome:"Futebol", met:7.5, icon:"⚽" },
  { nome:"Dança", met:5.0, icon:"💃" },
  { nome:"Artes marciais", met:7.0, icon:"🥋" },
];

const MIN_SEGURO = { Masculino: 1500, Feminino: 1200 };
const MIN_ABSOLUTO_PCT = 0.5;

// ── CÁLCULOS ─────────────────────────────────────────────────────────────────
function calcTMB({ peso, altura, idade, sexo }) {
  const h = parseFloat(altura), p = parseFloat(peso), a = parseFloat(idade);
  if (!h||!p||!a) return 1800;
  return sexo === "Masculino"
    ? Math.round(10*p + 6.25*h*100 - 5*a + 5)
    : Math.round(10*p + 6.25*h*100 - 5*a - 161);
}
function calcGET(tmb, nv) {
  return Math.round(tmb * ({Sedentário:1.2,Leve:1.375,Moderado:1.55,Intenso:1.725}[nv]||1.2));
}
function calcIMC(p, a) {
  if(!p||!a) return null;
  return (parseFloat(p)/(parseFloat(a)**2)).toFixed(1);
}
function imcInfo(v) {
  const n = parseFloat(v);
  if(n<18.5) return {label:"Abaixo do peso", cor:"#60a5fa"};
  if(n<25)   return {label:"Peso normal",    cor:"#34d399"};
  if(n<30)   return {label:"Sobrepeso",      cor:"#fbbf24"};
  if(n<35)   return {label:"Obesidade I",    cor:"#fb923c"};
  if(n<40)   return {label:"Obesidade II",   cor:"#f87171"};
  return           {label:"Obesidade III",   cor:"#ef4444"};
}
function avaliarSeguranca(calAlvo, tmb, sexo) {
  const minSeguro = MIN_SEGURO[sexo] || 1500;
  const minAbsoluto = Math.round(tmb * MIN_ABSOLUTO_PCT);
  if (calAlvo < minAbsoluto) return {
    nivel:"bloqueado", cor:"#ef4444", bgCor:"rgba(239,68,68,0.08)", borderCor:"rgba(239,68,68,0.3)",
    titulo:"⛔ Meta bloqueada",
    msg:`${calAlvo} kcal está abaixo de 50% da sua taxa metabólica basal (${tmb} kcal). Risco sério à saúde. Mínimo permitido: ${minAbsoluto} kcal.`,
    minPermitido:minAbsoluto,
  };
  if (calAlvo < minSeguro) return {
    nivel:"alerta", cor:"#f59e0b", bgCor:"rgba(245,158,11,0.07)", borderCor:"rgba(245,158,11,0.3)",
    titulo:"⚠️ Abaixo do mínimo recomendado",
    msg:`${calAlvo} kcal está abaixo do mínimo seguro (${minSeguro} kcal). Dietas muito restritivas causam perda muscular e efeito rebote. Deseja prosseguir mesmo assim?`,
    minPermitido:minAbsoluto,
  };
  if (calAlvo < tmb) return {
    nivel:"aviso", cor:"#fbbf24", bgCor:"rgba(251,191,36,0.05)", borderCor:"rgba(251,191,36,0.2)",
    titulo:"💡 Abaixo da basal",
    msg:`${calAlvo} kcal está abaixo da sua taxa metabólica basal (${tmb} kcal). Recomenda-se acompanhamento profissional.`,
    minPermitido:minAbsoluto,
  };
  return { nivel:"ok", cor:"#34d399", bgCor:null, borderCor:null, titulo:null, msg:null, minPermitido:minAbsoluto };
}

// ── OPENAI API ───────────────────────────────────────────────────────────────
async function aiJSON(prompt, sys = "Responda APENAS em JSON válido sem markdown.") {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: sys },
          { role: "user", content: prompt }
        ],
      })
    });
    const d = await r.json();
    const txt = d.choices?.[0]?.message?.content || "";
    return JSON.parse(txt.replace(/```json|```/g, "").trim());
  } catch { return null; }
}

async function aiText(prompt) {
  try {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.NEXT_PUBLIC_OPENAI_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
      })
    });
    const d = await r.json();
    return d.choices?.[0]?.message?.content || "";
  } catch { return "Erro ao conectar com a IA. Verifique sua chave de API."; }
}

async function gerarCardapio(perfil) {
  const atvsCtx = (perfil.atividadesFreq||[]).length > 0
    ? `Atividades habituais: ${perfil.atividadesFreq.map(a=>`${a.nome}`).join(", ")}`
    : "";
  const res = await aiJSON(`Você é nutricionista. Crie cardápio de 1 dia com ${perfil.nRefeicoes||5} refeições para:
- Dieta: ${perfil.dieta}
- Restrições: ${(perfil.restricoes||[]).join(", ")||"nenhuma"}
- Meta calórica: ${perfil.calAlvo} kcal
- TMB: ${perfil.tmb} kcal | GET: ${perfil.get} kcal
- Jejum: ${perfil.jejum||"não"}
- Sexo: ${perfil.sexo}, Peso: ${perfil.peso}kg
${atvsCtx}
Retorne JSON: {"refeicoes":[{"horario":"HH:MM","nome":"string","emoji":"string","kcal":number,"itens":["item1","item2","item3"],"macros":{"prot":number,"carb":number,"gord":number}}]}`);
  return res?.refeicoes || cardapioPadrao(perfil);
}

async function estimarCalorias(descricao, peso) {
  return await aiJSON(`Estime as calorias de: "${descricao}" para pessoa de ${peso}kg.
Retorne JSON: {"kcal":number,"prot":number,"carb":number,"gord":number,"confianca":"alta|media|baixa","nota":"string"}`);
}

async function analisarDia(perfil, dia) {
  const atvsCtx = (perfil.atividadesFreq||[]).length > 0
    ? `\nAtividades habituais: ${perfil.atividadesFreq.map(a=>a.nome).join(", ")}`
    : "";
  return await aiText(`Analise o dia nutricional (máx 3 parágrafos curtos, direto e motivador):
- Meta: ${perfil.calAlvo} kcal | TMB: ${perfil.tmb} kcal | GET: ${perfil.get} kcal
- Ingerido: ${dia.calIn} kcal | Exercício: ${dia.calEx} kcal
- Déficit real: ${(perfil.get + dia.calEx) - dia.calIn} kcal
- Água: ${dia.agua}ml | Refeições cumpridas: ${dia.check}/${dia.total}
- Dieta: ${perfil.dieta}${atvsCtx}
Dê 1 elogio e 1 sugestão prática.`);
}

function cardapioPadrao(p) {
  const ceto = p.dieta?.includes("Ceto");
  return ceto ? [
    {horario:"08:00",nome:"Café da manhã",emoji:"🍳",kcal:450,itens:["3 ovos mexidos","Abacate ½","Queijo coalho 50g"],macros:{prot:28,carb:4,gord:36}},
    {horario:"11:00",nome:"Lanche",emoji:"🧀",kcal:220,itens:["Castanhas 30g","Queijo minas 50g"],macros:{prot:12,carb:4,gord:18}},
    {horario:"13:30",nome:"Almoço",emoji:"🥩",kcal:580,itens:["Frango grelhado 200g","Salada verde","Azeite 2 col."],macros:{prot:48,carb:6,gord:38}},
    {horario:"17:00",nome:"Lanche tarde",emoji:"🥑",kcal:200,itens:["Abacate ½","Nozes 20g"],macros:{prot:4,carb:8,gord:18}},
    {horario:"20:00",nome:"Jantar",emoji:"🐟",kcal:480,itens:["Salmão 150g","Brócolis","Manteiga 1 col."],macros:{prot:42,carb:8,gord:30}},
  ] : [
    {horario:"07:30",nome:"Café da manhã",emoji:"🌅",kcal:380,itens:["3 ovos mexidos","Pão integral 2 fatias","1 fruta"],macros:{prot:24,carb:42,gord:14}},
    {horario:"10:00",nome:"Lanche manhã",emoji:"🍎",kcal:180,itens:["Iogurte grego 170g","Granola 30g"],macros:{prot:14,carb:22,gord:4}},
    {horario:"13:00",nome:"Almoço",emoji:"🍽",kcal:560,itens:["Proteína 150g","Arroz integral 4 col.","Feijão 1 concha","Salada"],macros:{prot:42,carb:58,gord:10}},
    {horario:"16:00",nome:"Lanche tarde",emoji:"🥜",kcal:200,itens:["Cottage 150g","Torrada integral 2 un."],macros:{prot:18,carb:16,gord:4}},
    {horario:"19:30",nome:"Jantar",emoji:"🌙",kcal:430,itens:["Proteína leve 130g","Legumes grelhados","Salada verde"],macros:{prot:36,carb:28,gord:12}},
  ];
}

// ── DESIGN TOKENS ────────────────────────────────────────────────────────────
const C = {
  bg:"#070b12", surface:"#0d1420", card:"#111827",
  border:"#1f2d42", accent:"#10b981", accent2:"#059669",
  blue:"#3b82f6", yellow:"#f59e0b", red:"#ef4444", orange:"#fb923c",
  text:"#f0f4f8", muted:"#64748b",
};
const inp = {
  background:"rgba(255,255,255,0.05)", border:`1px solid ${C.border}`,
  borderRadius:10, color:C.text, padding:"11px 14px", fontSize:14,
  width:"100%", outline:"none", boxSizing:"border-box" as const, fontFamily:"inherit",
};
const btn = (v="primary") => ({
  padding:"11px 22px", borderRadius:10, border:"none", cursor:"pointer",
  fontSize:13, fontFamily:"inherit", fontWeight:600, letterSpacing:0.3,
  transition:"all 0.18s",
  ...(v==="primary" ? {background:`linear-gradient(135deg,${C.accent},${C.accent2})`,color:"#fff"}
   : v==="ghost"    ? {background:"transparent",color:C.muted,border:`1px solid ${C.border}`}
   :                  {background:"rgba(255,255,255,0.05)",color:C.text,border:`1px solid ${C.border}`}),
});

function Tag({ label, active, onClick }: any) {
  return <button onClick={onClick} style={{
    padding:"7px 14px",borderRadius:20,fontSize:12,cursor:"pointer",
    fontFamily:"inherit",fontWeight:500,transition:"all 0.18s",
    background:active?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.04)",
    border:`1px solid ${active?C.accent:C.border}`,
    color:active?C.accent:C.muted,
  }}>{label}</button>;
}
function Bar({ val, max, color=C.accent, h=6 }: any) {
  const p = Math.min(100, Math.round(Math.max(0,val)/Math.max(1,max)*100));
  return <div style={{height:h,background:"rgba(255,255,255,0.06)",borderRadius:h,overflow:"hidden"}}>
    <div style={{height:"100%",width:`${p}%`,borderRadius:h,background:color,transition:"width .5s ease"}}/>
  </div>;
}
function Stat({ label, val, color=C.accent, sub }: any) {
  return <div style={{textAlign:"center"}}>
    <div style={{fontSize:10,color:C.muted,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:3}}>{label}</div>
    <div style={{fontSize:18,fontWeight:700,color}}>{val}</div>
    {sub&&<div style={{fontSize:10,color:C.muted,marginTop:2}}>{sub}</div>}
  </div>;
}

// ── SELETOR DE ATIVIDADES ────────────────────────────────────────────────────
function SeletorAtividades({ value, onChange }: any) {
  const [custom, setCustom] = useState("");
  const [showCustom, setShowCustom] = useState(false);

  function toggle(atv: any) {
    const exists = value.find((a: any) => a.nome === atv.nome);
    if (exists) onChange(value.filter((a: any) => a.nome !== atv.nome));
    else onChange([...value, atv]);
  }
  function addCustom() {
    const nome = custom.trim();
    if (!nome) return;
    if (!value.find((a: any) => a.nome.toLowerCase() === nome.toLowerCase()))
      onChange([...value, { nome, met:4.0, icon:"🏅", custom:true }]);
    setCustom(""); setShowCustom(false);
  }

  return <div>
    <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:10}}>
      {ATIVIDADES_CATALOGO.map(a => {
        const sel = !!value.find((v: any) => v.nome === a.nome);
        return <button key={a.nome} onClick={()=>toggle(a)} style={{
          padding:"8px 14px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit",
          fontWeight:500,transition:"all 0.18s",display:"flex",alignItems:"center",gap:6,
          background:sel?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.04)",
          border:`1px solid ${sel?C.accent:C.border}`,color:sel?C.accent:C.muted,
        }}><span>{a.icon}</span>{a.nome}</button>;
      })}
      <button onClick={()=>setShowCustom(p=>!p)} style={{
        padding:"8px 14px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit",
        border:`1px dashed ${C.border}`,background:"transparent",color:C.muted,
      }}>+ Outro</button>
    </div>
    {showCustom && <div style={{display:"flex",gap:8,marginBottom:10}}>
      <input placeholder="Ex: Padel, CrossFit, Beach Tennis..." value={custom}
        onChange={e=>setCustom(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCustom()}
        style={{...inp,flex:1}} autoFocus/>
      <button onClick={addCustom} style={{...btn(),padding:"11px 16px",flexShrink:0}}>Adicionar</button>
    </div>}
    {value.length > 0 && <div style={{background:"rgba(16,185,129,0.06)",border:`1px solid rgba(16,185,129,0.15)`,borderRadius:10,padding:"10px 14px"}}>
      <div style={{fontSize:11,color:C.accent,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:8}}>Selecionadas ({value.length})</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
        {value.map((a: any) => <div key={a.nome} style={{
          display:"flex",alignItems:"center",gap:6,
          background:"rgba(16,185,129,0.1)",border:`1px solid rgba(16,185,129,0.2)`,
          borderRadius:16,padding:"4px 10px",fontSize:12,color:C.accent,
        }}>
          <span>{a.icon||"🏅"}</span>{a.nome}
          <button onClick={()=>onChange(value.filter((v: any)=>v.nome!==a.nome))} style={{
            background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:14,padding:0,lineHeight:1,marginLeft:2,
          }}>×</button>
        </div>)}
      </div>
    </div>}
  </div>;
}

// ── ALERTA DE SEGURANÇA ──────────────────────────────────────────────────────
function AlertaSeguranca({ seg, onConfirmar, onAjustar }: any) {
  if (seg.nivel === "ok" || seg.nivel === "aviso") return null;
  return <div style={{background:seg.bgCor,border:`1px solid ${seg.borderCor}`,borderRadius:12,padding:16,marginTop:14}}>
    <div style={{fontSize:14,fontWeight:700,color:seg.cor,marginBottom:6}}>{seg.titulo}</div>
    <div style={{fontSize:13,color:C.text,lineHeight:1.7,marginBottom:12}}>{seg.msg}</div>
    {seg.nivel==="alerta" && <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
      <button onClick={onAjustar} style={{...btn(),fontSize:12,padding:"8px 16px"}}>Ajustar prazo (recomendado)</button>
      <button onClick={onConfirmar} style={{...btn("ghost"),fontSize:12,padding:"8px 16px",color:C.yellow,borderColor:C.yellow}}>Entendo os riscos, prosseguir</button>
    </div>}
    {seg.nivel==="bloqueado" && <div style={{background:"rgba(239,68,68,0.05)",borderRadius:8,padding:"10px 12px",fontSize:12,color:"rgba(239,68,68,0.8)"}}>
      Mínimo permitido: <strong style={{color:C.red}}>{seg.minPermitido} kcal</strong>
    </div>}
  </div>;
}

// ── STEP OBJETIVO ────────────────────────────────────────────────────────────
function StepObjetivo({ f, u, tmb, get, sexo }: any) {
  const [confirmarRisco, setConfirmarRisco] = useState(false);
  const diff = parseFloat(f.peso||0) - parseFloat(f.pesoMeta||0);
  const semanas = parseFloat(f.prazo||1);
  const deficitIdeal = diff > 0 ? Math.round((diff*7700)/(semanas*7)) : 0;
  const calAlvoCalc = get - deficitIdeal;
  const calAlvo = f.calAlvoCustom !== undefined ? f.calAlvoCustom : calAlvoCalc;
  const minSeguro = MIN_SEGURO[sexo as keyof typeof MIN_SEGURO] || 1500;
  const minAbsoluto = Math.round(tmb * MIN_ABSOLUTO_PCT);
  const seg = avaliarSeguranca(calAlvo, tmb, sexo);
  const prazoMinSeguro = diff > 0 ? Math.ceil((diff*7700)/((get-minSeguro)*7)) : null;

  return <div>
    <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:18}}>Objetivo</div>
    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
      <div>
        <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Peso alvo (kg)</div>
        <input type="number" placeholder="ex: 75" value={f.pesoMeta}
          onChange={e=>{u("pesoMeta",e.target.value);setConfirmarRisco(false);}} style={inp}/>
      </div>
      <div>
        <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Prazo (semanas)</div>
        <input type="number" placeholder="ex: 8" value={f.prazo}
          onChange={e=>{u("prazo",e.target.value);setConfirmarRisco(false);}} style={inp}/>
      </div>
    </div>

    {f.peso && f.pesoMeta && f.prazo && <>
      <div style={{
        background:seg.nivel==="ok"?"rgba(16,185,129,0.07)":seg.bgCor||"rgba(16,185,129,0.07)",
        border:`1px solid ${seg.nivel==="ok"?"rgba(16,185,129,0.2)":seg.borderCor||"rgba(16,185,129,0.2)"}`,
        borderRadius:12,padding:16,marginBottom:4,
      }}>
        <div style={{fontSize:11,color:C.muted,marginBottom:12}}>Projeção calculada</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          <Stat label="A perder" val={`${Math.max(0,diff).toFixed(1)} kg`} color={C.accent}/>
          <Stat label="Por semana" val={`${diff>0?(diff/semanas).toFixed(2):"0"} kg`} color={diff>0&&(diff/semanas)>1.5?C.orange:C.yellow}/>
          <Stat label="Alvo diário" val={`${calAlvo} kcal`}
            color={seg.nivel==="ok"?C.accent:seg.nivel==="aviso"?C.yellow:seg.nivel==="alerta"?C.orange:C.red}/>
        </div>

        {/* Barra visual de segurança */}
        <div style={{marginBottom:8}}>
          <div style={{position:"relative",height:12,background:"rgba(255,255,255,0.06)",borderRadius:6,overflow:"hidden"}}>
            <div style={{position:"absolute",left:0,top:0,height:"100%",width:`${(minAbsoluto/get)*100}%`,background:"rgba(239,68,68,0.3)",borderRadius:"6px 0 0 6px"}}/>
            <div style={{position:"absolute",left:`${(minAbsoluto/get)*100}%`,top:0,height:"100%",width:`${((minSeguro-minAbsoluto)/get)*100}%`,background:"rgba(245,158,11,0.25)"}}/>
            <div style={{position:"absolute",left:`${(minSeguro/get)*100}%`,top:0,height:"100%",width:`${((get-minSeguro)/get)*100}%`,background:"rgba(16,185,129,0.2)",borderRadius:"0 6px 6px 0"}}/>
            {calAlvo > 0 && calAlvo <= get && <div style={{
              position:"absolute",left:`calc(${Math.min(99,(calAlvo/get)*100)}% - 1px)`,
              top:-2,width:3,height:16,borderRadius:2,
              background:seg.nivel==="ok"?C.accent:seg.nivel==="aviso"?C.yellow:seg.nivel==="alerta"?C.orange:C.red,
            }}/>}
          </div>
          <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:C.muted,marginTop:4}}>
            <span style={{color:"rgba(239,68,68,0.7)"}}>🚫 Bloqueado</span>
            <span style={{color:"rgba(245,158,11,0.7)"}}>⚠️ Alerta</span>
            <span style={{color:"rgba(16,185,129,0.7)"}}>✅ Seguro</span>
          </div>
        </div>

        <div style={{fontSize:11,color:C.muted,borderTop:`1px solid rgba(255,255,255,0.06)`,paddingTop:8,marginTop:4}}>
          TMB: <strong style={{color:C.text}}>{tmb} kcal</strong> · GET: <strong style={{color:C.text}}>{get} kcal</strong>
          {prazoMinSeguro && seg.nivel!=="ok" && <span> · Prazo mín. seguro: <strong style={{color:C.yellow}}>{prazoMinSeguro} sem</strong></span>}
        </div>
      </div>

      {seg.nivel !== "ok" && !confirmarRisco && <AlertaSeguranca seg={seg}
        onConfirmar={()=>setConfirmarRisco(true)}
        onAjustar={()=>{ if(prazoMinSeguro) u("prazo",prazoMinSeguro); setConfirmarRisco(false); }}/>}

      {seg.nivel==="aviso" && <div style={{background:"rgba(251,191,36,0.05)",border:`1px solid rgba(251,191,36,0.2)`,borderRadius:10,padding:"10px 14px",marginTop:10,fontSize:12,color:"rgba(251,191,36,0.9)",lineHeight:1.6}}>
        💡 Alvo abaixo da sua basal ({tmb} kcal). Recomendamos acompanhamento profissional.
      </div>}

      {confirmarRisco && seg.nivel==="alerta" && <div style={{background:"rgba(245,158,11,0.07)",border:`1px solid rgba(245,158,11,0.25)`,borderRadius:10,padding:"10px 14px",marginTop:10,fontSize:12,color:C.yellow}}>
        ⚠️ Prosseguindo com {calAlvo} kcal/dia. Monitore sua energia e consulte um profissional.
      </div>}
    </>}
  </div>;
}

// ── BRIEFING ─────────────────────────────────────────────────────────────────
function Briefing({ onDone }: any) {
  const [step, setStep] = useState(0);
  const [f, setF] = useState({
    nome:"", sexo:"Masculino", idade:"", peso:"", altura:"",
    atv:"Leve", dieta:"", restricoes:[] as string[], jejum:"",
    pesoMeta:"", prazo:8, atividadesFreq:[] as any[], calAlvoCustom:undefined as any,
    nRefeicoes:5, diaPesagem:"Segunda-feira",
  });
  const u = (k: string, v: any) => setF(p=>({...p,[k]:v}));
  const tog = (k: string, v: string) => setF(p=>({...p,[k]:(p as any)[k].includes(v)?(p as any)[k].filter((x: string)=>x!==v):[...(p as any)[k].filter((x: string)=>x!=="Nenhuma"),v]}));

  const imc = calcIMC(f.peso, f.altura);
  const info = imc ? imcInfo(imc) : null;
  const tmb = calcTMB(f);
  const get = calcGET(tmb, f.atv);
  const diff = parseFloat(f.peso||"0") - parseFloat(f.pesoMeta||"0");
  const deficitIdeal = diff > 0 ? Math.round((diff*7700)/(parseFloat(String(f.prazo)||"1")*7)) : 0;
  const calAlvoCalc = get - deficitIdeal;
  const calAlvoEfetivo = f.calAlvoCustom !== undefined ? f.calAlvoCustom : calAlvoCalc;
  const seg = avaliarSeguranca(calAlvoEfetivo, tmb, f.sexo);

  const steps = [
    // 0 — boas-vindas
    <div key={0} style={{textAlign:"center",padding:"16px 0 24px"}}>
      <div style={{fontSize:56,marginBottom:16}}>🥗</div>
      <h2 style={{fontSize:26,fontWeight:300,color:C.text,margin:"0 0 8px",letterSpacing:-0.5}}>
        Bem-vindo ao <span style={{color:C.accent,fontWeight:800}}>NutriAI</span>
      </h2>
      <p style={{color:C.muted,fontSize:14,lineHeight:1.8,maxWidth:320,margin:"0 auto 28px"}}>
        Seu assistente nutricional com IA. Configure seu perfil e receba um plano totalmente personalizado.
      </p>
      <input placeholder="Como posso te chamar?" value={f.nome} onChange={e=>u("nome",e.target.value)}
        style={{...inp,textAlign:"center",fontSize:15,maxWidth:280,display:"block",margin:"0 auto"}}/>
    </div>,

    // 1 — físico
    <div key={1}>
      <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:18}}>Dados físicos</div>
      <div style={{display:"flex",gap:8,marginBottom:16}}>
        {["Masculino","Feminino"].map(s=><Tag key={s} label={s} active={f.sexo===s} onClick={()=>u("sexo",s)}/>)}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Idade</div>
          <input type="number" placeholder="ex: 38" value={f.idade} onChange={e=>u("idade",e.target.value)} style={inp}/>
        </div>
        <div>
          <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Peso atual (kg)</div>
          <input type="number" placeholder="ex: 85" value={f.peso} onChange={e=>u("peso",e.target.value)} style={inp}/>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Altura (m)</div>
          <input type="number" placeholder="ex: 1.75" step="0.01" value={f.altura} onChange={e=>u("altura",e.target.value)} style={inp}/>
        </div>
        <div style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Nível geral de atividade</div>
          <select value={f.atv} onChange={e=>u("atv",e.target.value)} style={{...inp,appearance:"none"}}>
            {["Sedentário","Leve","Moderado","Intenso"].map(a=><option key={a}>{a}</option>)}
          </select>
        </div>
      </div>
      {imc && <div style={{background:"rgba(16,185,129,0.07)",border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:C.muted}}>IMC calculado</span>
        <span style={{fontSize:17,fontWeight:700,color:info!.cor}}>{imc} — <span style={{fontSize:13,fontWeight:400}}>{info!.label}</span></span>
      </div>}
    </div>,

    // 2 — atividades
    <div key={2}>
      <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:6}}>Atividades físicas frequentes</div>
      <div style={{fontSize:13,color:C.muted,marginBottom:16,lineHeight:1.6}}>
        Selecione as que você pratica. Isso personaliza o cálculo de calorias e o cardápio.
      </div>
      <SeletorAtividades value={f.atividadesFreq} onChange={(v: any)=>u("atividadesFreq",v)}/>
      {f.atividadesFreq.length===0 && <div style={{fontSize:12,color:C.muted,marginTop:12,fontStyle:"italic"}}>
        Nenhuma selecionada — você pode registrar exercícios no dashboard a qualquer momento.
      </div>}
    </div>,

    // 3 — dieta
    <div key={3}>
      <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:14}}>Tipo de dieta</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:22}}>
        {DIETAS.map(d=><Tag key={d} label={d} active={f.dieta===d} onClick={()=>u("dieta",d)}/>)}
      </div>
      <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:14}}>Restrições</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:8,marginBottom:20}}>
        {RESTRICOES.map(r=><Tag key={r} label={r} active={f.restricoes.includes(r)} onClick={()=>tog("restricoes",r)}/>)}
      </div>
      <div>
        <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Jejum intermitente (opcional)</div>
        <input placeholder="ex: 16:8 · janela 14h–22h" value={f.jejum} onChange={e=>u("jejum",e.target.value)} style={inp}/>
      </div>
    </div>,

    // 4 — preferências
    <div key={4}>
      <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:18}}>Preferências do plano</div>

      {/* Número de refeições */}
      <div style={{marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:6}}>Quantas refeições por dia?</div>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <button onClick={()=>u("nRefeicoes",Math.max(2,f.nRefeicoes-1))} style={{
            width:36,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",
            color:C.text,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
          }}>−</button>
          <div style={{flex:1,textAlign:"center"}}>
            <div style={{fontSize:32,fontWeight:700,color:C.accent}}>{f.nRefeicoes}</div>
            <div style={{fontSize:11,color:C.muted}}>refeições/dia</div>
          </div>
          <button onClick={()=>u("nRefeicoes",Math.min(8,f.nRefeicoes+1))} style={{
            width:36,height:36,borderRadius:8,border:`1px solid ${C.border}`,background:"rgba(255,255,255,0.05)",
            color:C.text,fontSize:20,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
          }}>+</button>
        </div>
        <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap"}}>
          {[3,4,5,6].map(n=><button key={n} onClick={()=>u("nRefeicoes",n)} style={{
            padding:"5px 14px",borderRadius:16,fontSize:12,cursor:"pointer",fontFamily:"inherit",
            background:f.nRefeicoes===n?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.04)",
            border:`1px solid ${f.nRefeicoes===n?C.accent:C.border}`,color:f.nRefeicoes===n?C.accent:C.muted,
          }}>{n}x</button>)}
        </div>
      </div>

      {/* Dia de pesagem */}
      <div style={{marginBottom:4}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:8}}>Dia da pesagem semanal</div>
        <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {["Segunda","Terça","Quarta","Quinta","Sexta","Sábado","Domingo"].map(d=>(
            <button key={d} onClick={()=>u("diaPesagem",d)} style={{
              padding:"7px 12px",borderRadius:10,fontSize:12,cursor:"pointer",fontFamily:"inherit",
              background:f.diaPesagem===d?"rgba(16,185,129,0.15)":"rgba(255,255,255,0.04)",
              border:`1px solid ${f.diaPesagem===d?C.accent:C.border}`,color:f.diaPesagem===d?C.accent:C.muted,
              transition:"all 0.15s",
            }}>{d}</button>
          ))}
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:10,lineHeight:1.6}}>
          📅 Toda <strong style={{color:C.text}}>{f.diaPesagem}</strong> o app vai te lembrar de registrar seu peso em jejum, sempre no mesmo horário.
        </div>
      </div>
    </div>,

    // 5 — objetivo
    <StepObjetivo key={5} f={f} u={u} tmb={tmb} get={get} sexo={f.sexo}/>,
  ];

  const canNext = [
    f.nome.length > 1,
    !!(f.idade && f.peso && f.altura),
    true,
    !!f.dieta,
    !!(f.nRefeicoes >= 2),
    !!(f.pesoMeta && f.prazo && seg.nivel !== "bloqueado"),
  ][step];

  return <div style={{maxWidth:480,margin:"0 auto",padding:"24px 16px"}}>
    <div style={{display:"flex",gap:6,marginBottom:28}}>
      {steps.map((_,i)=><div key={i} style={{flex:1,height:3,borderRadius:2,background:i<=step?C.accent:C.border,transition:"background .3s"}}/>)}
    </div>
    {steps[step]}
    <div style={{display:"flex",gap:10,marginTop:28}}>
      {step > 0 && <button onClick={()=>setStep(s=>s-1)} style={{...btn("ghost"),flex:1}}>← Voltar</button>}
      <button disabled={!canNext} onClick={()=>{
        if(step < steps.length-1){ setStep(s=>s+1); }
        else {
          const tmb2 = calcTMB(f); const get2 = calcGET(tmb2,f.atv);
          const diff2 = parseFloat(f.peso)-parseFloat(f.pesoMeta);
          const deficitIdeal2 = Math.round((diff2*7700)/(parseFloat(String(f.prazo))*7));
          const calAlvoFinal = f.calAlvoCustom !== undefined ? f.calAlvoCustom : get2-deficitIdeal2;
          onDone({...f,tmb:tmb2,get:get2,calAlvo:calAlvoFinal,deficitIdeal:deficitIdeal2,nRefeicoes:f.nRefeicoes,diaPesagem:f.diaPesagem});
        }
      }} style={{...btn(),flex:2,opacity:canNext?1:0.4}}>
        {step < steps.length-1 ? "Continuar →" : "🚀 Começar"}
      </button>
    </div>
  </div>;
}

// ── CARD REFEIÇÃO ─────────────────────────────────────────────────────────────
function CardRefeicao({ r, checked, onCheck, extra, onSaveExtra, peso }: any) {
  const [open, setOpen] = useState(false);
  const [showExtra, setShowExtra] = useState(false);
  const [exTxt, setExTxt] = useState(extra?.desc||"");
  const [exKcal, setExKcal] = useState(extra?.kcal||"");
  const [estimando, setEstimando] = useState(false);
  const [exMacros, setExMacros] = useState(extra?.macros||null);
  const [confianca, setConfianca] = useState(extra?.confianca||"");

  async function estimar() {
    if (!exTxt.trim()) return;
    setEstimando(true);
    const res = await estimarCalorias(exTxt, peso);
    if (res) { setExKcal(res.kcal); setExMacros({prot:res.prot,carb:res.carb,gord:res.gord}); setConfianca(res.confianca); }
    setEstimando(false);
  }

  return <div style={{background:C.card,border:`1px solid ${checked?C.accent:C.border}`,borderRadius:14,overflow:"hidden",transition:"all .2s",boxShadow:checked?`0 0 20px rgba(16,185,129,0.08)`:"none"}}>
    <div style={{display:"flex",alignItems:"center",gap:12,padding:"14px 16px",cursor:"pointer"}} onClick={()=>setOpen(o=>!o)}>
      <button onClick={e=>{e.stopPropagation();onCheck(!checked);}} style={{
        width:22,height:22,borderRadius:6,flexShrink:0,cursor:"pointer",
        border:`2px solid ${checked?C.accent:C.border}`,background:checked?"rgba(16,185,129,0.2)":"transparent",
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,color:C.accent,transition:"all .2s",
      }}>{checked?"✓":""}</button>
      <span style={{fontSize:22}}>{r.emoji}</span>
      <div style={{flex:1,minWidth:0}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
          <span style={{fontSize:15,fontWeight:600,color:C.text}}>{r.nome}</span>
          <span style={{fontSize:13,fontWeight:700,color:extra?C.yellow:C.accent,flexShrink:0,marginLeft:8}}>
            {extra?parseInt(extra.kcal):r.kcal} kcal
          </span>
        </div>
        <div style={{fontSize:11,color:C.muted,marginTop:2}}>{r.horario}</div>
        <div style={{marginTop:6,height:3,background:"rgba(255,255,255,0.06)",borderRadius:2,overflow:"hidden"}}>
          <div style={{height:"100%",width:`${Math.min(100,(r.kcal/700)*100)}%`,background:extra?C.yellow:C.accent,borderRadius:2}}/>
        </div>
      </div>
      <span style={{color:C.muted,fontSize:11}}>{open?"▲":"▼"}</span>
    </div>

    {open && <div style={{padding:"0 16px 16px",borderTop:`1px solid ${C.border}`}}>
      {!extra ? <>
        <div style={{marginTop:14,marginBottom:10}}>
          {r.itens.map((it: string,i: number)=><div key={i} style={{fontSize:13,color:C.muted,padding:"4px 0",display:"flex",alignItems:"center",gap:8}}>
            <span style={{width:4,height:4,borderRadius:"50%",background:C.accent,flexShrink:0,display:"inline-block"}}/>
            {it}
          </div>)}
        </div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:14}}>
          {[["Proteína",r.macros.prot,"#60a5fa"],["Carb.",r.macros.carb,C.yellow],["Gordura",r.macros.gord,"#f472b6"]].map(([lb,v,cor])=>(
            <div key={lb as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px",textAlign:"center"}}>
              <div style={{fontSize:14,fontWeight:700,color:cor as string}}>{v as number}g</div>
              <div style={{fontSize:10,color:C.muted}}>{lb}</div>
            </div>
          ))}
        </div>
      </> : <div style={{marginTop:12,background:"rgba(245,158,11,0.08)",border:`1px solid rgba(245,158,11,0.2)`,borderRadius:10,padding:"10px 14px",marginBottom:12}}>
        <div style={{fontSize:11,color:C.yellow,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:4}}>Substituição registrada</div>
        <div style={{fontSize:13,color:C.text}}>{extra.desc}</div>
        {extra.macros && <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:4,marginTop:8}}>
          {[["Prot.",extra.macros.prot,"#60a5fa"],["Carb.",extra.macros.carb,C.yellow],["Gord.",extra.macros.gord,"#f472b6"]].map(([lb,v,cor])=>(
            <div key={lb as string} style={{textAlign:"center"}}>
              <div style={{fontSize:13,fontWeight:700,color:cor as string}}>{v as number}g</div>
              <div style={{fontSize:10,color:C.muted}}>{lb}</div>
            </div>
          ))}
        </div>}
        <button onClick={()=>{onSaveExtra(null);setShowExtra(false);setExTxt("");setExKcal("");setExMacros(null);}}
          style={{...btn("ghost"),padding:"4px 10px",fontSize:11,marginTop:8}}>✕ Remover</button>
      </div>}

      {!showExtra && !extra && <button onClick={()=>setShowExtra(true)} style={{...btn("ghost"),width:"100%",fontSize:12}}>✎ Comi outra coisa</button>}

      {showExtra && !extra && <div style={{background:"rgba(255,255,255,0.02)",border:`1px solid ${C.border}`,borderRadius:10,padding:14}}>
        <div style={{fontSize:12,color:C.accent,marginBottom:10,fontWeight:600}}>O que você comeu?</div>
        <input placeholder="Descreva (ex: arroz, feijão, frango 200g...)" value={exTxt}
          onChange={e=>setExTxt(e.target.value)} style={{...inp,marginBottom:8}}/>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input type="number" placeholder="Kcal (ou use IA →)" value={exKcal}
            onChange={e=>setExKcal(e.target.value)} style={{...inp,flex:1}}/>
          <button onClick={estimar} disabled={estimando||!exTxt.trim()}
            style={{...btn(),padding:"11px 14px",fontSize:12,flexShrink:0,opacity:exTxt.trim()?1:0.4}}>
            {estimando?"⏳":"✨ IA"}
          </button>
        </div>
        {exKcal && exMacros && <div style={{marginBottom:10}}>
          <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginBottom:6}}>
            {[["Proteína",exMacros.prot,"#60a5fa"],["Carb.",exMacros.carb,C.yellow],["Gordura",exMacros.gord,"#f472b6"]].map(([lb,v,cor])=>(
              <div key={lb as string} style={{background:"rgba(255,255,255,0.03)",borderRadius:8,padding:"8px",textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:700,color:cor as string}}>{v as number}g</div>
                <div style={{fontSize:10,color:C.muted}}>{lb}</div>
              </div>
            ))}
          </div>
          {confianca && <div style={{fontSize:11,color:C.muted,textAlign:"center"}}>
            Estimativa: <span style={{color:confianca==="alta"?C.accent:confianca==="media"?C.yellow:C.red}}>{confianca} confiança</span>
          </div>}
        </div>}
        <div style={{display:"flex",gap:8}}>
          <button onClick={()=>setShowExtra(false)} style={{...btn("ghost"),flex:1,fontSize:12}}>Cancelar</button>
          <button disabled={!exTxt||!exKcal} onClick={()=>{
            onSaveExtra({desc:exTxt,kcal:parseInt(exKcal),macros:exMacros,confianca});
            onCheck(true); setShowExtra(false);
          }} style={{...btn(),flex:2,fontSize:12,opacity:exTxt&&exKcal?1:0.4}}>Salvar</button>
        </div>
      </div>}
    </div>}
  </div>;
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
function Dashboard({ perfil, onEdit }: any) {
  const [cardapio, setCardapio] = useState<any[]|null>(null);
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState<any>({});
  const [extras, setExtras] = useState<any>({});
  const [agua, setAgua] = useState(0);
  const [exercicios, setExercicios] = useState<any[]>([]);
  const [addEx, setAddEx] = useState({show:false,tipo:ATIVIDADES_CATALOGO[0].nome,min:""});
  const [analise, setAnalise] = useState("");
  const [loadingAnalise, setLoadingAnalise] = useState(false);
  const [aba, setAba] = useState("hoje");
  const [pesoAtual, setPesoAtual] = useState(perfil.peso);
  const [editPeso, setEditPeso] = useState(false);

  const hist = [
    {d:"Seg",in:1820,def:680},{d:"Ter",in:1950,def:550},{d:"Qua",in:1760,def:740},
    {d:"Qui",in:2100,def:400},{d:"Sex",in:1880,def:620},{d:"Sáb",in:1800,def:700},{d:"Dom",in:1750,def:750},
  ];

  // Persistência localStorage
  useEffect(()=>{
    const hoje = new Date().toISOString().slice(0,10);
    const saved = localStorage.getItem(`nutriai_dia_${hoje}`);
    if(saved){ const d=JSON.parse(saved); setChecked(d.checked||{}); setExtras(d.extras||{}); setAgua(d.agua||0); setExercicios(d.exercicios||[]); }
  },[]);
  useEffect(()=>{
    const hoje = new Date().toISOString().slice(0,10);
    localStorage.setItem(`nutriai_dia_${hoje}`,JSON.stringify({checked,extras,agua,exercicios}));
  },[checked,extras,agua,exercicios]);

  useEffect(()=>{ carregarCardapio(); },[]);

  async function carregarCardapio() {
    setLoading(true); setCardapio(null);
    const c = await gerarCardapio(perfil);
    setCardapio(c); setLoading(false);
  }

  const calIn = cardapio ? cardapio.reduce((acc,r,i)=>{
    if(!checked[i]) return acc;
    return acc+(extras[i]?parseInt(extras[i].kcal||0):r.kcal);
  },0) : 0;
  const calEx = exercicios.reduce((a,e)=>a+e.kcal,0);
  const deficit = (perfil.get+calEx)-calIn;
  const progPeso = Math.min(100,Math.max(0,((parseFloat(perfil.peso)-parseFloat(pesoAtual))/(parseFloat(perfil.peso)-parseFloat(perfil.pesoMeta)))*100));
  const totalMacros = cardapio ? cardapio.reduce((acc,r,i)=>{
    if(!checked[i]) return acc;
    const m=extras[i]?.macros||r.macros;
    return {prot:acc.prot+(m.prot||0),carb:acc.carb+(m.carb||0),gord:acc.gord+(m.gord||0)};
  },{prot:0,carb:0,gord:0}) : {prot:0,carb:0,gord:0};

  const atvsParaModal = [...ATIVIDADES_CATALOGO,...(perfil.atividadesFreq||[]).filter((a: any)=>a.custom)];

  return <div style={{maxWidth:560,margin:"0 auto",paddingBottom:80}}>
    {/* TOPO */}
    <div style={{position:"sticky",top:0,zIndex:50,background:"rgba(7,11,18,0.92)",backdropFilter:"blur(14px)",borderBottom:`1px solid ${C.border}`,padding:"12px 16px"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
        <div>
          <span style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase" as const}}>META </span>
          <span style={{fontSize:15,fontWeight:700,color:C.accent}}>{perfil.pesoMeta} kg</span>
          <span style={{fontSize:11,color:C.muted}}> · {perfil.prazo} sem · {perfil.dieta}</span>
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <button onClick={()=>setEditPeso(p=>!p)} style={{background:"rgba(16,185,129,0.1)",border:`1px solid ${C.border}`,borderRadius:8,padding:"4px 10px",fontSize:13,fontWeight:700,color:C.accent,cursor:"pointer",fontFamily:"inherit"}}>{pesoAtual} kg</button>
          <button onClick={onEdit} style={{...btn("ghost"),padding:"5px 10px",fontSize:11}}>✎</button>
        </div>
      </div>
      {editPeso && <div style={{display:"flex",gap:8,marginBottom:10}}>
        <input type="number" value={pesoAtual} onChange={e=>setPesoAtual(e.target.value)} style={{...inp,maxWidth:100}}/>
        <button onClick={()=>setEditPeso(false)} style={btn()}>OK</button>
      </div>}
      <div style={{display:"flex",justifyContent:"space-between",fontSize:11,color:C.muted,marginBottom:4}}>
        <span>{perfil.peso} kg</span>
        <span style={{color:C.accent,fontWeight:600}}>{progPeso.toFixed(0)}% concluído</span>
        <span>{perfil.pesoMeta} kg</span>
      </div>
      <Bar val={progPeso} max={100} color={C.accent} h={7}/>

      {(perfil.atividadesFreq||[]).length > 0 && <div style={{display:"flex",gap:6,marginTop:10,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{fontSize:10,color:C.muted}}>Treinos:</span>
        {perfil.atividadesFreq.map((a: any)=><div key={a.nome} style={{background:"rgba(16,185,129,0.07)",border:`1px solid rgba(16,185,129,0.15)`,borderRadius:16,padding:"3px 10px",fontSize:11,color:C.accent}}>{a.icon||"🏅"} {a.nome}</div>)}
      </div>}

      {/* Banner de pesagem semanal */}
      {(()=>{
        const dias = ["Domingo","Segunda","Terça","Quarta","Quinta","Sexta","Sábado"];
        const hoje = dias[new Date().getDay()];
        const diaPesagem = perfil.diaPesagem || "Segunda";
        if (hoje !== diaPesagem) return null;
        return <div style={{
          marginTop:10, background:"rgba(251,191,36,0.08)", border:`1px solid rgba(251,191,36,0.25)`,
          borderRadius:10, padding:"10px 14px", display:"flex", alignItems:"center", gap:10,
        }}>
          <span style={{fontSize:18}}>⚖️</span>
          <div style={{flex:1}}>
            <div style={{fontSize:12,fontWeight:600,color:C.yellow}}>Hoje é seu dia de pesagem!</div>
            <div style={{fontSize:11,color:C.muted,marginTop:2}}>Pese-se em jejum, sempre no mesmo horário.</div>
          </div>
          <button onClick={()=>setEditPeso(true)} style={{...btn(),padding:"6px 12px",fontSize:11,flexShrink:0}}>
            Registrar
          </button>
        </div>;
      })()}

      <div style={{display:"flex",gap:0,marginTop:12}}>
        {[["hoje","🗓 Hoje"],["cal","⚡ Calorias"],["hist","📈 Histórico"]].map(([id,lb])=>(
          <button key={id} onClick={()=>setAba(id)} style={{flex:1,background:"none",border:"none",borderBottom:`2px solid ${aba===id?C.accent:"transparent"}`,padding:"8px 4px",fontSize:12,cursor:"pointer",fontFamily:"inherit",color:aba===id?C.accent:C.muted,transition:"all .2s"}}>{lb}</button>
        ))}
      </div>
    </div>

    <div style={{padding:"20px 16px"}}>

    {/* ── HOJE ── */}
    {aba==="hoje" && <>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
        <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const}}>Cardápio de hoje</div>
        <button onClick={carregarCardapio} style={{...btn("ghost"),padding:"5px 12px",fontSize:11}}>{loading?"⏳":"🔄 Novo"}</button>
      </div>

      {loading && <div style={{textAlign:"center",padding:"40px 0",color:C.muted}}>
        <div style={{fontSize:36,marginBottom:12}}>✨</div>
        <div style={{fontSize:14}}>Gerando cardápio com IA...</div>
        <div style={{fontSize:12,marginTop:6}}>{perfil.dieta} · {(perfil.restricoes||[]).join(", ")||"sem restrições"}</div>
      </div>}

      {cardapio && !loading && <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:20}}>
        {cardapio.map((r,i)=><CardRefeicao key={i} r={r} peso={perfil.peso}
          checked={!!checked[i]} onCheck={(v: boolean)=>setChecked((p: any)=>({...p,[i]:v}))}
          extra={extras[i]||null} onSaveExtra={(v: any)=>setExtras((p: any)=>({...p,[i]:v}))}/>)}
      </div>}

      {cardapio && <div style={{background:"rgba(16,185,129,0.05)",border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:10}}>Macros acumulados</div>
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8}}>
          {[["Proteína",totalMacros.prot,"#60a5fa"],["Carboidrato",totalMacros.carb,C.yellow],["Gordura",totalMacros.gord,"#f472b6"]].map(([lb,v,cor])=>(
            <div key={lb as string} style={{textAlign:"center"}}>
              <div style={{fontSize:18,fontWeight:700,color:cor as string}}>{v as number}g</div>
              <div style={{fontSize:10,color:C.muted}}>{lb}</div>
            </div>
          ))}
        </div>
      </div>}

      {/* Água */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:14,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
          <span style={{fontSize:14,color:C.text}}>💧 Água</span>
          <span style={{fontWeight:700,color:agua>=2500?C.accent:"#60a5fa"}}>{agua} / 3000 ml</span>
        </div>
        <Bar val={agua} max={3000} color="#60a5fa" h={7}/>
        <div style={{display:"flex",gap:6,marginTop:10}}>
          {[200,300,500].map(v=><button key={v} onClick={()=>setAgua(p=>p+v)} style={{...btn("outline"),padding:"6px 12px",fontSize:12}}>+{v}ml</button>)}
          <button onClick={()=>setAgua(0)} style={{...btn("ghost"),padding:"6px 10px",fontSize:11}}>↺</button>
        </div>
      </div>

      {/* Exercícios */}
      <div style={{marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const}}>Atividade física</div>
          <button onClick={()=>setAddEx(p=>({...p,show:true}))} style={{...btn(),padding:"6px 14px",fontSize:12}}>+ Adicionar</button>
        </div>
        {(perfil.atividadesFreq||[]).length > 0 && <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:10,alignItems:"center"}}>
          <span style={{fontSize:11,color:C.muted}}>Atalhos:</span>
          {perfil.atividadesFreq.map((a: any)=><button key={a.nome} onClick={()=>setAddEx({show:true,tipo:a.nome,min:""})} style={{background:"rgba(16,185,129,0.07)",border:`1px solid rgba(16,185,129,0.15)`,borderRadius:16,padding:"4px 12px",fontSize:11,color:C.accent,cursor:"pointer",fontFamily:"inherit"}}>{a.icon||"🏅"} {a.nome}</button>)}
        </div>}
        {exercicios.length===0
          ? <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:20,textAlign:"center",fontSize:13,color:C.muted}}>Nenhuma atividade registrada hoje</div>
          : exercicios.map((e,i)=><div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div>
              <div style={{fontSize:14,color:C.text}}>{e.icon||"🏃"} {e.tipo}</div>
              <div style={{fontSize:11,color:C.muted}}>{e.min} min</div>
            </div>
            <div style={{display:"flex",gap:12,alignItems:"center"}}>
              <span style={{fontSize:16,fontWeight:700,color:C.accent}}>−{e.kcal} kcal</span>
              <button onClick={()=>setExercicios(p=>p.filter((_,j)=>j!==i))} style={{background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:16}}>✕</button>
            </div>
          </div>)
        }
      </div>

      {/* Modal exercício */}
      {addEx.show && <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
        <div style={{background:"#111827",borderRadius:"20px 20px 0 0",padding:24,width:"100%",maxWidth:500,maxHeight:"80vh",overflowY:"auto"}}>
          <h4 style={{color:C.text,margin:"0 0 16px",fontSize:16}}>Registrar exercício</h4>
          {(perfil.atividadesFreq||[]).length > 0 && <div style={{marginBottom:16}}>
            <div style={{fontSize:11,color:C.accent,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:8}}>Seus treinos</div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {perfil.atividadesFreq.map((a: any)=><button key={a.nome} onClick={()=>setAddEx(p=>({...p,tipo:a.nome}))} style={{padding:"7px 14px",borderRadius:20,fontSize:12,cursor:"pointer",fontFamily:"inherit",background:addEx.tipo===a.nome?"rgba(16,185,129,0.2)":"rgba(255,255,255,0.04)",border:`1px solid ${addEx.tipo===a.nome?C.accent:C.border}`,color:addEx.tipo===a.nome?C.accent:C.muted,display:"flex",alignItems:"center",gap:6}}>{a.icon||"🏅"} {a.nome}</button>)}
            </div>
          </div>}
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Todos os tipos</div>
            <select value={addEx.tipo} onChange={e=>setAddEx(p=>({...p,tipo:e.target.value}))} style={{...inp,appearance:"none"}}>
              {atvsParaModal.map(a=><option key={a.nome}>{a.nome}</option>)}
            </select>
          </div>
          <div style={{marginBottom:10}}>
            <div style={{fontSize:11,color:C.muted,marginBottom:5}}>Duração (minutos)</div>
            <input type="number" placeholder="ex: 45" value={addEx.min} onChange={e=>setAddEx(p=>({...p,min:e.target.value}))} style={inp} autoFocus/>
          </div>
          {addEx.min && (()=>{
            const atv = atvsParaModal.find(a=>a.nome===addEx.tipo)||{met:4.0};
            return <div style={{fontSize:14,color:C.accent,textAlign:"center",marginBottom:14,fontWeight:600}}>
              ≈ {Math.round(atv.met*parseFloat(perfil.peso)*(parseFloat(addEx.min)/60))} kcal gastas
            </div>;
          })()}
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setAddEx(p=>({...p,show:false}))} style={{...btn("ghost"),flex:1}}>Cancelar</button>
            <button disabled={!addEx.min} onClick={()=>{
              const atv = atvsParaModal.find(a=>a.nome===addEx.tipo)||{met:4.0,icon:"🏅"};
              const kcal = Math.round((atv as any).met*parseFloat(perfil.peso)*(parseFloat(addEx.min)/60));
              setExercicios(p=>[...p,{tipo:addEx.tipo,min:addEx.min,kcal,icon:(atv as any).icon||"🏅"}]);
              setAddEx(p=>({...p,show:false,min:""}));
            }} style={{...btn(),flex:2,opacity:addEx.min?1:0.4}}>Salvar</button>
          </div>
        </div>
      </div>}

      {/* Análise IA */}
      <button onClick={async()=>{
        setLoadingAnalise(true);
        const t = await analisarDia(perfil,{calIn,calEx,agua,check:Object.values(checked).filter(Boolean).length,total:cardapio?.length||5});
        setAnalise(t); setLoadingAnalise(false);
      }} disabled={loadingAnalise} style={{...btn(),width:"100%",padding:14,marginBottom:analise?12:0}}>
        {loadingAnalise?"✨ Analisando...":"🤖 Analisar meu dia com IA"}
      </button>
      {analise && <div style={{background:"rgba(16,185,129,0.06)",border:`1px solid rgba(16,185,129,0.2)`,borderRadius:12,padding:16,fontSize:13,color:C.text,lineHeight:1.8,whiteSpace:"pre-wrap"}}>{analise}</div>}
    </>}

    {/* ── CALORIAS ── */}
    {aba==="cal" && <>
      <h3 style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:20}}>Balanço calórico</h3>
      <div style={{textAlign:"center",marginBottom:28}}>
        <div style={{display:"inline-flex",flexDirection:"column",alignItems:"center",justifyContent:"center",width:160,height:160,borderRadius:"50%",position:"relative",background:`conic-gradient(${deficit>0?C.accent:C.red} ${Math.min(100,Math.abs(deficit)/perfil.get*100)}%, rgba(255,255,255,0.05) 0%)`}}>
          <div style={{position:"absolute",inset:14,borderRadius:"50%",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
            <div style={{fontSize:10,color:C.muted,letterSpacing:2}}>{deficit>0?"DÉFICIT":"EXCESSO"}</div>
            <div style={{fontSize:28,fontWeight:800,color:deficit>0?C.accent:C.red}}>{Math.abs(deficit)}</div>
            <div style={{fontSize:10,color:C.muted}}>kcal</div>
          </div>
        </div>
      </div>
      {[
        {lb:"Taxa basal (TMB)",v:perfil.tmb,cor:C.muted,icon:"🧬"},
        {lb:"Gasto total (GET)",v:perfil.get,cor:"#818cf8",icon:"⚙️"},
        {lb:"Queimado (exercício)",v:calEx,cor:C.accent,icon:"🏃"},
        {lb:"Ingerido hoje",v:calIn,cor:C.yellow,icon:"🍽"},
        {lb:"Meta diária",v:perfil.calAlvo,cor:C.blue,icon:"🎯"},
      ].map(item=><div key={item.lb} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{fontSize:13,color:C.muted}}>{item.icon} {item.lb}</span>
        <span style={{fontSize:16,fontWeight:700,color:item.cor}}>{item.v} kcal</span>
      </div>)}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginTop:12}}>
        <div style={{fontSize:11,color:C.muted,letterSpacing:2,textTransform:"uppercase" as const,marginBottom:12}}>Macros do dia</div>
        {[["Proteína",totalMacros.prot,Math.round(calIn*0.25/4),"#60a5fa"],["Carboidrato",totalMacros.carb,Math.round(calIn*0.48/4),C.yellow],["Gordura",totalMacros.gord,Math.round(calIn*0.27/9),"#f472b6"]].map(([lb,v,meta,cor])=>(
          <div key={lb as string} style={{marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",marginBottom:5,fontSize:13}}>
              <span style={{color:C.text}}>{lb}</span>
              <span style={{color:cor as string}}>{v as number}g <span style={{color:C.muted,fontSize:11}}>/ {meta as number||0}g</span></span>
            </div>
            <Bar val={v as number} max={(meta as number)||1} color={cor as string} h={5}/>
          </div>
        ))}
      </div>
    </>}

    {/* ── HISTÓRICO ── */}
    {aba==="hist" && <>
      <h3 style={{fontSize:12,letterSpacing:4,color:C.accent,textTransform:"uppercase" as const,marginBottom:20}}>Últimos 7 dias</h3>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:12,padding:16,marginBottom:20}}>
        <div style={{fontSize:11,color:C.muted,marginBottom:14}}>Calorias ingeridas vs meta ({perfil.calAlvo} kcal)</div>
        <div style={{display:"flex",alignItems:"flex-end",gap:8,height:100}}>
          {hist.map((h,i)=>{
            const pct=(h.in/2500)*80; const ok=h.def>=500;
            return <div key={i} style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
              <div style={{fontSize:9,color:C.muted}}>{h.in}</div>
              <div style={{width:"100%",height:`${pct}px`,background:ok?C.accent:C.yellow,borderRadius:"4px 4px 0 0",minHeight:4}}/>
              <div style={{fontSize:9,color:C.muted,fontWeight:600}}>{h.d}</div>
            </div>;
          })}
        </div>
      </div>
      {hist.map((h,i)=><div key={i} style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"12px 16px",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div>
          <div style={{fontSize:14,fontWeight:600,color:C.text}}>{h.d}</div>
          <div style={{fontSize:11,color:C.muted,marginTop:2}}>{h.in} kcal ingeridas</div>
        </div>
        <div style={{textAlign:"right"}}>
          <div style={{fontSize:17,fontWeight:700,color:h.def>=500?C.accent:C.yellow}}>−{h.def}</div>
          <div style={{fontSize:10,color:C.muted}}>kcal déficit</div>
        </div>
      </div>)}
      <div style={{background:"rgba(16,185,129,0.06)",border:`1px solid rgba(16,185,129,0.15)`,borderRadius:12,padding:16,marginTop:4}}>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          <Stat label="Média kcal" val={Math.round(hist.reduce((a,h)=>a+h.in,0)/hist.length)} color={C.accent}/>
          <Stat label="Méd. déficit" val={Math.round(hist.reduce((a,h)=>a+h.def,0)/hist.length)} color={C.yellow} sub="kcal/dia"/>
          <Stat label="Streak" val="7 dias" color={C.blue}/>
        </div>
      </div>
    </>}

    </div>
  </div>;
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [perfil, setPerfil] = useState<any>(null);

  // Recuperar perfil salvo
  useEffect(()=>{
    const saved = localStorage.getItem("nutriai_perfil");
    if(saved) setPerfil(JSON.parse(saved));
  },[]);

  // Salvar perfil
  useEffect(()=>{
    if(perfil) localStorage.setItem("nutriai_perfil", JSON.stringify(perfil));
  },[perfil]);

  return <div style={{background:C.bg,minHeight:"100vh",color:C.text,fontFamily:"'DM Sans','Segoe UI',system-ui,sans-serif"}}>
    <div style={{background:"linear-gradient(180deg,#0d1f14 0%,transparent 100%)",borderBottom:`1px solid ${C.border}`,padding:"14px 20px",maxWidth:560,margin:"0 auto",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <span style={{fontSize:20}}>🥗</span>
        <span style={{fontSize:16,fontWeight:800,color:C.accent,letterSpacing:-0.5}}>NutriAI</span>
      </div>
      {perfil && <button onClick={()=>{setPerfil(null);localStorage.removeItem("nutriai_perfil");}} style={{...btn("ghost"),padding:"5px 12px",fontSize:11}}>✎ Perfil</button>}
    </div>
    {!perfil
      ? <Briefing onDone={(p: any)=>{
          const tmb=calcTMB(p); const get=calcGET(tmb,p.atv);
          const diff=parseFloat(p.peso)-parseFloat(p.pesoMeta);
          const deficitIdeal=Math.round((diff*7700)/(parseFloat(String(p.prazo))*7));
          const calAlvo=p.calAlvoCustom!==undefined?p.calAlvoCustom:get-deficitIdeal;
          setPerfil({...p,tmb,get,calAlvo,deficitIdeal});
        }}/>
      : <Dashboard perfil={perfil} onEdit={()=>{setPerfil(null);localStorage.removeItem("nutriai_perfil");}}/>
    }
  </div>;
}
