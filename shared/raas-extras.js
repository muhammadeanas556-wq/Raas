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
 {id:"navShop",g:"Header",l:"Menu: Shop",sel:"nav a[data-t=navShop]",text:"text.navShop",kind:"text"},
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
 {id:"collTitle",g:"Products",l:"Products section heading",sel:"#shop .head h2",text:"text.collectionTitle",kind:"text"},
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
const PICK_ORDER=["heroBtn","navHome","navShop","navAbout","navContact","search","cart","logo","heroTitle","heroDesc","saleTitle","bannerTitle","bannerText","collTitle","cardName","cardCat","cardPrice","pdpTitle","pdpPrice","pdpDesc","aboutTitle","aboutText","contactInfo","footAbout","footHead","footLinks","copyright","ticker","announce","btn"];

const EXT_DEFAULTS={
  /* bgMode: auto = detect transparency / solid background automatically, none = show the file exactly as it is,
     key = always remove the solid background colour. tolerance = how strongly the background colour is removed.
     hevc = optional transparent HEVC (.mov/.mp4) copy for Safari / iPhone, which cannot show WebM transparency. */
  wallet:{enabled:true,autoplay:true,loop:true,speed:1,bgMode:"auto",tolerance:18,hevc:""},
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
  /* the old detailed colour overrides (ext.colors) are replaced by the 4 simple website colours (look.*),
     so they are intentionally no longer applied here */
  return out.join("\n");
}
function fontsUsed(ext){
  const s=new Set();for(const id in (ext.styles||{})){const f=ext.styles[id]&&ext.styles[id].family;if(f)s.add(f)}return [...s];
}

/* ---------- wallet video transparency: analysis (used by the storefront AND the admin) ----------
   Looks at the outer edge of a video frame:
   - edge pixels are transparent            -> "alpha"  (real transparent video, e.g. WebM VP9 with alpha in Chrome/Firefox/Edge)
   - edge pixels are one solid colour       -> "solid"  (background removed but exported to MP4/WebM without alpha,
                                                         or a WebM-alpha file in Safari which ignores alpha)
   - edge pixels vary (a real scene)        -> "scene"  */
function edgeStats(d,w,h){
  const px=[];let low=0,n=0;
  const add=(x,y)=>{const i=(y*w+x)*4;n++;if(d[i+3]<200)low++;else px.push(i)};
  for(let x=0;x<w;x++){add(x,0);add(x,1);add(x,h-1);add(x,h-2)}
  for(let y=2;y<h-2;y++){add(0,y);add(1,y);add(w-1,y);add(w-2,y)}
  if(low/n>.25)return {kind:"alpha"};
  const med=c=>{const a=px.map(i=>d[i+c]).sort((x,y)=>x-y);return a[a.length>>1]||0};
  const key=[med(0),med(1),med(2)];
  const near=px.filter(i=>Math.hypot(d[i]-key[0],d[i+1]-key[1],d[i+2]-key[2])<42).length/Math.max(1,px.length);
  return {kind:near>.72?"solid":"scene",key,near};
}
const hex2=k=>"#"+k.map(v=>Math.round(v).toString(16).padStart(2,"0")).join("");
function analyzeVideo(src){
  return new Promise(res=>{
    const v=document.createElement("video");let done=false;
    const fin=r=>{if(done)return;done=true;clearTimeout(tm);try{v.removeAttribute("src");v.load()}catch(e){}res(r)};
    const tm=setTimeout(()=>fin({kind:"unknown"}),15000);
    if(!/^blob:/.test(src))v.crossOrigin="anonymous";
    v.muted=true;v.playsInline=true;v.preload="auto";
    v.onerror=()=>fin({kind:"error"});
    v.onloadeddata=()=>{const t=Math.min(.25,(v.duration||1)/3);if(Math.abs(v.currentTime-t)<.01)grab();else{v.onseeked=grab;v.currentTime=t}};
    function grab(){
      try{const c=document.createElement("canvas");c.width=96;c.height=96;const x=c.getContext("2d",{willReadFrequently:true});
        x.drawImage(v,0,0,96,96);const r=edgeStats(x.getImageData(0,0,96,96).data,96,96);if(r.key)r.hex=hex2(r.key);
        r.w=v.videoWidth;r.h=v.videoHeight;fin(r)}
      catch(e){fin({kind:"blocked"})}
    }
    v.src=src;
  });
}
window.RAAS_analyzeVideo=analyzeVideo;

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
/* The wallet video is drawn as an isolated object: no rectangle, no frame.
   No poster image is used on purpose: a poster is a flat rectangle and would show before the first frame. */
