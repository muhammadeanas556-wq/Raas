-- RAAS: HEX colour codes + Coupons & Discounts system.
-- Run ONCE in Supabase > SQL Editor > New query > paste > Run. Safe to run again.
-- Keeps every product, colour, order, coupon and setting. Run it AFTER migration-clothing.sql.

-------------------------------------------------------------------------------
-- 1. Colours: every colour must have a valid HEX code (#RGB or #RRGGBB)
-------------------------------------------------------------------------------
update product_colours set hex='#141414' where hex is null or hex !~* '^#([0-9a-f]{3}|[0-9a-f]{6})$';
alter table product_colours alter column hex set default '#141414';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='product_colours_hex_chk') then
    alter table product_colours add constraint product_colours_hex_chk check (hex ~* '^#([0-9a-f]{3}|[0-9a-f]{6})$');
  end if;
end $$;

-------------------------------------------------------------------------------
-- 2. Coupons: scope (whole website / products / categories) and minimum order
-------------------------------------------------------------------------------
alter table coupons add column if not exists scope text not null default 'all';
alter table coupons add column if not exists product_ids uuid[] not null default '{}';
alter table coupons add column if not exists category_ids uuid[] not null default '{}';
alter table coupons add column if not exists min_order numeric;
alter table coupons add column if not exists created_at timestamptz default now();
do $$ begin
  if not exists (select 1 from pg_constraint where conname='coupons_scope_chk') then
    alter table coupons add constraint coupons_scope_chk check (scope in ('all','products','categories')); end if;
  if not exists (select 1 from pg_constraint where conname='coupons_min_order_chk') then
    alter table coupons add constraint coupons_min_order_chk check (min_order is null or min_order>=0); end if;
  if not exists (select 1 from pg_constraint where conname='coupons_percent_chk') then
    alter table coupons add constraint coupons_percent_chk check (type<>'percent' or value<=100) not valid; end if;
  if not exists (select 1 from pg_constraint where conname='coupons_dates_chk') then
    alter table coupons add constraint coupons_dates_chk check (starts_at is null or ends_at is null or ends_at>starts_at) not valid; end if;
end $$;
-- codes are matched without caring about upper/lower case, so they must be unique that way too
do $$ begin
  create unique index if not exists coupons_code_upper_idx on coupons(upper(code));
exception when unique_violation then
  raise notice 'Two coupons have the same code in different letter case. Rename one, then run this file again.';
end $$;

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
