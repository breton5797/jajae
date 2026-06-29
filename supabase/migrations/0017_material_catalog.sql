-- 자재(Jajae) 즉석 제안 §자재 브랜드 DB + 마감재 카탈로그. ADDITIVE.
-- 카탈로그는 read-only 참조 데이터: 인증 사용자 SELECT, 쓰기는 admin/service.
-- RLS 패턴은 0016 동일 (enable RLS, public.is_admin() 재사용 — 0002 정의, 재정의 금지).

-- ───── material_brands ─────
create table material_brands (
  id        uuid primary key default gen_random_uuid(),
  name      text not null unique,
  is_import boolean not null default false,
  segment   text not null check (segment in ('major','specialist','distributor')),
  note      text,
  sort      int not null default 0,
  created_at timestamptz not null default now()
);

create table material_brand_categories (
  brand_id uuid not null references material_brands(id) on delete cascade,
  category text not null check (category in (
    'flooring','wallpaper','paint','tile','window','door','kitchen',
    'sanitaryware','lighting','film','board','engineered_stone','furniture','molding')),
  primary key (brand_id, category)
);

create table finish_materials (
  id           uuid primary key default gen_random_uuid(),
  category     text not null check (category in (
    'flooring','wallpaper','paint','tile','window','door','kitchen',
    'sanitaryware','lighting','film','board','engineered_stone','furniture','molding')),
  tier         text not null check (tier in ('economy','standard','premium')),
  brand_id     uuid not null references material_brands(id) on delete restrict,
  label        text not null,
  unit_price   numeric not null default 0,
  price_status text not null default 'estimated' check (price_status in ('confirmed','estimated')),
  color        text,
  swatch_url   text,
  spec         text,
  sort         int not null default 0,
  created_at   timestamptz not null default now()
);
create index idx_finish_materials_cat_tier on finish_materials(category, tier);

-- ───── RLS ─────
alter table material_brands enable row level security;
alter table material_brand_categories enable row level security;
alter table finish_materials enable row level security;

create policy material_brands_read on material_brands for select using (true);
create policy material_brand_categories_read on material_brand_categories for select using (true);
create policy finish_materials_read on finish_materials for select using (true);
-- 쓰기 정책은 admin 전용
create policy material_brands_admin on material_brands for all
  using (public.is_admin()) with check (public.is_admin());
create policy finish_materials_admin on finish_materials for all
  using (public.is_admin()) with check (public.is_admin());

revoke all on material_brands from anon;
revoke all on material_brand_categories from anon;
revoke all on finish_materials from anon;
revoke insert, update, delete on material_brands from authenticated;
revoke insert, update, delete on material_brand_categories from authenticated;
revoke insert, update, delete on finish_materials from authenticated;
grant select on material_brands to authenticated;
grant select on material_brand_categories to authenticated;
grant select on finish_materials to authenticated;
grant all on material_brands to service_role;
grant all on material_brand_categories to service_role;
grant all on finish_materials to service_role;