const UA=navigator.userAgent,APPLE_WEBKIT=(/AppleWebKit/.test(UA)&&!/Chrome|Chromium|Edg|Android|OPR/.test(UA))||/CriOS|FxiOS|EdgiOS/.test(UA);
const _mvHTML=mvHTML;
mvHTML=function(v){
  if(v.kind!=="video")return _mvHTML(v);
  const w=wal(),auto=w.autoplay!==false&&!RM.matches,loop=w.loop!==false,rate=Math.min(4,Math.max(.1,+w.speed||1));
  const hevc=APPLE_WEBKIT&&w.hevc&&!mq.matches?w.hevc:"",src=hevc||v.src;     // Safari / iPhone: real transparent HEVC copy if uploaded
  return `<div class="fl"><div class="wv ${hevc?"native":""}" data-mode="${hevc?"none":esc(w.bgMode||"auto")}" data-tol="${+w.tolerance||18}" data-auto="${auto?1:0}">`+
    `<video src="${esc(src)}" crossorigin="anonymous" data-cors="1" muted playsinline preload="auto" ${loop?"loop":""} ${auto?"autoplay":""} disablepictureinpicture disableremoteplayback data-rate="${rate}"></video><canvas aria-hidden="true"></canvas></div></div>`;
};
document.addEventListener("loadedmetadata",e=>{const v=e.target;if(v&&v.tagName==="VIDEO"&&v.dataset.rate)v.playbackRate=+v.dataset.rate},true);
document.addEventListener("error",e=>{                                         // broken video file -> show the fallback image / built-in wallet
  const v=e.target;if(!v||v.tagName!=="VIDEO"||!v.closest("#media"))return;
  if(v.dataset.cors==="1"){                                                     // storage without CORS headers: retry plainly (no pixel processing possible)
    v.dataset.cors="0";v.removeAttribute("crossorigin");const s=v.getAttribute("src");v.removeAttribute("src");v.load();v.setAttribute("src",s);v.load();
    const b=v.closest(".wv");if(b)b.dataset.nocors="1";return;
  }
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

/* 1b) transparent wallet renderer.
   - real alpha video (WebM VP9 alpha / HEVC alpha): the <video> itself is shown, its transparency is kept.
   - solid background (e.g. MP4, which can never carry transparency): every frame is drawn on a WebGL canvas and the
     background colour is removed. Only background that is CONNECTED to the frame edge is removed (flood fill), so dark
     or light parts inside the wallet are kept even if they are close to the background colour. Edges are de-fringed. */
const VS="attribute vec2 p;varying vec2 u;void main(){u=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}";
const FS="precision mediump float;varying vec2 u;uniform sampler2D v;uniform sampler2D m;uniform vec3 k;uniform float t;uniform float s;uniform float dk;"+
  "void main(){vec4 c=texture2D(v,u);float ca=smoothstep(t,t+s,distance(c.rgb,k));float mm=texture2D(m,u).r;"+
  "float band=mix(clamp(mm*2.,0.,1.),1.,dk);float core=smoothstep(.75,.98,mm)*(1.-dk);float a=(1.-band*(1.-ca))*(1.-core);"+
  "vec3 f=a>.02?clamp((c.rgb-k*(1.-a))/a,0.,1.):c.rgb;gl_FragColor=vec4(f*a,a);}";
function makeGL(cv){
  const gl=cv.getContext("webgl",{premultipliedAlpha:true,alpha:true,antialias:false,preserveDrawingBuffer:false});if(!gl)return null;
  const sh=(t,src)=>{const s=gl.createShader(t);gl.shaderSource(s,src);gl.compileShader(s);if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw new Error(gl.getShaderInfoLog(s));return s};
  const pr=gl.createProgram();gl.attachShader(pr,sh(gl.VERTEX_SHADER,VS));gl.attachShader(pr,sh(gl.FRAGMENT_SHADER,FS));gl.linkProgram(pr);gl.useProgram(pr);
  const b=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,b);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const loc=gl.getAttribLocation(pr,"p");gl.enableVertexAttribArray(loc);gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
  const tex=i=>{const t=gl.createTexture();gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,t);
    [[gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE],[gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE],[gl.TEXTURE_MIN_FILTER,gl.LINEAR],[gl.TEXTURE_MAG_FILTER,gl.LINEAR]].forEach(p=>gl.texParameteri(gl.TEXTURE_2D,p[0],p[1]));return t};
  const tv=tex(0),tm=tex(1);gl.uniform1i(gl.getUniformLocation(pr,"v"),0);gl.uniform1i(gl.getUniformLocation(pr,"m"),1);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT,1);gl.clearColor(0,0,0,0);
  return {gl,tv,tm,uk:gl.getUniformLocation(pr,"k"),ut:gl.getUniformLocation(pr,"t"),us:gl.getUniformLocation(pr,"s"),ud:gl.getUniformLocation(pr,"dk")};
}
function initWallet(box){
  if(box._on)return;box._on=1;
  const v=box.querySelector("video"),cv=box.querySelector("canvas"),wantAuto=box.dataset.auto==="1";
  let mode=box.dataset.mode||"auto",G=null,key=null,dark=false,mw=0,mh=0,sx=null,sctx=null,fr=null,fctx=null,mask=null,near=null,q=null,decided=false;
  const tol=Math.min(.9,Math.max(.02,(+box.dataset.tol||18)/100)),soft=Math.max(.05,tol*.8);
  const set=st=>{box.classList.remove("native","key","plain");box.classList.add(st);box.classList.add("ok")};
  if(mode==="none"){set("native");decided=true}
  const failsafe=setTimeout(()=>{if(!decided){decided=true;set("plain")}},7000);
  function decide(){
    if(decided||v.readyState<2)return;
    if(box.dataset.nocors==="1"){decided=true;set(mode==="none"?"native":"plain");return}
    let r;try{const c=document.createElement("canvas");c.width=c.height=96;const x=c.getContext("2d",{willReadFrequently:true});x.drawImage(v,0,0,96,96);r=edgeStats(x.getImageData(0,0,96,96).data,96,96)}
    catch(e){r={kind:"blocked"}}
    decided=true;clearTimeout(failsafe);
    if(r.kind==="alpha"&&mode!=="key"){set("native");return}
    if(r.kind==="blocked"||!r.key){set("plain");return}
    if(r.kind==="scene"&&mode!=="key"){set("plain");return}
    key=r.key;startKey();
  }
  function startKey(){
    try{G=makeGL(cv)}catch(e){console.warn("RAAS wallet: WebGL unavailable",e);G=null}
    if(!G){set("plain");return}
    const vw=v.videoWidth||720,vh=v.videoHeight||720,sc=Math.min(1,1280/Math.max(vw,vh));
    cv.width=Math.round(vw*sc);cv.height=Math.round(vh*sc);G.gl.viewport(0,0,cv.width,cv.height);
    fr=document.createElement("canvas");fr.width=cv.width;fr.height=cv.height;fctx=fr.getContext("2d");   // one frozen frame feeds BOTH the mask and the picture
    const ms=Math.min(1,200/Math.max(vw,vh));mw=Math.max(16,Math.round(vw*ms));mh=Math.max(16,Math.round(vh*ms));
    sx=document.createElement("canvas");sx.width=mw;sx.height=mh;sctx=sx.getContext("2d",{willReadFrequently:true});
    mask=new Uint8Array(mw*mh);near=new Uint8Array(mw*mh);q=new Int32Array(mw*mh);
    /* Black video background + dark website background (e.g. a black leather wallet filmed on black):
       black leather and black background cannot be told apart by an edge-flood mask, which punched blocky holes
       into the wallet. Here every pixel is blended by its own colour only (no mask): the composite is
       video + (1-alpha)*(page - key), so a wallet pixel is never shown darker than in the video, black background
       melts into the page colour, and there are no holes, blocks or flicker. */
    const pb=/#([0-9a-f]{6})/i.exec(getComputedStyle(document.documentElement).getPropertyValue("--bg")||""),pn=pb?parseInt(pb[1],16):0;
    const pageL=pb?(.2126*(pn>>16)+.7152*(pn>>8&255)+.0722*(pn&255))/255:0;
    dark=Math.max(key[0],key[1],key[2])<=48&&pageL<.25;
    G.gl.uniform3f(G.uk,key[0]/255,key[1]/255,key[2]/255);
    G.gl.uniform1f(G.ut,dark?.03:tol);G.gl.uniform1f(G.us,dark?.06+tol*.2:soft);G.gl.uniform1f(G.ud,dark?1:0);
    if(dark){mask.fill(0);G.gl.activeTexture(G.gl.TEXTURE1);G.gl.bindTexture(G.gl.TEXTURE_2D,G.tm);G.gl.texImage2D(G.gl.TEXTURE_2D,0,G.gl.LUMINANCE,mw,mh,0,G.gl.LUMINANCE,G.gl.UNSIGNED_BYTE,mask)}
    set("key");draw();loop();
  }
  function buildMask(){
    sctx.clearRect(0,0,mw,mh);sctx.drawImage(fr,0,0,mw,mh);const d=sctx.getImageData(0,0,mw,mh).data,lim=(tol+soft*.5)*255,n=mw*mh;
    for(let i=0,j=0;i<n;i++,j+=4)near[i]=Math.hypot(d[j]-key[0],d[j+1]-key[1],d[j+2]-key[2])<lim?1:0;
    mask.fill(0);let h=0,t=0;const push=i=>{if(near[i]&&!mask[i]){mask[i]=255;q[t++]=i}};
    for(let x=0;x<mw;x++){push(x);push((mh-1)*mw+x)}for(let y=0;y<mh;y++){push(y*mw);push(y*mw+mw-1)}
    while(h<t){const i=q[h++],x=i%mw;if(x>0)push(i-1);if(x<mw-1)push(i+1);if(i>=mw)push(i-mw);if(i<n-mw)push(i+mw)}
    /* 255 = deep background (always fully removed, also clears compression specks),
       160 = edge band around the wallet (removed only where the pixel really has the background colour), 0 = wallet */
    near.set(mask);
    for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const i=y*mw+x;if(!near[i])continue;
      const all=(x===0||near[i-1])&&(x===mw-1||near[i+1])&&(y===0||near[i-mw])&&(y===mh-1||near[i+mw])&&(x===0||y===0||near[i-mw-1])&&(x===mw-1||y===0||near[i-mw+1])&&(x===0||y===mh-1||near[i+mw-1])&&(x===mw-1||y===mh-1||near[i+mw+1]);
      if(!all)mask[i]=160}
    for(let pass=0;pass<2;pass++){                                    // widen the edge band a little into the wallet side
      near.set(mask);for(let y=0;y<mh;y++)for(let x=0;x<mw;x++){const i=y*mw+x;if(near[i])continue;
        if((x>0&&near[i-1])||(x<mw-1&&near[i+1])||(y>0&&near[i-mw])||(y<mh-1&&near[i+mw]))mask[i]=160}
    }
  }
  function draw(){
    if(!G||v.readyState<2)return;
    try{fctx.clearRect(0,0,fr.width,fr.height);fctx.drawImage(v,0,0,fr.width,fr.height);if(!dark)buildMask()}catch(e){console.warn("RAAS wallet",e);set("plain");G=null;return}
    const gl=G.gl;
    gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,G.tv);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,fr);
    if(!dark){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,G.tm);gl.texImage2D(gl.TEXTURE_2D,0,gl.LUMINANCE,mw,mh,0,gl.LUMINANCE,gl.UNSIGNED_BYTE,mask)}
    gl.clear(gl.COLOR_BUFFER_BIT);gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
  }
  let last=-1;
  function loop(){
    if(!box.isConnected||!G)return;
    if(v.requestVideoFrameCallback){v.requestVideoFrameCallback(()=>{draw();loop()});return}
    requestAnimationFrame(()=>{if(v.currentTime!==last){last=v.currentTime;draw()}loop()});
  }
  v.addEventListener("loadeddata",()=>{decide();if(G)draw()});
  v.addEventListener("seeked",()=>{if(G)draw()});
  if(v.readyState>=2)decide();
  if(wantAuto){const kick=()=>{if(box.isConnected&&v.paused){const p=v.play();if(p&&p.catch)p.catch(()=>{})}};v.addEventListener("canplay",kick);kick()}
  box.addEventListener("click",()=>{if(v.paused){const p=v.play();if(p&&p.catch)p.catch(()=>{})}else if(!wantAuto)v.pause()});
}
new MutationObserver(()=>document.querySelectorAll("#media .wv").forEach(initWallet)).observe(document.getElementById("media"),{childList:true,subtree:true});

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
  document.title=n+" \u2014 "+(b.tagline||"Modern Clothing");
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
if(document.body.classList.contains("ready")||document.getElementById("hTitle").children.length){try{applyExt();buildMedia()}catch(e){}}
document.querySelectorAll("#media .wv").forEach(initWallet);
})();
