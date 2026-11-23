-- RAAS: Product Size Management (XS, S, M, L, XL, XXL, XXXL).
-- Run ONCE in Supabase > SQL Editor > New query > paste > Run. Safe to run again.
-- Keeps every product, colour, order, coupon and setting. Run it AFTER migration-clothing.sql and migration-coupons-hex.sql.
--
-- products.sizes  = the sizes the admin enabled for THAT product (empty = the product has no sizes, e.g. accessories; it is ordered as before)
-- orders.items    = every order line now also stores its "size" (old orders simply have no size)

alter table products add column if not exists sizes text[] not null default '{}';
do $$ begin
  if not exists (select 1 from pg_constraint where conname='products_sizes_chk') then
    alter table products add constraint products_sizes_chk
      check (sizes <@ array['XS','S','M','L','XL','XXL','XXXL']::text[]);
  end if;
end $$;

-- place_order: same as before, plus the size check. The server never trusts the browser:
--   a product that has sizes cannot be ordered without one of ITS enabled sizes.
create or replace function place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare it jsonb; col record; prod products; unit numeric; sub numeric:=0; lines jsonb:='[]'; q int; cfg jsonb;
  sale_pct numeric:=0; chg numeric:=0; free numeric; ship numeric; cp coupons; ev jsonb; disc numeric:=0; ccode text;
  oid uuid; num bigint; tot numeric; sz text;
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
    -- size: required (and must be one the admin enabled) whenever the product has sizes; ignored otherwise
    sz:=nullif(upper(trim(coalesce(it->>'size',''))),'');
    if coalesce(array_length(prod.sizes,1),0)>0 then
      if sz is null then raise exception 'Please select your size for %', prod.name; end if;
      if not (sz = any(prod.sizes)) then raise exception 'Size % is not available for %', sz, prod.name; end if;
    else sz:=null; end if;
    unit:=raas_unit_price(prod,sale_pct);
    update product_colours set stock=stock-q where id=col.id;
    sub:=sub+unit*q;
    lines:=lines||jsonb_build_object('product_id',prod.id,'colour_id',col.id,'name',prod.name,'colour',col.name,'size',sz,'qty',q,'unit',unit,'image',coalesce(prod.image,col.images[1]));
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

grant execute on function place_order(jsonb) to anon, authenticated;
