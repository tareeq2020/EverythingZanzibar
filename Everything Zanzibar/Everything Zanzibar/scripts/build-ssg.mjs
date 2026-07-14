/* ============================================================================
   Everything Zanzibar — SSG pre-render (Phase 3)
   Pulls the LIVE Supabase catalogue and bakes static, fully-crawlable HTML for
   the yacht / hotel / experience routes (content + JSON-LD in the initial
   response), then writes sitemap.xml. Client interactivity (WhatsApp string
   builders, search/filter) hydrates AFTER paint via /assets/js/hydrate.js.

   Run:   npm run build:ssg          (uses .env — see .env.example)
   or:    SUPABASE_URL=… SUPABASE_ANON_KEY=… node scripts/build-ssg.mjs
   Needs: Node 18+ (global fetch) and @supabase/supabase-js.
   ============================================================================ */
import { createClient } from '@supabase/supabase-js';
import { writeFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT   = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOMAIN = 'https://everything-zanzibar.com';
const WA     = '255764317595';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY;   // publishable/anon — public catalogue reads only
if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('✗ Set SUPABASE_URL and SUPABASE_ANON_KEY'); process.exit(1); }
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

/* ---------------------------- helpers ---------------------------- */
const esc  = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));
const attr = s => String(s ?? '').replace(/"/g, '&quot;');
const slug = s => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g,'')
                   .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
const fromPrice = a => { const v=[a.price_single,a.price_double,a.price_triple,a.price_group].filter(x=>typeof x==='number'); return v.length?Math.min(...v):null; };
const img = u => !u ? `${DOMAIN}/assets/placeholder.webp` : u;

/* ---- responsive imagery via an image CDN (set IMG_CDN to activate srcset) ----
   Default = pass-through (single src) so the build works before a CDN is wired.
   Cloudflare Images example:  IMG_CDN=https://everything-zanzibar.com/cdn-cgi/image  */
const IMG_CDN = process.env.IMG_CDN || '';
const cdn    = (src, w, fmt) => IMG_CDN ? `${IMG_CDN}/width=${w},quality=72,format=${fmt}/${src}` : src;
const srcset = (src, fmt) => IMG_CDN ? [400,800,1200].map(w => `${cdn(src,w,fmt)} ${w}w`).join(', ') : src;
function picture(src, alt, w, h, { priority=false, sizes='(max-width:640px) 100vw, 33vw', cls='' } = {}){
  const s = img(src);
  return `<picture>
        <source type="image/avif" srcset="${attr(srcset(s,'avif'))}" sizes="${sizes}">
        <source type="image/webp" srcset="${attr(srcset(s,'webp'))}" sizes="${sizes}">
        <img${cls?` class="${cls}"`:''} src="${attr(s)}" alt="${attr(alt)}" width="${w}" height="${h}" ${priority?'loading="eager" fetchpriority="high"':'loading="lazy" decoding="async"'}>
      </picture>`;
}

/* ---- bidirectional hreflang for a route path e.g. 'yachts/luxury-catamaran/' ---- */
const hreflang = path => {
  const en = `${DOMAIN}/${path}`;
  return [
    ['en', en], ['en-GB', en], ['en-US', en],
    ['it-IT', `${DOMAIN}/it/${path}`], ['de-DE', `${DOMAIN}/de/${path}`], ['x-default', en]
  ].map(([h,u]) => `<link rel="alternate" hreflang="${h}" href="${u}">`).join('\n  ');
};

/* ---- full document shell (head SEO baked, hydrate.js deferred) ---- */
function page({ lang='en', path, title, desc, ogType='website', image, jsonld=[], body }) {
  const canon = `${DOMAIN}/${path}`;
  const ld = jsonld.map(o => `<script type="application/ld+json">\n${JSON.stringify(o, null, 2)}\n</script>`).join('\n  ');
  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(desc)}">
  <link rel="canonical" href="${canon}">
  ${hreflang(path)}
  <meta property="og:type" content="${ogType}">
  <meta property="og:site_name" content="Everything Zanzibar">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(desc)}">
  <meta property="og:url" content="${canon}">
  <meta property="og:image" content="${attr(image || DOMAIN + '/assets/og/home.jpg')}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="preconnect" href="${new URL(SUPABASE_URL).origin}" crossorigin>${IMG_CDN ? `\n  <link rel="preconnect" href="${new URL(IMG_CDN).origin}" crossorigin>` : ''}
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/assets/css/app.min.css">
  ${ld}
</head>
<body data-wa="${WA}">
${body}
  <script src="/assets/js/hydrate.js" defer></script>
