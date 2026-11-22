# RAAS — premium wallets store + admin

A static website (storefront + admin dashboard) that uses **Supabase** for the database, login and image/video storage.
No server of your own is needed, so it can be hosted free on **GitHub Pages**, Netlify or Vercel.

```
index.html              customer storefront
admin/index.html        admin dashboard  (open /admin/)
shared/config.js        every default text/colour/motion setting + the admin form schema
shared/supabase-config.js   your Supabase URL + anon key (you fill this in)
supabase/schema.sql     tables, security rules, order functions, storage bucket
```

## 1. Set up Supabase (10 minutes, free plan is enough)
1. Create a project at supabase.com.
2. **SQL Editor → New query →** paste all of `supabase/schema.sql` → **Run**.
3. **Authentication → Users → Add user**: your email + a strong password (tick "auto confirm").
4. SQL Editor, run this with your email to make yourself the owner:
   `insert into admins(user_id,role) select id,'owner' from auth.users where email='you@example.com';`
   (More staff later: add them as users, insert with role `'staff'`. Staff manage products/orders but cannot change website settings or coupons' site config.)
5. **Project Settings → API**: copy *Project URL* and the *anon public* key into `shared/supabase-config.js`.
   Never use the `service_role` key anywhere in this project.
6. **Authentication → URL Configuration**: add your site address to *Site URL* once it is live.

## 2. Put it on GitHub and publish
1. Create a repository, upload everything in this folder (keep the folder structure).
2. **Settings → Pages →** Deploy from branch `main`, folder `/ (root)`.
3. Storefront: `https://<you>.github.io/<repo>/` — Admin: `https://<you>.github.io/<repo>/admin/`

## 3. Using the admin
- **Website**: every text, colour, font, logo, hero image/video/extra views, each motion effect (on/off + overall speed), section order, sale banner, delivery charges, policies. A live preview on the right updates as you type; **Save & publish** makes it live.
- **Products**: name, price, discount (percent/fixed with dates), colours (name + HEX code, e.g. #000080) with their own stock, product video, specs. The photos drive the "drag to rotate" viewer.
- **Orders**: status changes are recorded in history; cancelling returns stock. Print and CSV export included.
- **Coupons & Discounts**: percentage codes for the whole site, chosen products or chosen categories, with start/expiry dates, usage limit, minimum order and Active/Inactive. Customers apply them at checkout; the server checks and calculates every discount.
- Discounts, prices, delivery and stock are always recomputed on the server when an order is placed.

## What the Website page controls (Admin → Website)
Brand/logo, colours, **section colours** (hero, announcement bar, moving band, sale strip, products, about, footer, header text, product page), typography, **text sizes** for headings/menu/buttons/prices/footer and more,
announcement bar, hero text + wallet image/video/extra views, **extra motion graphics** (hero background video, plus any number of floating images/GIFs/videos with position, size, opacity and movement),
a **motion banner** section (video or image with text and button; switch it on under Homepage sections), curtain text/logo, each motion effect on/off and overall speed, homepage section order,
sale banner, delivery, policies, footer, **Instagram / WhatsApp / Facebook / TikTok / YouTube / email / phone / address**, and every label on the site.
The panel on the right is the real storefront and updates as you type; choosing a section on the left scrolls the preview to it.

## Notes and limits
- Orders are Cash on Delivery only. No online payments are implemented.
- Admin lists load the latest 1000 orders.
- Anyone can read the public storefront data; only logged-in admins (rows in `admins`) can change anything.
- Fonts come from Google Fonts; the Supabase library from jsDelivr (needs internet).
