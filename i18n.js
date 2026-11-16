"use strict";
// Language layer. The app renders English; in Indonesian mode every text node is translated as it
// enters the page, so app.js needs no per-string changes.
//
// How a text is translated:
//   1. numbers, durations ("3 h 12 min") and money scales ("Rp 368 trillion", "$20.2 B") are lifted out
//      and replaced by "#", giving a key such as "# intermediate stops";
//   2. the key is looked up in I18N_ID (lang-id.js); the translation puts the numbers back in order
//      ("#"), or in a chosen order ("#2" = second number);
//   3. if the whole text is unknown it is split on " · " and then on ": " and each part is tried;
//   4. numbers are re-formatted for Indonesian (1,133,000 → 1.133.000, 3.16 → 3,16) either way.
// Links to Wikipedia keep their English labels and URLs.
const I18N=(()=>{
  const q=new URLSearchParams(location.search);
  let saved=null;try{saved=localStorage.getItem("whoosh-lang");}catch(e){}
  const lang=(q.get("lang")||saved||"en")==="id"?"id":"en";
  const dict=lang==="id"?(window.I18N_ID||{}):null;
  const missing=new Set();
  const TOKEN=/Rp \d[\d.,]* (?:trillion|billion|M)\b|(?:US)?\$\d[\d.,]* [BM]\b|\b\d+ h \d\d min\b|\b\d+ min\b|\d+(?:[.,]\d+)*/g;
  const swap=n=>n.replace(/[.,]/g,c=>c===","?".":",");
  const SCALE={trillion:"triliun",billion:"miliar",M:"juta",B:"miliar"};
  function locToken(tok){
    let m;
    if((m=/^Rp (\S+) (\w+)$/.exec(tok)))return"Rp "+swap(m[1])+" "+SCALE[m[2]];
    if((m=/^(?:US)?\$(\S+) (\w)$/.exec(tok)))return"US$"+swap(m[1])+" "+SCALE[m[2]];
    if((m=/^(\d+) h (\d\d) min$/.exec(tok)))return m[1]+" j "+m[2]+" mnt";
    if((m=/^(\d+) min$/.exec(tok)))return m[1]+" mnt";
    return swap(tok);
  }
  function lookup(text){            // text is trimmed; returns translated text or null
    const toks=[];const key=text.replace(TOKEN,t=>{toks.push(locToken(t));return"#";});
    if(!/[A-Za-z]{2}/.test(key))return key.replace(/#/g,()=>toks.shift());      // nothing but numbers and symbols
    const tpl=dict[key];
    if(tpl===undefined)return null;
    let i=0;return tpl.replace(/#(\d)?/g,(_,n)=>n?toks[n-1]:toks[i++]);
  }
  function part(text){
    const lead=/^\s*/.exec(text)[0],trail=/\s*$/.exec(text)[0],core=text.trim();
    if(!core)return text;
    let out=lookup(core);
    if(out===null){
      const cut=core.lastIndexOf(": ");
      if(cut>0){const a=lookup(core.slice(0,cut)),b=lookup(core.slice(cut+2));if(a!==null||b!==null){if(a===null)miss(core.slice(0,cut));if(b===null)miss(core.slice(cut+2));out=(a??locNums(core.slice(0,cut)))+": "+(b??locNums(core.slice(cut+2)));}}
    }
    if(out===null){miss(core);out=locNums(core);}
    return lead+out+trail;
  }
  const locNums=s=>s.replace(TOKEN,locToken);
  const miss=s=>missing.add(s.replace(TOKEN,"#"));
  function tr(text){
    if(!dict||!text||!/\S/.test(text))return text;
    if(/https?:\/\//.test(text)||/^\s*Wikipedia — /.test(text))return text;
    const core=text.trim(),whole=lookup(core);
    if(whole!==null)return text.replace(core,()=>whole);
    if(core.includes(" · "))return text.split(" · ").map(part).join(" · ");
    return part(text);
  }
  // ---- DOM: translate text nodes and a few attributes as they are added
  const done=new WeakMap(), ATTRS=["title","aria-label","placeholder"];
  const skip=el=>el&&(el.nodeName==="SCRIPT"||el.nodeName==="STYLE"||(el.classList&&(el.classList.contains("u")||el.classList.contains("notr"))));
  function textNode(n){
    if(skip(n.parentNode)||(n.parentNode&&n.parentNode.closest&&n.parentNode.closest(".notr")))return;
    const v=n.nodeValue;if(done.get(n)===v)return;
    const out=tr(v);done.set(n,out);if(out!==v)n.nodeValue=out;
  }
  function walk(root){
    if(root.nodeType===3){textNode(root);return;}
    if(root.nodeType!==1||skip(root))return;
    const els=[root,...root.querySelectorAll("[title],[aria-label],[placeholder]")];
    for(const el of els)for(const a of ATTRS){if(!el.hasAttribute||!el.hasAttribute(a))continue;const k="i18n_"+a.replace("-","_");if(el.dataset[k])continue;el.dataset[k]="1";el.setAttribute(a,tr(el.getAttribute(a)));}
    const w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const list=[];while(w.nextNode())list.push(w.currentNode);list.forEach(textNode);
  }
  function start(){
    document.documentElement.lang=lang;
    document.querySelectorAll("[data-lang]").forEach(b=>{b.classList.toggle("on",b.dataset.lang===lang);b.addEventListener("click",()=>setLang(b.dataset.lang));});
    if(!dict)return;
    document.title=tr(document.title);
    const md=document.querySelector('meta[name="description"]');if(md)md.setAttribute("content",tr(md.getAttribute("content")));
    walk(document.body);
    new MutationObserver(ms=>{for(const m of ms){if(m.type==="characterData")textNode(m.target);else m.addedNodes.forEach(walk);}})
      .observe(document.body,{childList:true,subtree:true,characterData:true});
  }
  function setLang(l){
    if(l===lang)return;
    try{localStorage.setItem("whoosh-lang",l);}catch(e){}
    const p=new URLSearchParams(location.search);p.set("lang",l);location.search=p.toString();
  }
  return {lang,tr,start,setLang,missing,dict};
})();
