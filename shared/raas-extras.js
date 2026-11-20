/* RAAS extras: per-element typography, extra colours, wallet 360 video playback, branding extras.
   Loaded by BOTH the storefront (index.html) and the admin (admin/index.html).
   - In the admin it only provides the element list + helpers (no storefront hooks run).
   - In the storefront it layers on top of the existing code; nothing existing is replaced on disk.
   All settings live inside the existing site_config row (key "ext"), so no database change is needed. */
(function(){
"use strict";

/* ---------- every editable text element (also used by the admin Visual Editor) ----------
   id: stable key saved in the database | sel: where it is on the page | text: config path of its wording (or null) */
const EL=[
 {id:"announce",g:"Header",l:"Announcement bar",sel:".announce",text:"announcement.items",kind:"list"},
 {id:"logo",g:"Header",l:"Header logo / brand name",sel:"#logo",text:"brand.name",kind:"text"},
 {id:"navHome",g:"Header",l:"Menu: Home",sel:"nav a[data-t=navHome]",text:"text.navHome",kind:"text"},
 {id:"navWallets",g:"Header",l:"Menu: All wallets",sel:"nav a[data-t=navWallets]",text:"text.navWallets",kind:"text"},
 {id:"navAbout",g:"Header",l:"Menu: About us",sel:"nav a[data-t=navAbout]",text:"text.navAbout",kind:"text"},
 {id:"navContact",g:"Header",l:"Menu: Contact",sel:"nav a[data-t=navContact]",text:"text.navContact",kind:"text"},
 {id:"search",g:"Header",l:"Search button",sel:"#sbtn",text:"text.search",kind:"text"},
 {id:"cart",g:"Header",l:"Cart button",sel:"#cbtn",text:"text.cart",kind:"text"},
 {id:"heroTitle",g:"Homepage",l:"Hero heading",sel:"#hTitle",text:"hero.title",kind:"text"},
 {id:"heroDesc",g:"Homepage",l:"Hero description",sel:"#hDesc",text:"hero.desc",kind:"textarea"},
 {id:"heroBtn",g:"Homepage",l:"Hero button",sel:"#hBtn",text:"hero.btnText",kind:"text"},
 {id:"ticker",g:"Homepage",l:"Moving text band",sel:".ticker",text:"ticker.words",kind:"list"},
 {id:"saleTitle",g:"Homepage",l:"Sale strip heading",sel:".sale h3",text:"sale.label",kind:"text"},
 {id:"bannerTitle",g:"Homepage",l:"Motion banner heading",sel:".btxt h2",text:"banner.title",kind:"text"},
 {id:"bannerText",g:"Homepage",l:"Motion banner text",sel:".btxt p",text:"banner.text",kind:"textarea"},
 {id:"collTitle",g:"Products",l:"Products section heading",sel:"#wallets .head h2",text:"text.collectionTitle",kind:"text"},
 {id:"cardName",g:"Products",l:"Product name (cards)",sel:".pc h3",text:null,note:"Product names are edited under Products."},
 {id:"cardCat",g:"Products",l:"Product category (cards)",sel:".pc .cat",text:null,note:"Categories are edited under Categories."},
 {id:"cardPrice",g:"Products",l:"Product price (cards)",sel:".pc .pr",text:null,note:"Prices are edited under Products."},
 {id:"pdpTitle",g:"Product page",l:"Product page title",sel:"#pbody .info h1",text:null,note:"Open a product in the preview to see it."},
 {id:"pdpPrice",g:"Product page",l:"Product page price",sel:"#pbody .info .price",text:null,note:"Open a product in the preview to see it."},
 {id:"pdpDesc",g:"Product page",l:"Product page description",sel:"#pbody .info > p",text:null,note:"Open a product in the preview to see it."},
 {id:"aboutTitle",g:"About",l:"About heading",sel:".about h2",text:"text.aboutTitle",kind:"text"},
 {id:"aboutText",g:"About",l:"About description",sel:"#aboutTxt",text:"about.text",kind:"textarea"},
 {id:"contactInfo",g:"About",l:"Contact line (About section)",sel:"#contact",text:null,note:"Edit email / phone / address under \u201cMore content\u201d below."},
 {id:"footAbout",g:"Footer",l:"Footer text",sel:"#fAbout",text:"footer.about",kind:"textarea"},
 {id:"footHead",g:"Footer",l:"Footer column headings",sel:"footer h4",text:null,note:"Wording: Website > All website texts."},
 {id:"footLinks",g:"Footer",l:"Footer links",sel:"footer li",text:null,note:"Wording: Website > All website texts."},
 {id:"copyright",g:"Footer",l:"Copyright line",sel:".copy",text:"text.copyright",kind:"text"},
 {id:"btn",g:"Buttons",l:"All buttons (every button on the site)",sel:".btn",text:null,note:"Applies to every button. The hero button can also be styled on its own."}
];
/* order used when the visitor clicks inside the preview: most specific first */
const PICK_ORDER=["heroBtn","navHome","navWallets","navAbout","navContact","search","cart","logo","heroTitle","heroDesc","saleTitle","bannerTitle","bannerText","collTitle","cardName","cardCat","cardPrice","pdpTitle","pdpPrice","pdpDesc","aboutTitle","aboutText","contactInfo","footAbout","footHead","footLinks","copyright","ticker","announce","btn"];

const EXT_DEFAULTS={
  wallet:{enabled:true,autoplay:true,loop:true,speed:1},
  styles:{},
  colors:{soft:"",muted:"",heading:"",nav:"",cardBg:"",border:"",navHover:"",linkHover:"",btnHoverBg:"",btnHoverText:""},
  brand:{favicon:"",tagline:"",description:"",syncName:true}
};
const SERIF=["Cormorant Garamond","Playfair Display","Cinzel","DM Serif Display","Libre Baskerville"];

function clone(o){return JSON.parse(JSON.stringify(o))}
function mergeExt(saved){
  const o=clone(EXT_DEFAULTS),s=saved&&typeof saved==="object"?saved:{};
  for(const k of Object.keys(o)){if(s[k]&&typeof s[k]==="object")Object.assign(o[k],s[k])}
  return o;
}
const cssStr=v=>String(v).replace(/[^a-zA-Z0-9#%.,() \-]/g,"");
function decl(s,withSize){
  const d=[];
  if(withSize&&+s.size>0)d.push(`font-size:${+s.size}px`);
  if(s.family)d.push(`font-family:'${cssStr(s.family)}',${SERIF.includes(s.family)?"Georgia,serif":"system-ui,sans-serif"}`);
  if(s.weight)d.push(`font-weight:${+s.weight||400}`);
  if(s.color&&/^#[0-9a-f]{3,8}$/i.test(s.color))d.push(`color:${s.color}`);
  if(s.align&&/^(left|center|right|justify)$/.test(s.align))d.push(`text-align:${s.align}`);
  if(s.lh!==""&&s.lh!=null&&+s.lh>0)d.push(`line-height:${+s.lh}`);
  if(s.ls!==""&&s.ls!=null&&!isNaN(+s.ls))d.push(`letter-spacing:${+s.ls}px`);
  return d;
}
/* the stylesheet that implements every saved style + extra colour; !important so it always wins over the base design */
function genCSS(ext){
  ext=mergeExt(ext);const out=[];
  for(const id in ext.styles){
    const el=EL.find(e=>e.id===id)||(id==="heroBtn"?{sel:"#hBtn"}:null),s=ext.styles[id];if(!el||!s)continue;
    const base="html body "+el.sel,notHover=id==="btn"||id==="heroBtn";
    const main=decl(s,true).map(x=>x+"!important").join(";");
    if(main){
      if(notHover&&s.color){
        const c=decl({...s,color:""},true).map(x=>x+"!important").join(";");
        if(c)out.push(`${base}{${c}}`);
        out.push(`${base}:not(:hover){color:${s.color}!important}`);
      }else out.push(`${base}{${main}}`);
    }
    if(+s.sizeT>0)out.push(`@media(max-width:1024px){${base}{font-size:${+s.sizeT}px!important}}`);
    if(+s.sizeM>0)out.push(`@media(max-width:600px){${base}{font-size:${+s.sizeM}px!important}}`);
  }
  const c=ext.colors,ok=v=>v&&/^#[0-9a-f]{3,8}$/i.test(v),root=[];
  if(ok(c.soft))root.push(`--soft:${c.soft}`);if(ok(c.muted))root.push(`--muted:${c.muted}`);if(ok(c.border))root.push(`--line:${c.border}`);
  if(root.length)out.push(`:root{${root.join(";")}}`);
  if(ok(c.heading))out.push(`html body #wallets .head h2,html body .about h2,html body .info h1,html body .sale h3,html body .pdp h1{color:${c.heading}!important}`);
  if(ok(c.nav))out.push(`html body nav a,html body .ico{color:${c.nav}!important}`);
  if(ok(c.cardBg))out.push(`html body .pc{background:${c.cardBg}!important}`);
  if(ok(c.navHover))out.push(`html body nav a:hover{color:${c.navHover}!important}`);
  if(ok(c.linkHover))out.push(`html body footer li a:hover,html body .contact a:hover{color:${c.linkHover}!important}`);
  if(ok(c.btnHoverBg))out.push(`html body .btn::before{background:${c.btnHoverBg}!important}`);
  if(ok(c.btnHoverText))out.push(`html body .btn:hover{color:${c.btnHoverText}!important}`);
  return out.join("\n");
}
function fontsUsed(ext){
  const s=new Set();for(const id in (ext.styles||{})){const f=ext.styles[id]&&ext.styles[id].family;if(f)s.add(f)}return [...s];
}

window.RAAS_ELEMENTS=EL;window.RAAS_EXT_DEFAULTS=EXT_DEFAULTS;window.RAAS_extMerge=mergeExt;window.RAAS_genCSS=genCSS;

/* ===================== storefront-only hooks ===================== */
if(!document.getElementById("stage")||typeof applyAll!=="function")return;   // not the storefront: stop here

const wal=()=>Object.assign({},EXT_DEFAULTS.wallet,(CFG.ext&&CFG.ext.wallet)||{});

/* 1) Hero wallet video: honours enable/disable, autoplay, loop and speed; falls back to the fallback image */
const _mediaList=mediaList;
mediaList=function(){
  const w=wal(),m=HERO_MEDIA,keep=m.type,has=m.video||m.videoMobile;
  try{
    if(w.enabled===false&&keep==="video")m.type=(m.image||(SETTINGS.hero&&SETTINGS.hero.image))?"image":"3d";
    else if(w.enabled!==false&&has&&keep!=="video")m.type="video";            // an uploaded wallet video always shows
    return _mediaList();
  }finally{m.type=keep}
};
const _mvHTML=mvHTML;
mvHTML=function(v){
  if(v.kind!=="video")return _mvHTML(v);
  const w=wal(),auto=w.autoplay!==false&&!RM.matches,loop=w.loop!==false,rate=Math.min(4,Math.max(.1,+w.speed||1));
  const poster=v.poster||HERO_MEDIA.image||(SETTINGS.hero&&SETTINGS.hero.image)||"";
  return `<div class="fl"><video src="${esc(v.src)}" ${poster?`poster="${esc(poster)}"`:""} muted playsinline preload="${auto?"auto":"metadata"}" ${loop?"loop":""} ${auto?"autoplay":"controls"} disablepictureinpicture data-rate="${rate}"></video></div>`;
};
document.addEventListener("loadedmetadata",e=>{const v=e.target;if(v&&v.tagName==="VIDEO"&&v.dataset.rate)v.playbackRate=+v.dataset.rate},true);
document.addEventListener("error",e=>{                                         // broken video file -> show the fallback image / built-in wallet
  const v=e.target;if(!v||v.tagName!=="VIDEO"||!v.closest("#media"))return;
  const img=HERO_MEDIA.image||(SETTINGS.hero&&SETTINGS.hero.image),fl=v.closest(".fl");
  if(fl)fl.innerHTML=img?`<img src="${esc(img)}" alt="" decoding="async">`:`<div class="card3d">${hero3d()}</div>`;
},true);
/* do not restart the hero media while only unrelated settings change (keeps the video smooth during live editing) */
const _buildMedia=buildMedia;let sig="";
buildMedia=function(){
  const h=CFG.hero,s=JSON.stringify([h.mediaType,h.image,h.imageMobile,h.video,h.videoMobile,h.poster,h.views,h.viewInterval,h.sampleText,wal(),mq.matches]);
  if(s===sig&&$("#media").children.length)return;
  sig=s;_buildMedia();
};

/* 2) wrap applyAll: derive brand-name sync before drawing, then apply extras after */
const _applyAll=applyAll;
applyAll=function(){
  try{deriveBrand()}catch(e){console.warn("RAAS extras (brand)",e)}
  _applyAll.apply(this,arguments);
  try{applyExt()}catch(e){console.warn("RAAS extras",e)}
};
const DT=window.RAAS_DEFAULTS.text;
function deriveBrand(){
  const x=mergeExt(CFG.ext),n=(CFG.brand&&CFG.brand.name)||"RAAS";
  if(!x.brand.syncName||n==="RAAS")return;
  if(CFG.motion.loaderText==="RAAS")CFG.motion.loaderText=n;
  if(CFG.hero.sampleText==="RAAS")CFG.hero.sampleText=n;
  if(CFG.text.copyright===DT.copyright)CFG.text.copyright="\u00a9 "+n+". All rights reserved.";
  if(CFG.text.aboutTitle===DT.aboutTitle)CFG.text.aboutTitle="About "+n;
}
const loaded=new Set();
function loadFamilies(list){list.forEach(n=>{if(loaded.has(n))return;loaded.add(n);const l=document.createElement("link");l.rel="stylesheet";l.href="https://fonts.googleapis.com/css2?family="+encodeURIComponent(n).replace(/%20/g,"+")+":wght@400;500;600;700&display=swap";document.head.appendChild(l)})}
function setHead(sel,make,attr,val){let e=document.head.querySelector(sel);if(!val){if(e&&e.dataset.raas)e.remove();return}if(!e){e=make();e.dataset.raas="1";document.head.appendChild(e)}e.setAttribute(attr,val)}
let HI=null;
function applyExt(){
  const x=mergeExt(CFG.ext);
  let st=document.getElementById("raas-ext");if(!st){st=document.createElement("style");st.id="raas-ext";document.head.appendChild(st)}
  st.textContent=genCSS(x);
  loadFamilies(fontsUsed(x));
  const n=(CFG.brand&&CFG.brand.name)||"RAAS",b=x.brand;
  document.title=n+" \u2014 "+(b.tagline||"Premium Wallets");
  setHead('link[rel~="icon"]',()=>{const l=document.createElement("link");l.rel="icon";return l},"href",b.favicon);
  const desc=b.description||(CFG.footer&&CFG.footer.about)||"";
  let md=document.head.querySelector('meta[name="description"]');if(md&&desc)md.setAttribute("content",desc);
  const fl=document.getElementById("flogo");
  let tg=document.getElementById("raas-tagline");
  if(b.tagline&&fl){if(!tg){tg=document.createElement("p");tg.id="raas-tagline";tg.style.cssText="margin-top:10px;font-size:13px;letter-spacing:.12em;opacity:.8";fl.after(tg)}tg.textContent=b.tagline}else if(tg)tg.remove();
  const fa=document.getElementById("fAbout");if(fa&&!(CFG.footer&&CFG.footer.about)&&b.description)fa.textContent=b.description;
  if(PREVIEW)mark();
}

/* 3) preview-only helpers: click an element in the preview to select it in the admin editor */
if(PREVIEW){
  const s=document.createElement("style");
  s.textContent="[data-raas-hi]{outline:2px solid #2f7bff!important;outline-offset:3px}[data-raas-hv]{outline:1px dashed #2f7bff!important;outline-offset:3px}"+
   "body .hero h1 .w i{animation:none!important;transform:none!important}body .hero p,body .hero .btn{animation:none!important}body .hero .btn{opacity:1!important}body .mv.first{animation:none!important}";
  document.head.appendChild(s);
  let sel=true;
  const byId=id=>(EL.find(e=>e.id===id)||{}).sel;
  const pickAt=t=>{if(!t||!t.closest)return null;for(const id of PICK_ORDER){const q=byId(id);if(q&&t.closest(q))return id}return null};
  window.mark=function mark(){
    document.querySelectorAll("[data-raas-hi]").forEach(e=>e.removeAttribute("data-raas-hi"));
    if(HI){const q=byId(HI);if(q)document.querySelectorAll(q).forEach(e=>e.setAttribute("data-raas-hi",""))}
  };
  addEventListener("click",e=>{
    if(!sel)return;const id=pickAt(e.target);if(!id)return;
    e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();
    parent.postMessage({raasSelect:id},"*");
  },true);
  addEventListener("mouseover",e=>{
    document.querySelectorAll("[data-raas-hv]").forEach(x=>x.removeAttribute("data-raas-hv"));
    if(!sel)return;const id=pickAt(e.target);if(!id)return;const q=byId(id),el=e.target.closest(q);if(el)el.setAttribute("data-raas-hv","")
  });
  addEventListener("message",e=>{
    if(e.source!==window.parent||!e.data)return;
    if("raasMode" in e.data)sel=!!e.data.raasMode.select;
    if("raasHi" in e.data){
      HI=e.data.raasHi;mark();
      const q=HI&&byId(HI),el=q&&document.querySelector(q);
      if(el&&el.offsetParent){const r=el.getBoundingClientRect();if(r.top<0||r.bottom>innerHeight)el.scrollIntoView({behavior:"smooth",block:"center"})}
    }
    if("raasStyle" in e.data){                                              // admin asks for the real computed style of an element
      const q=byId(e.data.raasStyle),el=q&&document.querySelector(q);
      if(el){const c=getComputedStyle(el);parent.postMessage({raasStyleInfo:{id:e.data.raasStyle,size:parseFloat(c.fontSize),family:c.fontFamily,weight:c.fontWeight,color:c.color,align:c.textAlign,lh:c.lineHeight,ls:c.letterSpacing,fs:parseFloat(c.fontSize)}},"*")}
    }
  });
}else window.mark=function(){};

/* if the page already finished its first draw before this file loaded, apply once now */
if(document.body.classList.contains("ready")||document.getElementById("hTitle").children.length){try{applyExt()}catch(e){}}
})();
