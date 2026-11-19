/* RAAS shared configuration: defaults + the schema the Admin uses to build its forms.
   Every value below can be changed from Admin > Website. Saved values (Supabase table
   site_config) are merged over these defaults, so a missing value never breaks the site. */
(function(){
const D={
  brand:{name:"RAAS",logoUrl:"",logoHeight:30,footerLogoUrl:"",footerLogoHeight:26},
  theme:{primary:"#000000",secondary:"#ffffff",bg:"#ffffff",text:"#0a0a0a",btn:"#000000",btnText:"#ffffff",header:"#ffffff",footer:"#000000",accent:"#000000",
         headFont:"Cormorant Garamond",bodyFont:"Inter",headSize:100,bodySize:15,radius:0,spacing:100,columns:4},
  announcement:{enabled:true,items:["Cash on Delivery across Pakistan","Carry your identity"]},
  hero:{title:"CARRY YOUR IDENTITY.",desc:"Designed for everyday essentials. Crafted with attention to detail.",btnText:"EXPLORE COLLECTION",btnLink:"#wallets",
        mediaType:"3d",image:"",imageMobile:"",video:"",videoMobile:"",poster:"",views:[],viewInterval:4800,sampleText:"RAAS"},
  motion:{loader:true,loaderText:"RAAS",loaderMs:1200,reveal:true,mask:true,cardReveal:true,cursor:true,magnetic:true,shine:true,float:true,parallax:true,glow:true,ticker:true,speed:1},
  ticker:{words:["Bifold","Slim","Card Holders","Long","Everyday Essentials"]},
  sections:[{id:"ticker",show:true},{id:"sale",show:true},{id:"wallets",show:true},{id:"about",show:true}],
  sale:{enabled:false,label:"Sale",percent:10,endsAt:""},
  about:{text:"RAAS represents simplicity, confidence, and timeless everyday essentials. Our focus is on creating wallets that combine practical design with a refined aesthetic."},
  contact:{email:"",phone:"",whatsapp:"",instagram:"",address:""},
  delivery:{charge:"",freeAbove:"",info:"Cash on Delivery across Pakistan. Delivery charges are shown at checkout."},
  policies:{privacy:"",returns:""},
  footer:{about:"Premium wallets and everyday accessories."},
  text:{navHome:"HOME",navWallets:"ALL WALLETS",navAbout:"ABOUT US",navContact:"CONTACT",search:"SEARCH",searchPlaceholder:"Search wallets",cart:"CART",menu:"MENU",
    collectionTitle:"All Wallets",sortNew:"Newest",sortLo:"Price: low to high",sortHi:"Price: high to low",availAll:"All availability",availIn:"In stock",
    aboutTitle:"About RAAS",shopSale:"SHOP THE SALE",featured:"FEATURED",soldOut:"SOLD OUT",dragHint:"DRAG TO ROTATE",inStock:"In stock",outStock:"Out of stock",
    colour:"COLOUR",addToCart:"ADD TO CART",buyNow:"BUY NOW",deliveryTitle:"DELIVERY",specsTitle:"SPECIFICATIONS",offerEnds:"Offer ends in",autoRotate:"AUTO ROTATE",zoom:"ZOOM",
    closeBtn:"CLOSE ✕",yourCart:"YOUR CART",emptyCart:"Your cart is empty.",remove:"Remove",subtotal:"Subtotal",delivery:"Delivery",total:"Total",
    atCheckout:"Set at checkout",free:"Free",checkout:"CHECKOUT",placeOrder:"PLACE ORDER",fullName:"Full name",phone:"Phone number (03XX XXXXXXX)",address:"Complete address",city:"City",
    coupon:"Discount code (optional)",cod:"Cash on Delivery",couponNote:"The discount code is checked when you place the order.",
    footShop:"SHOP",footFollow:"FOLLOW",footPolicies:"POLICIES",privacy:"Privacy Policy",returns:"Return and Exchange Policy",copyright:"© RAAS. All rights reserved.",
    noBackend:"Ordering is not available yet.",orderDone:"Order {n} received. We will call you to confirm it."}
};
function merge(a,b){
  if(Array.isArray(a)||typeof a!=="object"||a===null)return b===undefined?a:b;
  const o={};for(const k in a)o[k]=merge(a[k],b&&typeof b==="object"?b[k]:undefined);
  if(b&&typeof b==="object")for(const k in b)if(!(k in o))o[k]=b[k];
  return o;
}
const FONTS=["Cormorant Garamond","Playfair Display","Cinzel","DM Serif Display","Libre Baskerville","Inter","Poppins","Montserrat","Manrope","Jost","Work Sans"];
const col=(k,l)=>({k:"theme."+k,l,t:"color"});
const tg=(k,l)=>({k:"motion."+k,l,t:"toggle"});
const S=[
 {id:"brand",title:"Brand & logo",fields:[
  {k:"brand.name",l:"Brand name",t:"text"},{k:"brand.logoUrl",l:"Header logo",t:"image"},{k:"brand.logoHeight",l:"Header logo height (px)",t:"range",min:16,max:80,step:1},
  {k:"brand.footerLogoUrl",l:"Footer logo (empty = header logo)",t:"image"},{k:"brand.footerLogoHeight",l:"Footer logo height (px)",t:"range",min:16,max:80,step:1}]},
 {id:"colours",title:"Colours",fields:[col("primary","Primary (hero, announcement bar)"),col("secondary","Secondary (text on primary)"),col("bg","Page background"),col("text","Text"),col("btn","Button"),col("btnText","Button text"),col("header","Header"),col("footer","Footer"),col("accent","Accent")]},
 {id:"type",title:"Typography & layout",fields:[
  {k:"theme.headFont",l:"Heading font",t:"select",opts:FONTS},{k:"theme.bodyFont",l:"Body font",t:"select",opts:FONTS},
  {k:"theme.headSize",l:"Heading size (%)",t:"range",min:60,max:140,step:5},{k:"theme.bodySize",l:"Body text size (px)",t:"range",min:13,max:18,step:1},
  {k:"theme.radius",l:"Corner roundness (px)",t:"range",min:0,max:24,step:1},{k:"theme.spacing",l:"Section spacing (%)",t:"range",min:50,max:160,step:5},
  {k:"theme.columns",l:"Products per row (desktop)",t:"select",opts:[3,4]}]},
 {id:"announcement",title:"Announcement bar",fields:[{k:"announcement.enabled",l:"Show the bar",t:"toggle"},{k:"announcement.items",l:"Messages (one per line)",t:"list"}]},
 {id:"hero",title:"Hero (wallet animation)",fields:[
  {k:"hero.title",l:"Headline",t:"text"},{k:"hero.desc",l:"Description",t:"textarea"},{k:"hero.btnText",l:"Button text",t:"text"},{k:"hero.btnLink",l:"Button link",t:"text"},
  {k:"hero.mediaType",l:"Wallet media (3d = built-in sample wallet)",t:"select",opts:["3d","image","video"]},
  {k:"hero.sampleText",l:"Text on the sample wallet",t:"text"},
  {k:"hero.image",l:"Wallet image (PNG/WebP, transparent best)",t:"image"},{k:"hero.imageMobile",l:"Wallet image for phones (optional)",t:"image"},
  {k:"hero.video",l:"Wallet video (MP4/WebM)",t:"video"},{k:"hero.videoMobile",l:"Wallet video for phones (optional)",t:"video"},{k:"hero.poster",l:"Video poster image (optional)",t:"image"},
  {k:"hero.views",l:"Extra views (back, inside...): hero cycles through them",t:"views"},{k:"hero.viewInterval",l:"Time per view (ms)",t:"range",min:2000,max:10000,step:200}]},
 {id:"motion",title:"Motion graphics",fields:[
  tg("loader","Opening curtain with brand name"),{k:"motion.loaderText",l:"Curtain text",t:"text"},{k:"motion.loaderMs",l:"Curtain duration (ms)",t:"range",min:300,max:4000,step:100},
  tg("reveal","Scroll reveal of blocks"),tg("mask","Headline mask reveal"),tg("cardReveal","Product image reveal"),tg("cursor","Custom cursor (desktop)"),tg("magnetic","Magnetic buttons"),
  tg("shine","Button shine sweep"),tg("float","Floating wallet"),tg("parallax","Pointer and scroll depth"),tg("glow","Hero spotlight"),tg("ticker","Moving text bands"),
  {k:"motion.speed",l:"Overall speed (1 = normal, 2 = twice as fast)",t:"range",min:.5,max:2,step:.1}]},
 {id:"ticker",title:"Moving text band",fields:[{k:"ticker.words",l:"Words (one per line)",t:"list"}]},
 {id:"sections",title:"Homepage sections",fields:[{k:"sections",l:"Order and visibility",t:"sections"}]},
 {id:"sale",title:"Store-wide sale",fields:[{k:"sale.enabled",l:"Sale active",t:"toggle"},{k:"sale.label",l:"Sale name",t:"text"},{k:"sale.percent",l:"Discount (%)",t:"range",min:1,max:90,step:1},{k:"sale.endsAt",l:"Ends at (empty = no countdown)",t:"datetime"}]},
 {id:"about",title:"About",fields:[{k:"about.text",l:"About text",t:"textarea"}]},
 {id:"contact",title:"Contact & social",fields:[{k:"contact.email",l:"Email",t:"text"},{k:"contact.phone",l:"Phone",t:"text"},{k:"contact.whatsapp",l:"WhatsApp number (with country code)",t:"text"},{k:"contact.instagram",l:"Instagram URL",t:"text"},{k:"contact.address",l:"Store address",t:"text"}]},
 {id:"delivery",title:"Delivery",fields:[{k:"delivery.charge",l:"Delivery charge (PKR)",t:"number"},{k:"delivery.freeAbove",l:"Free delivery above (PKR, empty = never)",t:"number"},{k:"delivery.info",l:"Delivery information on product pages",t:"textarea"}]},
 {id:"policies",title:"Policies",fields:[{k:"policies.privacy",l:"Privacy Policy",t:"textarea"},{k:"policies.returns",l:"Return and Exchange Policy",t:"textarea"}]},
 {id:"footer",title:"Footer",fields:[{k:"footer.about",l:"Footer text",t:"textarea"}]},
 {id:"text",title:"All website texts",fields:Object.keys(D.text).map(k=>({k:"text."+k,l:k.replace(/([A-Z])/g," $1").toLowerCase(),t:"text"}))}
];
window.RAAS_DEFAULTS=D;window.RAAS_SCHEMA=S;window.RAAS_merge=merge;
})();