-- ───── 브랜드 시드 (대표님 제공 리스트) ─────
insert into material_brands (name, is_import, segment) values
  ('LX하우시스', false, 'major'),
  ('KCC',        false, 'major'),
  ('현대L&C',    false, 'major'),
  ('한솔홈데코', false, 'major'),
  ('동화기업',   false, 'major'),
  ('구정마루',   false, 'specialist'),
  ('이건마루',   false, 'specialist'),
  ('동화자연마루', false, 'specialist'),
  ('풍산마루',   false, 'specialist'),
  ('한솔포레보드', false, 'specialist'),
  ('개나리벽지', false, 'specialist'),
  ('신한벽지',   false, 'specialist'),
  ('서울벽지',   false, 'specialist'),
  ('DID벽지',    false, 'specialist'),
  ('LG지인벽지', false, 'specialist'),
  ('삼화페인트', false, 'specialist'),
  ('노루페인트', false, 'specialist'),
  ('강남제비스코', false, 'specialist'),
  ('KCC페인트',  false, 'specialist'),
  ('벤자민무어코리아', true, 'specialist'),
  ('삼영세라믹', false, 'specialist'),
  ('동서타일',   false, 'specialist'),
  ('대보세라믹', false, 'specialist'),
  ('윈세라믹',   false, 'specialist'),
  ('타일러스',   true,  'distributor'),
  ('윤현상재',   true,  'distributor'),
  ('한샘',       false, 'major'),
  ('에넥스',     false, 'specialist'),
  ('현대리바트', false, 'specialist'),
  ('대림바스',   false, 'specialist'),
  ('계림요업',   false, 'specialist'),
  ('아메리칸스탠다드', true, 'specialist'),
  ('로얄토토',   true,  'specialist'),
  ('필룩스',     false, 'specialist'),
  ('비츠조명',   false, 'specialist'),
  ('라이마스',   false, 'specialist'),
  ('두코',       false, 'specialist'),
  ('이케아',     true,  'distributor');

insert into material_brand_categories (brand_id, category)
  select b.id, c.category
  from (values
    ('LX하우시스', array['flooring','wallpaper','window','film','board','engineered_stone']),
    ('KCC', array['paint','window','board','engineered_stone']),
    ('현대L&C', array['flooring','wallpaper','window','film','engineered_stone']),
    ('한솔홈데코', array['flooring','board','door']),
    ('동화기업', array['flooring','board','door']),
    ('구정마루', array['flooring']), ('이건마루', array['flooring']),
    ('동화자연마루', array['flooring']), ('풍산마루', array['flooring']),
    ('한솔포레보드', array['flooring','board']),
    ('개나리벽지', array['wallpaper']), ('신한벽지', array['wallpaper']),
    ('서울벽지', array['wallpaper']), ('DID벽지', array['wallpaper']),
    ('LG지인벽지', array['wallpaper']),
    ('삼화페인트', array['paint']), ('노루페인트', array['paint']),
    ('강남제비스코', array['paint']), ('KCC페인트', array['paint']),
    ('벤자민무어코리아', array['paint']),
    ('삼영세라믹', array['tile']), ('동서타일', array['tile']),
    ('대보세라믹', array['tile']), ('윈세라믹', array['tile']),
    ('타일러스', array['tile']), ('윤현상재', array['tile']),
    ('한샘', array['kitchen','furniture','sanitaryware']),
    ('에넥스', array['kitchen','furniture']), ('현대리바트', array['kitchen','furniture']),
    ('대림바스', array['sanitaryware']), ('계림요업', array['sanitaryware']),
    ('아메리칸스탠다드', array['sanitaryware']), ('로얄토토', array['sanitaryware']),
    ('필룩스', array['lighting']), ('비츠조명', array['lighting']),
    ('라이마스', array['lighting']), ('두코', array['lighting']),
    ('이케아', array['lighting','furniture'])
  ) as s(brand, cats)
  join material_brands b on b.name = s.brand
  cross join lateral unnest(s.cats) as c(category)
  on conflict do nothing;