</body>
</html>
`;
}

/* ---- baked WhatsApp messages (read by hydrate.js from data-wa-text) ---- */
const waYacht = y => `*EVERYTHING ZANZIBAR — Yacht charter enquiry*\n*Vessel:* ${y.name}\n*From:* ${y.price_label||'on request'}\n\nI'd like to charter this yacht. My preferred dates & party size:`;
const waHotel = h => `*EVERYTHING ZANZIBAR — Stay enquiry*\n*Hotel:* ${h.name}\n*Area:* ${h.area||''}\n\nI'd like availability & your partner rate. My dates & guests:`;
const waAct   = a => { const fp=fromPrice(a); return `*EVERYTHING ZANZIBAR — Experience enquiry*\n*Experience:* ${a.name}\n*Location:* ${a.location}\n${fp?('*From:* $'+fp+' / person'):''}\n\nI'd like to book this.`; };

/* ---------------------------- cards ---------------------------- */
const yachtCard = y => { const u=`/yachts/${slug(y.name)}/`; return `<article class="card" data-card data-name="${attr((y.name||'').toLowerCase())}">
    <a href="${u}" class="card-img">${picture(y.image_url, y.name+' - private charter, Zanzibar', 800, 520)}</a>
    <div class="card-body">
      <h3><a href="${u}">${esc(y.name)}</a></h3>
      <p class="meta">${esc(y.capacity||'')}</p>
      <p class="price" data-price>${esc(y.price_label||'On request')}</p>
      <a href="${u}" class="btn">View &amp; book &rarr;</a>
      <button type="button" class="btn-ghost" data-wa-text="${attr(waYacht(y))}">Quick enquiry</button>
    </div>
  </article>`; };

const hotelCard = h => `<article class="card" data-card data-name="${attr((h.name||'').toLowerCase())}" data-area="${attr((h.area||'').toLowerCase())}">
    <div class="card-img">${picture(h.image_url, h.name+' - '+(h.area||'')+', Zanzibar', 800, 520)}</div>
    <div class="card-body">
      <p class="eyebrow">${esc(h.area||'')}</p>
      <h3>${esc(h.name)}</h3>
      <ul class="tags">${(h.highlights||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
      <button type="button" class="btn" data-wa-text="${attr(waHotel(h))}">Enquire about this stay</button>
    </div>
  </article>`;

const actCard = a => { const u=`/experiences/${slug(a.name)}/`, fp=fromPrice(a); return `<article class="card" data-card data-name="${attr((a.name||'').toLowerCase())}" data-cat="${attr((a.category||'').toLowerCase())}">
    <a href="${u}" class="card-img">${picture(a.image_url, a.name+' - Zanzibar', 800, 520)}</a>
    <div class="card-body">
      <p class="eyebrow">${esc(a.category||'')}</p>
      <h3><a href="${u}">${esc(a.name)}</a></h3>
      <p class="meta">${esc(a.location||'')} &middot; ${esc(a.duration||'')}</p>
      <p class="price">${fp!==null?('from $'+fp+' / person'):'On request'}</p>
      <a href="${u}" class="btn">View &amp; book &rarr;</a>
    </div>
  </article>`; };

/* ---------------------------- JSON-LD ---------------------------- */
const orgRef = { '@type':'TravelAgency', '@id':`${DOMAIN}/#organization`, name:'Everything Zanzibar', url:`${DOMAIN}/` };
const crumb  = items => ({ '@context':'https://schema.org','@type':'BreadcrumbList',
  itemListElement: items.map((it,i)=>({ '@type':'ListItem', position:i+1, name:it.name, item:it.url })) });

