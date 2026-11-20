RAAS DESIGN + TRANSPARENT WALLET UPDATE: replace these 4 files (same folders), nothing else.

  index.html                 REPLACE  (storefront: new premium black & gold design, typography, hero)
  admin/index.html           REPLACE  (admin: simple 4-colour controls, wallet transparency settings)
  shared/config.js           REPLACE  (new default colours/fonts, simplified colour settings)
  shared/raas-extras.js      REPLACE  (transparent wallet video renderer)

Do NOT touch: shared/supabase-config.js, supabase/schema.sql, README.md, INSTALL.txt.
No SQL to run. Products, orders, images, videos and other settings are kept.

After uploading:
1. Open the website and press Ctrl+F5 (hard refresh) so the browser loads the new files.
2. Admin > 360° Wallet Display: check the message under your video (it tells you if the file is
   really transparent). Press Publish once so the new colours/fonts are saved.
3. Optional: Admin > Website > Hero: write the headline like  Carry Your *Identity*
   (words between *stars* are shown in light italic, like the reference).