-- ───── finish_materials 대표 시드 (패널 카테고리 × 3티어, 단가 estimated) ─────
-- 각 (category,tier) 1행, 브랜드는 해당 카테고리 대표. color는 3D 틴트용.
-- door/standard 는 한솔홈데코로 매핑 (브랜드 시드에 있는 door 카테고리 보유 브랜드).
insert into finish_materials (category, tier, brand_id, label, unit_price, price_status, color, spec)
select v.category, v.tier, b.id, v.label, v.price, 'estimated', v.color, v.spec
from (values
  -- flooring (㎡)
  ('flooring','economy','동화자연마루','강화마루 내추럴',38000,'#C8A876','강화마루 8mm'),
  ('flooring','standard','구정마루','강마루 오크',62000,'#B98C5A','강마루 7.5mm'),
  ('flooring','premium','이건마루','원목마루 오크',135000,'#A9784A','원목마루 9mm'),
  -- wallpaper (㎡)
  ('wallpaper','economy','개나리벽지','실크 단색 화이트',9000,'#F3F1EC','합지'),
  ('wallpaper','standard','신한벽지','실크 패턴',16000,'#EDEAE3','실크'),
  ('wallpaper','premium','LG지인벽지','프리미엄 친환경',28000,'#E8E4DB','친환경 실크'),
  -- paint (㎡)
  ('paint','economy','삼화페인트','수성페인트 화이트',7000,'#F5F4F0','수성'),
  ('paint','standard','노루페인트','친환경 수성 웜그레이',12000,'#E6E3DC','친환경 수성'),
  ('paint','premium','벤자민무어코리아','프리미엄 수성',26000,'#E1DDD4','수입 친환경'),
  -- tile (㎡)
  ('tile','economy','동서타일','자기질 화이트 300x600',22000,'#E9E9E6','300x600'),
  ('tile','standard','삼영세라믹','포세린 그레이 300x600',38000,'#CFCFCB','포세린'),
  ('tile','premium','윤현상재','수입 포세린 대형',92000,'#C4C4BF','600x1200 수입'),
  -- window (ea)
  ('window','economy','KCC','PVC 이중창',180000,'#D7DDE2','PVC 이중'),
  ('window','standard','LX하우시스','시스템 이중창',320000,'#D2D8DE','시스템'),
  ('window','premium','LX하우시스','프리미엄 3중 시스템창',560000,'#CDD4DB','3중 시스템'),
  -- door (ea)
  ('door','economy','한솔홈데코','ABS 도어',120000,'#C9A982','ABS'),
  ('door','standard','한솔홈데코','멤브레인 도어',190000,'#BE9A6E','멤브레인'),
  ('door','premium','동화기업','원목무늬 도어',300000,'#AE8758','원목무늬'),
  -- kitchen (set)
  ('kitchen','economy','에넥스','일자형 싱크대',1500000,'#E4E0D8','L2400'),
  ('kitchen','standard','한샘','ㄱ자형 싱크대',3200000,'#DED9CF','ㄱ자'),
  ('kitchen','premium','현대리바트','아일랜드 주방',6500000,'#D6D0C4','아일랜드'),
  -- sanitaryware (set)
  ('sanitaryware','economy','계림요업','기본 위생도기 세트',450000,'#EDEDEA','양변기+세면'),
  ('sanitaryware','standard','대림바스','일체형 세트',850000,'#E7E7E3','일체형'),
  ('sanitaryware','premium','로얄토토','수입 위생도기',1800000,'#E0E0DB','수입'),
  -- lighting (ea)
  ('lighting','economy','비츠조명','LED 매입등',18000,'#FBF3DA','LED 매입'),
  ('lighting','standard','필룩스','LED 매입+간접',42000,'#FBF0CE','매입+간접'),
  ('lighting','premium','라이마스','디자인 간접조명',95000,'#FBEDC2','디자인'),
  -- furniture (붙박이장, ea)
  ('furniture','economy','에넥스','붙박이장 슬라이딩',650000,'#C2A77F','슬라이딩'),
  ('furniture','standard','한샘','붙박이장 도어형',1100000,'#B89B6F','도어형'),
  ('furniture','premium','현대리바트','시스템 드레스룸',2400000,'#AD8F61','드레스룸'),
  -- molding (m)
  ('molding','economy','LX하우시스','PVC 몰딩 화이트',4500,'#F4F3EF','PVC'),
  ('molding','standard','한솔홈데코','무늬목 몰딩',8000,'#EFEDE7','무늬목'),
  ('molding','premium','동화기업','원목 몰딩',15000,'#E9E6DE','원목')
) as v(category, tier, brand, label, price, color, spec)
join material_brands b on b.name = v.brand;