/* ---------------------------- pages ---------------------------- */
function yachtDetail(y){
  const path=`yachts/${slug(y.name)}/`, price=fromPrice ? null : null;
  const offer = { '@type':'Offer', priceCurrency:'USD', availability:'https://schema.org/InStock', url:`${DOMAIN}/${path}` };
  const m=String(y.price_label||'').match(/([\d,]+)/); if(m) offer.price=m[1].replace(/,/g,'');
  const ld = [
    { '@context':'https://schema.org','@type':'Service','@id':`${DOMAIN}/${path}#service`,
      serviceType:'Private yacht charter', name:`${y.name} — Private Charter, Zanzibar`,
      description:y.description||`Private ${y.name} charter in Zanzibar with crew. ${(y.amenities||[]).join(', ')}.`,
      image:img(y.image_url), areaServed:{ '@type':'Place', name:'Zanzibar, Tanzania' }, provider:orgRef, offers:offer },
    crumb([{name:'Home',url:`${DOMAIN}/`},{name:'Yachts',url:`${DOMAIN}/yachts/`},{name:y.name,url:`${DOMAIN}/${path}`}])
  ];
  const body = `  <main class="detail">
    <nav class="crumbs"><a href="/everything-zanzibar.html">Home</a> / <a href="/yachts/">Yachts</a> / <span>${esc(y.name)}</span></nav>
    <h1>${esc(y.name)} — Private Charter in Zanzibar</h1>
    ${picture(y.image_url, y.name+' private charter, Zanzibar', 1200, 675, {priority:true, sizes:'100vw', cls:'hero'})}
    <p class="lede">${esc(y.description||'')}</p>
    <p class="meta">${esc(y.capacity||'')} &middot; <strong data-price>${esc(y.price_label||'On request')}</strong></p>
    <h2>On board</h2>
    <ul class="features">${(y.amenities||[]).map(t=>`<li>${esc(t)}</li>`).join('')}</ul>
    <button type="button" class="btn-primary" data-wa-text="${attr(waYacht(y))}">Charter via WhatsApp concierge</button>
  </main>`;
  return page({ path, title:`${y.name} Charter Zanzibar | Crew & Chef`.slice(0,60),
    desc:`Charter the ${y.name} privately in Zanzibar — ${y.capacity||''}. ${y.price_label||''}. Booked direct via concierge.`.slice(0,155),
    ogType:'product', image:img(y.image_url), jsonld:ld, body });
}

function activityDetail(a){
  const path=`experiences/${slug(a.name)}/`, fp=fromPrice(a);
  const offer = { '@type':'Offer', priceCurrency:'USD', availability:'https://schema.org/InStock', url:`${DOMAIN}/${path}` };
  if(fp!==null) offer.price=String(fp);
  const ld = [
    { '@context':'https://schema.org','@type':'TouristAttraction', name:a.name, description:a.visual_prompt||'',
      image:img(a.image_url), address:{ '@type':'PostalAddress', addressLocality:a.location, addressCountry:'TZ' } },
    { '@context':'https://schema.org','@type':'Product', name:a.name, image:img(a.image_url),
      description:a.visual_prompt||'', brand:orgRef, offers:offer },
    crumb([{name:'Home',url:`${DOMAIN}/`},{name:'Experiences',url:`${DOMAIN}/experiences/`},{name:a.name,url:`${DOMAIN}/${path}`}])
  ];
  const body = `  <main class="detail">
    <nav class="crumbs"><a href="/everything-zanzibar.html">Home</a> / <a href="/experiences/">Experiences</a> / <span>${esc(a.name)}</span></nav>
    <h1>${esc(a.name)} — Zanzibar</h1>
    ${picture(a.image_url, a.name+', Zanzibar', 1200, 675, {priority:true, sizes:'100vw', cls:'hero'})}
    <p class="meta">${esc(a.location||'')} &middot; ${esc(a.duration||'')} &middot; <strong>${fp!==null?('from $'+fp+' / person'):'On request'}</strong></p>
    <p class="lede">${esc(a.visual_prompt||'')}</p>
    <!-- hydrate.js mounts the live Pax calculator + WhatsApp reservation flow here -->
    <div data-booking="${attr(a.name)}" data-prices='${attr(JSON.stringify({single:a.price_single,double:a.price_double,triple:a.price_triple,group:a.price_group}))}'></div>
    <button type="button" class="btn-primary" data-wa-text="${attr(waAct(a))}">Book via WhatsApp concierge</button>
  </main>`;
  return page({ path, title:`${a.name} Zanzibar | Book Direct`.slice(0,60),
    desc:(a.visual_prompt||`Book ${a.name} in ${a.location}, Zanzibar.`).slice(0,155),
    ogType:'product', image:img(a.image_url), jsonld:ld, body });
}

const hubBody = (h1, intro, controls, cards) => `  <main class="hub">
    <header class="hub-head"><h1>${esc(h1)}</h1><p class="lede">${esc(intro)}</p></header>
    ${controls}
    <div class="grid" id="ssg-grid">
${cards}
    </div>
    <p class="empty" hidden>No matches — try another search.</p>
  </main>`;

