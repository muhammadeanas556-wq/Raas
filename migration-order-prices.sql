-- RAAS: Original / discounted / coupon prices saved with every order line (+ sent to Google Sheets).
-- Run ONCE in Supabase > SQL Editor > New query > paste > Run. Safe to run again.
-- Run it AFTER migration-sizes.sql. Nothing is deleted: products, colours, stock, orders, coupons and settings are kept.
--
-- Every new order line (orders.items) now also stores, all worked out on the server:
--   original         original price of ONE unit (products.price)
--   unit             discounted price of ONE unit (sale price / product discount / store sale; = original when there is no discount)
--   line_total       unit x qty (before the coupon)
--   coupon_discount  the part of the coupon discount that belongs to this line (0 when no coupon / the coupon does not cover this product)
--   final            line_total - coupon_discount
-- Quantity must be a whole number from 1 to 10 (zero / negative quantities are refused instead of being changed silently).
-- place_order also returns these lines so the website can send exact prices to Google Sheets.
-- Old orders keep what they had; the admin shows "—" for the prices they do not have.

-- is one coupon valid for one product? (same rule raas_coupon_eval uses)
create or replace function raas_coupon_line_ok(cp coupons, pid uuid) returns boolean language sql stable security definer set search_path=public as $$
  select coalesce(case coalesce(cp.scope,'all')
    when 'all' then true
    when 'products' then pid = any(cp.product_ids)
    when 'categories' then (select p.category_id from products p where p.id=pid) = any(cp.category_ids)
    else false end,false) $$;

create or replace function place_order(payload jsonb) returns jsonb language plpgsql security definer set search_path=public as $$
declare it jsonb; col record; prod products; unit numeric; sub numeric:=0; orig_sub numeric:=0; lines jsonb:='[]'; out_lines jsonb:='[]'; q int; cfg jsonb;
  sale_pct numeric:=0; chg numeric:=0; free numeric; ship numeric; cp coupons; ev jsonb; disc numeric:=0; ccode text;
  oid uuid; num bigint; tot numeric; sz text; qtxt text; l jsonb; elig numeric; left_d numeric; share numeric; last_ok int:=0; i int:=0; lt numeric;
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
    -- quantity: whole number 1..10, never zero or negative
    qtxt:=trim(coalesce(it->>'qty','1'));
    if qtxt !~ '^[0-9]{1,3}$' or qtxt::int<1 then raise exception 'Quantity must be at least 1'; end if;
    q:=qtxt::int;
    if q>10 then raise exception 'You can order at most 10 of one item'; end if;
    if coalesce(it->>'colour_id','') !~* '^[0-9a-f-]{36}$' then raise exception 'An item is no longer available'; end if;
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
    orig_sub:=orig_sub+prod.price*q;
    lines:=lines||jsonb_build_object('product_id',prod.id,'colour_id',col.id,'name',prod.name,'colour',col.name,'size',sz,'qty',q,
      'original',prod.price,'unit',unit,'line_total',unit*q,'image',coalesce(prod.image,col.images[1]));
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
  -- split the coupon discount over the lines it covers (in proportion to their value; the last covered line takes the rounding rest)
  if disc>0 then
    i:=0;
    for l in select * from jsonb_array_elements(lines) loop
      i:=i+1; if raas_coupon_line_ok(cp,(l->>'product_id')::uuid) then last_ok:=i; end if;
    end loop;
    elig:=(ev->>'eligible')::numeric;
  end if;
  left_d:=disc; i:=0;
  for l in select * from jsonb_array_elements(lines) loop
    i:=i+1; lt:=(l->>'line_total')::numeric; share:=0;
    if disc>0 and raas_coupon_line_ok(cp,(l->>'product_id')::uuid) then
      share:=case when i=last_ok then left_d else least(left_d,round(disc*lt/elig)) end;
      left_d:=left_d-share;
    end if;
    out_lines:=out_lines||(l||jsonb_build_object('coupon_discount',share,'final',lt-share));
  end loop;
  ship:=case when free is not null and sub>=free then 0 else chg end;
  tot:=sub-disc+ship;
  insert into orders(customer_name,phone,email,address,city,items,subtotal,discount,delivery,total,coupon_code)
    values(trim(payload->>'name'),trim(payload->>'phone'),nullif(trim(coalesce(payload->>'email','')),''),trim(payload->>'address'),trim(payload->>'city'),
           out_lines,sub,disc,ship,tot,ccode)
    returning id,number into oid,num;
  insert into order_history(order_id,status,note) values(oid,'pending',
    case when ccode is null then 'Order placed by customer' else format('Order placed by customer (coupon %s, −PKR %s)',ccode,disc) end);
  return jsonb_build_object('number',num,'total',tot,'subtotal',sub,'original_subtotal',orig_sub,'discount',disc,'delivery',ship,'coupon',ccode,
    'created_at',now(),'items',(select coalesce(jsonb_agg(x - 'image' - 'product_id' - 'colour_id'),'[]') from jsonb_array_elements(out_lines) x));
end $$;

revoke execute on function raas_coupon_line_ok(coupons,uuid) from public;
do $$ begin
  execute 'revoke execute on function raas_coupon_line_ok(coupons,uuid) from anon, authenticated';
exception when undefined_object then null; end $$;
grant execute on function place_order(jsonb) to anon, authenticated;
