-- RAAS clothing conversion. Run ONCE in Supabase > SQL Editor. Safe to run again. Keeps products, orders, admins.
alter table products add column if not exists image text;
alter table products add column if not exists sku text;
alter table products add column if not exists sale_price numeric check (sale_price is null or sale_price>=0);

insert into categories(slug,name,sort,active) values ('clothing','Clothing',1,true),('wallets','Wallets',2,false)
  on conflict (slug) do nothing;
-- every existing product becomes Clothing; the old wallet sub-categories are hidden (not deleted)
update products set category_id=(select id from categories where slug='clothing')
  where category_id is null or category_id in (select id from categories where slug not in ('clothing','wallets'));
update categories set active=false where slug in ('bifold','slim','card','long');
-- use the first colour photo as the single main image for products that have none yet
update products p set image=(select c.images[1] from product_colours c where c.product_id=p.id and array_length(c.images,1)>0 order by c.sort limit 1) where p.image is null;

-- drop saved wallet wording / old look so the new clothing defaults apply (logo, contact, delivery, policies, sale are kept)
update site_config set data=coalesce(data,'{}'::jsonb)-'text'-'ticker'-'about'-'footer'-'sections'-'announcement'-'look'
  where id='main';
update site_config set data=jsonb_set(data,'{hero}',(data->'hero')-'title'-'desc'-'btnText'-'btnLink'-'sampleText'-'stats'-'mediaType')
  where id='main' and jsonb_typeof(data->'hero')='object';

-- Prices, discounts, delivery and stock are all computed here on the server, never trusted from the browser.
create or replace function place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare it jsonb; col record; prod record; unit numeric; sub numeric:=0; lines jsonb:='[]'; q int; cfg jsonb;
  sale_pct numeric:=0; chg numeric:=0; free numeric; ship numeric; cp record; disc numeric:=0; oid uuid; num bigint; tot numeric; ends text;
begin
  if length(trim(coalesce(payload->>'name','')))<2 or length(trim(coalesce(payload->>'phone','')))<10
     or length(trim(coalesce(payload->>'address','')))<5 or length(trim(coalesce(payload->>'city','')))<2 then
    raise exception 'Please fill in all delivery details'; end if;
  if jsonb_typeof(payload->'items')<>'array' or jsonb_array_length(payload->'items') not between 1 and 30 then
    raise exception 'Your cart is empty'; end if;
  select data into cfg from site_config where id='main';
  cfg:=coalesce(cfg,'{}');
  ends:=nullif(cfg#>>'{sale,endsAt}','');
  if coalesce(cfg#>>'{sale,enabled}','false')='true' and (ends is null or ends::timestamptz>now()) then
    sale_pct:=coalesce(nullif(cfg#>>'{sale,percent}','')::numeric,0); end if;
  chg:=coalesce(nullif(cfg#>>'{delivery,charge}','')::numeric,0);
  free:=nullif(cfg#>>'{delivery,freeAbove}','')::numeric;
  for it in select * from jsonb_array_elements(payload->'items') loop
    q:=greatest(1,least(10,coalesce((it->>'qty')::int,1)));
    select * into col from product_colours where id=(it->>'colour_id')::uuid for update;
    if not found then raise exception 'An item is no longer available'; end if;
    select * into prod from products where id=col.product_id and active;
    if not found or prod.price is null then raise exception 'An item is no longer available'; end if;
    if col.stock<q then raise exception '% (%) is out of stock', prod.name, col.name; end if;
    unit:=prod.price;
    if prod.sale_price is not null and prod.sale_price<prod.price then unit:=prod.sale_price;
    elsif prod.discount_value is not null and (prod.discount_start is null or prod.discount_start<=now()) and (prod.discount_end is null or prod.discount_end>now()) then
      unit:=case when prod.discount_type='percent' then round(prod.price*(1-prod.discount_value/100)) else greatest(0,prod.price-prod.discount_value) end;
    elsif sale_pct>0 then unit:=round(prod.price*(1-sale_pct/100)); end if;
    update product_colours set stock=stock-q where id=col.id;
    sub:=sub+unit*q;
    lines:=lines||jsonb_build_object('product_id',prod.id,'colour_id',col.id,'name',prod.name,'colour',col.name,'qty',q,'unit',unit,'image',coalesce(prod.image,col.images[1]));
  end loop;
  if coalesce(payload->>'coupon','')<>'' then
    select * into cp from coupons where upper(code)=upper(payload->>'coupon') and active and (starts_at is null or starts_at<=now())
      and (ends_at is null or ends_at>now()) and (max_uses is null or used<max_uses) for update;
    if not found then raise exception 'This discount code is not valid'; end if;
    disc:=least(sub,case when cp.type='percent' then round(sub*cp.value/100) else cp.value end);
    update coupons set used=used+1 where id=cp.id;
  end if;
  ship:=case when free is not null and sub>=free then 0 else chg end;
  tot:=sub-disc+ship;
  insert into orders(customer_name,phone,email,address,city,items,subtotal,discount,delivery,total,coupon_code)
    values(trim(payload->>'name'),trim(payload->>'phone'),nullif(trim(coalesce(payload->>'email','')),''),trim(payload->>'address'),trim(payload->>'city'),
           lines,sub,disc,ship,tot,nullif(payload->>'coupon',''))
    returning id,number into oid,num;
  insert into order_history(order_id,status,note) values(oid,'pending','Order placed by customer');
  return jsonb_build_object('number',num,'total',tot);
end $$;