function yachtHub(rows){
  const ld=[{ '@context':'https://schema.org','@type':'ItemList', name:'The Everything Zanzibar Fleet', numberOfItems:rows.length,
    itemListElement: rows.map((y,i)=>({ '@type':'ListItem', position:i+1, item:{ '@type':'Service', name:y.name, url:`${DOMAIN}/yachts/${slug(y.name)}/`, image:img(y.image_url) } })) },
    crumb([{name:'Home',url:`${DOMAIN}/`},{name:'Yachts',url:`${DOMAIN}/yachts/`}])];
  const controls=`<div class="filters"><input id="ssg-search" type="search" placeholder="Search the fleet…" aria-label="Search yachts"></div>`;
  return page({ path:'yachts/', title:'Private Yacht Charter Zanzibar | The Fleet', ogType:'website',
    desc:'Charter a private luxury yacht in Zanzibar — catamarans, motor yachts and sunset dhows with crew & chef. Booked direct via concierge.',
    jsonld:ld, body:hubBody('Private Yacht Charters in Zanzibar','Crewed catamarans, motor yachts and sunset dhows — chartered direct.',controls, rows.map(yachtCard).join('\n')) });
}
function hotelHub(rows){
  const ld=[{ '@context':'https://schema.org','@type':'ItemList', name:'The Zanzibar Staylist', numberOfItems:rows.length,
    itemListElement: rows.map((h,i)=>({ '@type':'ListItem', position:i+1, item:{ '@type':'LodgingBusiness', name:h.name, image:img(h.image_url),
      address:{ '@type':'PostalAddress', addressLocality:(h.area||'').split('·')[0].trim(), addressCountry:'TZ' } } })) },
    crumb([{name:'Home',url:`${DOMAIN}/`},{name:'Hotels',url:`${DOMAIN}/hotels/`}])];
  const controls=`<div class="filters"><input id="ssg-search" type="search" placeholder="Search stays…" aria-label="Search hotels"></div>`;
  return page({ path:'hotels/', title:'Luxury & Boutique Hotels in Zanzibar | The Staylist', ogType:'website',
    desc:"A handpicked collection of Zanzibar's best beachfront resorts, boutique hotels & private villas. Concierge booking, partner rates.",
    jsonld:ld, body:hubBody('The Zanzibar Staylist — Handpicked Hotels & Villas','Beachfront resorts, boutique houses and private villas, chosen by us.',controls, rows.map(hotelCard).join('\n')) });
}
function experienceHub(rows){
  const cats=[...new Set(rows.map(a=>a.category).filter(Boolean))];
  const ld=[{ '@context':'https://schema.org','@type':'ItemList', name:'Zanzibar Experiences', numberOfItems:rows.length,
    itemListElement: rows.map((a,i)=>({ '@type':'ListItem', position:i+1, item:{ '@type':'Product', name:a.name, url:`${DOMAIN}/experiences/${slug(a.name)}/`, image:img(a.image_url) } })) },
    crumb([{name:'Home',url:`${DOMAIN}/`},{name:'Experiences',url:`${DOMAIN}/experiences/`}])];
  const controls=`<div class="filters"><input id="ssg-search" type="search" placeholder="Search experiences…" aria-label="Search experiences">
      <div class="pills">${cats.map(c=>`<button type="button" data-filter="${attr(c.toLowerCase())}">${esc(c)}</button>`).join('')}<button type="button" data-filter="" class="on">All</button></div></div>`;
  return page({ path:'experiences/', title:'Things To Do in Zanzibar | Curated Experiences', ogType:'website',
    desc:'Curated Zanzibar experiences — marine safaris, Stone Town, spice tours, diving, kitesurfing and more. Book direct with our concierge.',
    jsonld:ld, body:hubBody('Curated Zanzibar Experiences','Marine safaris, Stone Town, spice tours, diving and adrenaline — handpicked.',controls, rows.map(actCard).join('\n')) });
}

/* ---------------------------- build ---------------------------- */
const urls = [];
async function emit(path, html){ const dir=join(ROOT,path); await mkdir(dir,{recursive:true}); await writeFile(join(dir,'index.html'), html); urls.push(`${DOMAIN}/${path}`); console.log('  ✓ /'+path); }

console.log('Fetching catalogue from Supabase…');
const [{data:yachts=[]}, {data:hotels=[]}, {data:acts=[]}] = await Promise.all([
  sb.from('yachts').select('*').order('sort'),
  sb.from('hotels').select('*').order('sort'),
  sb.from('activities').select('*').eq('is_active', true)
]);
console.log(`  yachts:${yachts.length}  hotels:${hotels.length}  experiences:${acts.length}`);

for (const y of yachts) await emit(`yachts/${slug(y.name)}/`, yachtDetail(y));
await emit('yachts/', yachtHub(yachts));
await emit('hotels/', hotelHub(hotels));
for (const a of acts) await emit(`experiences/${slug(a.name)}/`, activityDetail(a));
await emit('experiences/', experienceHub(acts));

/* sitemap (homepage + everything we generated) */
const sm = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${DOMAIN}/</loc><priority>1.0</priority></url>
${urls.map(u=>`  <url><loc>${u}</loc></url>`).join('\n')}
</urlset>
`;
await writeFile(join(ROOT,'sitemap.xml'), sm);
console.log(`\n✓ Pre-render complete — ${urls.length} catalogue pages + sitemap.xml`);
