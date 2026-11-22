-- RAAS database. Run once in Supabase: SQL Editor > New query > paste > Run.
create extension if not exists pgcrypto;

create table if not exists admins(
  user_id uuid primary key references auth.users on delete cascade,
  role text not null default 'owner' check (role in ('owner','staff')));

create or replace function is_admin() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from admins where user_id=auth.uid()) $$;
create or replace function is_owner() returns boolean language sql stable security definer set search_path=public as
$$ select exists(select 1 from admins where user_id=auth.uid() and role='owner') $$;

create table if not exists site_config(id text primary key, data jsonb not null default '{}', updated_at timestamptz default now());
create table if not exists categories(
  id uuid primary key default gen_random_uuid(), slug text unique not null, name text not null,
  image text, sort int default 0, active boolean default true);
create table if not exists products(
  id uuid primary key default gen_random_uuid(), name text not null,
  category_id uuid references categories(id) on delete set null,   -- deleting a category never deletes products
  description text default '', price numeric check (price is null or price>=0),
  discount_type text check (discount_type in ('percent','fixed')), discount_value numeric,
  discount_start timestamptz, discount_end timestamptz,
  featured boolean default false, active boolean default true,
  video_url text, specs jsonb default '[]', sort int default 0, created_at timestamptz default now(),
  image text, sku text, sale_price numeric check (sale_price is null or sale_price>=0));
