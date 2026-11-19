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
- **Products**: name, price, discount (percent/fixed with dates), colours with their own stock and 3–4+ photos each, product video, specs. The photos drive the "drag to rotate" viewer.
- **Orders**: status changes are recorded in history; cancelling returns stock. Print and CSV export included.
- Discounts, prices, delivery and stock are always recomputed on the server when an order is placed.

## Notes and limits
- Orders are Cash on Delivery only. No online payments are implemented.
- Admin lists load the latest 1000 orders.
- Anyone can read the public storefront data; only logged-in admins (rows in `admins`) can change anything.
- Fonts come from Google Fonts; the Supabase library from jsDelivr (needs internet).