create table if not exists product_colours(
  id uuid primary key default gen_random_uuid(), product_id uuid not null references products(id) on delete cascade,
  name text not null, hex text default '#141414' constraint product_colours_hex_chk check (hex ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$'), stock int not null default 0 check (stock>=0),
  images text[] default '{}', sort int default 0);
create table if not exists coupons(
  id uuid primary key default gen_random_uuid(), code text unique not null, type text not null check (type in ('percent','fixed')),
  value numeric not null check (value>0), starts_at timestamptz, ends_at timestamptz, max_uses int, used int not null default 0, active boolean default true,
  scope text not null default 'all' constraint coupons_scope_chk check (scope in ('all','products','categories')),
  product_ids uuid[] not null default '{}', category_ids uuid[] not null default '{}',
  min_order numeric constraint coupons_min_order_chk check (min_order is null or min_order>=0), created_at timestamptz default now(),
  constraint coupons_percent_chk check (type<>'percent' or value<=100),
  constraint coupons_dates_chk check (starts_at is null or ends_at is null or ends_at>starts_at));
create unique index if not exists coupons_code_upper_idx on coupons(upper(code));
create sequence if not exists order_number_seq start 1001;
create table if not exists orders(
  id uuid primary key default gen_random_uuid(), number bigint not null default nextval('order_number_seq') unique,
  customer_name text not null, phone text not null, email text, address text not null, city text not null,
  items jsonb not null, subtotal numeric not null, discount numeric not null default 0, delivery numeric not null default 0, total numeric not null,
  coupon_code text, payment_method text not null default 'cod',
  status text not null default 'pending' check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  created_at timestamptz default now());
create table if not exists order_history(
  id bigint generated always as identity primary key, order_id uuid not null references orders(id) on delete cascade,
  status text not null, note text, at timestamptz default now());

alter table admins enable row level security;
alter table site_config enable row level security;
alter table categories enable row level security;
alter table products enable row level security;
alter table product_colours enable row level security;
alter table coupons enable row level security;
alter table orders enable row level security;
alter table order_history enable row level security;

drop policy if exists p_admins_self on admins;     create policy p_admins_self on admins for select using (user_id=auth.uid() or is_owner());
drop policy if exists p_admins_owner on admins;    create policy p_admins_owner on admins for all using (is_owner()) with check (is_owner());
drop policy if exists p_cfg_read on site_config;   create policy p_cfg_read on site_config for select using (true);
drop policy if exists p_cfg_write on site_config;  create policy p_cfg_write on site_config for all using (is_owner()) with check (is_owner());
drop policy if exists p_cat_read on categories;    create policy p_cat_read on categories for select using (active or is_admin());
drop policy if exists p_cat_write on categories;   create policy p_cat_write on categories for all using (is_admin()) with check (is_admin());
drop policy if exists p_prod_read on products;     create policy p_prod_read on products for select using (active or is_admin());
drop policy if exists p_prod_write on products;    create policy p_prod_write on products for all using (is_admin()) with check (is_admin());
drop policy if exists p_col_read on product_colours;
create policy p_col_read on product_colours for select using (is_admin() or exists(select 1 from products p where p.id=product_id and p.active));
drop policy if exists p_col_write on product_colours; create policy p_col_write on product_colours for all using (is_admin()) with check (is_admin());
drop policy if exists p_cou_all on coupons;        create policy p_cou_all on coupons for all using (is_admin()) with check (is_admin());
drop policy if exists p_ord_all on orders;         create policy p_ord_all on orders for all using (is_admin()) with check (is_admin());
drop policy if exists p_hist_all on order_history; create policy p_hist_all on order_history for all using (is_admin()) with check (is_admin());
-- Customers cannot read or write orders directly; they can only call place_order() below.

create or replace function check_coupon(code text) returns jsonb language sql security definer set search_path=public as $$
  select jsonb_build_object('type',type,'value',value) from coupons
  where upper(coupons.code)=upper(check_coupon.code) and active and (starts_at is null or starts_at<=now())
    and (ends_at is null or ends_at>now()) and (max_uses is null or used<max_uses) limit 1 $$;

-------------------------------------------------------------------------------
-- 3. Shared price rules (one place, used by both the coupon check and place_order)
-------------------------------------------------------------------------------
create or replace function raas_sale_pct() returns numeric language plpgsql stable security definer set search_path=public as $$
declare cfg jsonb; ends text;
begin
  select data into cfg from site_config where id='main';
  cfg:=coalesce(cfg,'{}');
  ends:=nullif(cfg#>>'{sale,endsAt}','');
  if coalesce(cfg#>>'{sale,enabled}','false')='true' and (ends is null or ends::timestamptz>now()) then
    return coalesce(nullif(cfg#>>'{sale,percent}','')::numeric,0); end if;
  return 0;
end $$;

create or replace function raas_unit_price(prod products, sale_pct numeric) returns numeric language sql stable set search_path=public as $$
  select case
    when prod.sale_price is not null and prod.sale_price<prod.price then prod.sale_price
    when prod.discount_value is not null and (prod.discount_start is null or prod.discount_start<=now()) and (prod.discount_end is null or prod.discount_end>now())
      then case when prod.discount_type='percent' then round(prod.price*(1-prod.discount_value/100)) else greatest(0,prod.price-prod.discount_value) end
    when sale_pct>0 then round(prod.price*(1-sale_pct/100))
    else prod.price end $$;

-- Checks one coupon against the priced cart lines. Returns {"discount","eligible"} or {"error": message}.
create or replace function raas_coupon_eval(cp coupons, lines jsonb, sub numeric) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare l jsonb; elig numeric:=0; d numeric; ok boolean;
begin
  if not coalesce(cp.active,false) then return jsonb_build_object('error','This discount code is not active.'); end if;
  if cp.starts_at is not null and cp.starts_at>now() then return jsonb_build_object('error','This discount code is not active yet.'); end if;
  if cp.ends_at is not null and cp.ends_at<=now() then return jsonb_build_object('error','This discount code has expired.'); end if;
  if cp.max_uses is not null and cp.used>=cp.max_uses then return jsonb_build_object('error','This discount code has reached its usage limit.'); end if;
  if cp.min_order is not null and sub<cp.min_order then
    return jsonb_build_object('error',format('This code needs a minimum order of PKR %s. Add PKR %s more to use it.',
      to_char(cp.min_order,'FM999,999,999,990'),to_char(ceil(cp.min_order-sub),'FM999,999,999,990'))); end if;
  for l in select * from jsonb_array_elements(lines) loop
    ok:=case coalesce(cp.scope,'all')
      when 'all' then true
      when 'products' then (l->>'product_id')::uuid = any(cp.product_ids)
      when 'categories' then (select p.category_id from products p where p.id=(l->>'product_id')::uuid) = any(cp.category_ids)
      else false end;
    if coalesce(ok,false) then elig:=elig+(l->>'unit')::numeric*(l->>'qty')::int; end if;
  end loop;
  if elig<=0 then return jsonb_build_object('error','This discount code does not apply to the items in your cart.'); end if;
  d:=least(elig,case when cp.type='percent' then round(elig*cp.value/100) else cp.value end);
  return jsonb_build_object('discount',d,'eligible',elig);
end $$;

-------------------------------------------------------------------------------
-- 4. apply_coupon: used by the checkout "Apply" button. Read-only: it never uses up the coupon.
--    Prices come from the database, never from the browser.
-------------------------------------------------------------------------------
create or replace function apply_coupon(code text, items jsonb) returns jsonb language plpgsql stable security definer set search_path=public as $$
declare it jsonb; col record; prod products; q int; unit numeric; sub numeric:=0; lines jsonb:='[]'; sp numeric;
  cp coupons; ev jsonb; cfg jsonb; chg numeric; free numeric; ship numeric; d numeric;
begin
  if length(trim(coalesce(code,'')))=0 then raise exception 'Please enter a discount code.'; end if;
  if jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 30 then raise exception 'Your cart is empty'; end if;
  select * into cp from coupons c where upper(c.code)=upper(trim(apply_coupon.code)) limit 1;
  if not found then raise exception 'This discount code is not valid. Please check it and try again.'; end if;
  sp:=raas_sale_pct();
  for it in select * from jsonb_array_elements(items) loop
    if coalesce(it->>'colour_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'An item is no longer available'; end if;
    q:=greatest(1,least(10,coalesce((it->>'qty')::int,1)));
    select * into col from product_colours where id=(it->>'colour_id')::uuid;
    if not found then raise exception 'An item is no longer available'; end if;
    select * into prod from products where id=col.product_id and active;
    if not found or prod.price is null then raise exception 'An item is no longer available'; end if;
    unit:=raas_unit_price(prod,sp);
    sub:=sub+unit*q;
    lines:=lines||jsonb_build_object('product_id',prod.id,'qty',q,'unit',unit);
  end loop;
  ev:=raas_coupon_eval(cp,lines,sub);
  if ev ? 'error' then raise exception '%', ev->>'error'; end if;
  d:=(ev->>'discount')::numeric;
  select data into cfg from site_config where id='main'; cfg:=coalesce(cfg,'{}');
  chg:=coalesce(nullif(cfg#>>'{delivery,charge}','')::numeric,0);
  free:=nullif(cfg#>>'{delivery,freeAbove}','')::numeric;
  ship:=case when free is not null and sub>=free then 0 else chg end;
  return jsonb_build_object('code',cp.code,'type',cp.type,'value',cp.value,'scope',cp.scope,
    'subtotal',sub,'eligible',(ev->>'eligible')::numeric,'discount',d,'delivery',ship,'total',sub-d+ship);
end $$;

-------------------------------------------------------------------------------
-- 5. place_order: same as before, plus coupon scope / minimum order / clear error messages.
--    The coupon row is locked while the order is written, so its usage limit can never be exceeded.
-------------------------------------------------------------------------------
create or replace function place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare it jsonb; col record; prod products; unit numeric; sub numeric:=0; lines jsonb:='[]'; q int; cfg jsonb;
  sale_pct numeric:=0; chg numeric:=0; free numeric; ship numeric; cp coupons; ev jsonb; disc numeric:=0; ccode text;
  oid uuid; num bigint; tot numeric;
begin
  if length(trim(coalesce(payload->>'name','')))<2 or length(trim(coalesce(payload->>'phone','')))<10
     or length(trim(coalesce(payload->>'address','')))<5 or length(trim(coalesce(payload->>'city','')))<2 then
    raise exception 'Please fill in all delivery details'; end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items') not between 1 and 30 then
    raise exception 'Your cart is empty'; end if;
  select data into cfg from site_config where id='main';
  cfg:=coalesce(cfg,'{}');
  sale_pct:=raas_sale_pct();
  chg:=coalesce(nullif(cfg#>>'{delivery,charge}','')::numeric,0);
  free:=nullif(cfg#>>'{delivery,freeAbove}','')::numeric;
  for it in select * from jsonb_array_elements(payload->'items') loop
    q:=greatest(1,least(10,coalesce((it->>'qty')::int,1)));
    select * into col from product_colours where id=(it->>'colour_id')::uuid for update;
    if not found then raise exception 'An item is no longer available'; end if;
    select * into prod from products where id=col.product_id and active;
    if not found or prod.price is null then raise exception 'An item is no longer available'; end if;
    if col.stock<q then raise exception '% (%) is out of stock', prod.name, col.name; end if;
    unit:=raas_unit_price(prod,sale_pct);
    update product_colours set stock=stock-q where id=col.id;
    sub:=sub+unit*q;
    lines:=lines||jsonb_build_object('product_id',prod.id,'colour_id',col.id,'name',prod.name,'colour',col.name,'qty',q,'unit',unit,'image',coalesce(prod.image,col.images[1]));
  end loop;
  if coalesce(trim(payload->>'coupon'),'')<>'' then
    select * into cp from coupons where upper(code)=upper(trim(payload->>'coupon')) for update;
    if not found then raise exception 'This discount code is not valid. Please check it and try again.'; end if;
    ev:=raas_coupon_eval(cp,lines,sub);
    if ev ? 'error' then raise exception '%', ev->>'error'; end if;
    disc:=(ev->>'discount')::numeric;
    ccode:=cp.code;
    update coupons set used=used+1 where id=cp.id;
  end if;
  ship:=case when free is not null and sub>=free then 0 else chg end;
  tot:=sub-disc+ship;
  insert into orders(customer_name,phone,email,address,city,items,subtotal,discount,delivery,total,coupon_code)
    values(trim(payload->>'name'),trim(payload->>'phone'),nullif(trim(coalesce(payload->>'email','')),''),trim(payload->>'address'),trim(payload->>'city'),
           lines,sub,disc,ship,tot,ccode)
    returning id,number into oid,num;
  insert into order_history(order_id,status,note) values(oid,'pending',
    case when ccode is null then 'Order placed by customer' else format('Order placed by customer (coupon %s, −PKR %s)',ccode,disc) end);
  return jsonb_build_object('number',num,'total',tot,'subtotal',sub,'discount',disc,'delivery',ship,'coupon',ccode);
end $$;

-------------------------------------------------------------------------------
-- 6. Cancelling an order also gives its coupon use back (stock was already returned before).
-------------------------------------------------------------------------------
create or replace function set_order_status(oid uuid, new_status text, note text default null) returns void language plpgsql security definer set search_path=public as $$
declare old text; l jsonb; cc text;
begin
  if not is_admin() then raise exception 'Not allowed'; end if;
  select status,coupon_code into old,cc from orders where id=oid for update;
  if old is null then raise exception 'Order not found'; end if;
  if old='cancelled' and new_status<>'cancelled' then raise exception 'A cancelled order cannot be reopened'; end if;
  if new_status='cancelled' and old<>'cancelled' then
    for l in select * from jsonb_array_elements((select items from orders where id=oid)) loop
      update product_colours set stock=stock+(l->>'qty')::int where id=(l->>'colour_id')::uuid;
    end loop;
    if cc is not null then update coupons set used=greatest(0,used-1) where upper(code)=upper(cc); end if;
  end if;
  update orders set status=new_status where id=oid;
  insert into order_history(order_id,status,note) values(oid,new_status,note);
end $$;

-- customers may only call the two public functions; the helpers are internal
revoke execute on function raas_sale_pct() from public;
revoke execute on function raas_unit_price(products,numeric) from public;
revoke execute on function raas_coupon_eval(coupons,jsonb,numeric) from public;
do $$ begin
  execute 'revoke execute on function raas_sale_pct(), raas_unit_price(products,numeric), raas_coupon_eval(coupons,jsonb,numeric) from anon, authenticated';
exception when undefined_object then null; end $$;
grant execute on function place_order(jsonb), check_coupon(text), apply_coupon(text,jsonb) to anon, authenticated;
grant execute on function set_order_status(uuid,text,text) to authenticated;


-- Image / video storage (public read, admin-only write)
insert into storage.buckets(id,name,public) values('media','media',true) on conflict (id) do nothing;
drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects for all to authenticated
  using (bucket_id='media' and is_admin()) with check (bucket_id='media' and is_admin());

insert into site_config(id,data) values('main','{}') on conflict (id) do nothing;
insert into categories(slug,name,sort,active) values ('clothing','Clothing',1,true),('wallets','Wallets',2,false)
  on conflict (slug) do nothing;

-- After creating your admin user in Supabase > Authentication > Users, run (with your email):
-- insert into admins(user_id,role) select id,'owner' from auth.users where email='you@example.com';
