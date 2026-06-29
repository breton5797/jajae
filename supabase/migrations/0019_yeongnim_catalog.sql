-- 자재(Jajae) 0019 — 영림(Yeongnim) e카탈로그 마이그레이션. ADDITIVE.
-- 출처: 영림 인테리어 매치업 2026, 영림프라임 창호 종합카탈로그 2526 (yl.co.kr e카탈로그).
-- 카탈로그는 사양/라인업 reference (가격 미포함 — 단가는 후속 입력). 예산 엔진(finish_materials)과 분리.
-- 총 131행: 인테리어 컬러 라인업 + 창호 시리즈.

-- 영림 브랜드 + 카테고리 (0017 material_brands 가산)
insert into material_brands (name, is_import, segment)
values ('영림', false, 'major')
on conflict (name) do nothing;

insert into material_brand_categories (brand_id, category)
select b.id, c
from material_brands b
cross join (values ('door'),('kitchen'),('furniture'),('flooring'),('window'),('molding'),('film'),('board')) as t(c)
where b.name = '영림'
on conflict do nothing;

-- 브랜드 카탈로그 품목 테이블 (reference)
create table material_catalog_items (
  id            uuid primary key default gen_random_uuid(),
  brand_id      uuid not null references material_brands(id) on delete cascade,
  category      text not null check (category in (
    'door','kitchen','furniture','flooring','window','molding','film','board','wallpanel')),
  series        text not null,            -- 컬러/시리즈명 ("루나 라이트스톤","발코니 베이직")
  model_code    text not null,            -- 모델 코드 ("YMQ(W)-304","BF-Y230BE")
  pattern_group text,                     -- "스톤마블"/"솔리드"/"우드"/"레더"/"결"/"PVC 이중창" 등
  spec          text,                     -- 자유 사양
  unit_price    numeric,                  -- 단가(카탈로그 미포함 → null, 후속 입력)
  source        text not null,            -- 출처 카탈로그
  created_at    timestamptz not null default now()
);
create index idx_material_catalog_items_brand on material_catalog_items(brand_id);
create index idx_material_catalog_items_category on material_catalog_items(category);

alter table material_catalog_items enable row level security;
create policy material_catalog_items_read on material_catalog_items for select using (true);
create policy material_catalog_items_admin on material_catalog_items for all
  using (public.is_admin()) with check (public.is_admin());
revoke all on material_catalog_items from anon;
revoke insert, update, delete on material_catalog_items from authenticated;
grant select on material_catalog_items to authenticated;
grant all on material_catalog_items to service_role;

-- 시드: 영림 라인업
insert into material_catalog_items (brand_id, category, series, model_code, pattern_group, spec, source)
select b.id, v.category, v.series, v.model_code, v.pattern_group, v.spec, v.source
from material_brands b
cross join (values
  ('kitchen', '결 자갈', 'GY-01', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 자갈', 'GY-01', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 자갈', 'APH-310G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 자갈', 'APW/R-310G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 모래', 'GY-02', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 모래', 'GY-02', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 모래', 'APH-311G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 모래', 'APW/R-311G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 현무', 'GY-03', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 현무', 'GY-03', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 현무', 'APH-313G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 현무', 'APW/R-313G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 트라버틴 리조', 'GY-04', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 트라버틴 리조', 'GY-04', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 트라버틴 리조', 'APH-320G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 트라버틴 리조', 'APW/R-320G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 트라버틴 포그', 'GY-05', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 트라버틴 포그', 'GY-05', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 트라버틴 포그', 'APH-321G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 트라버틴 포그', 'APW/R-321G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 트라버틴 스모크', 'GY-06', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 트라버틴 스모크', 'GY-06', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 트라버틴 스모크', 'APH-322G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 트라버틴 스모크', 'APW/R-322G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 사하라 린넨', 'GY-07', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 사하라 린넨', 'GY-07', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 사하라 린넨', 'APW/R-330G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '결 도랑 린넨', 'GY-08', '결', null, '영림 인테리어 매치업 2026'),
  ('furniture', '결 도랑 린넨', 'GY-08', '결', null, '영림 인테리어 매치업 2026'),
  ('door', '결 도랑 린넨', 'APH-300G', '결', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '결 도랑 린넨', 'APW/R-300G', '결', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '루나 화이트스톤', 'LU-05', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('furniture', '루나 화이트스톤', 'LU-05', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '루나 화이트스톤', 'PX451', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '루나 라이트스톤', 'LU-02', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('furniture', '루나 라이트스톤', 'LU-02', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '루나 라이트스톤', 'PX451-1', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '루나 라이트스톤', 'WSB-250', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('flooring', '루나 라이트스톤', 'YMQ(W)-304', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '루나 그레이스톤', 'LU-03', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('furniture', '루나 그레이스톤', 'LU-03', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '루나 그레이스톤', 'PX451-2', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '듄 서밋그레이', 'DU-01', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('furniture', '듄 서밋그레이', 'DU-01', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('door', '듄 서밋그레이', 'AP-201', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '듄 서밋그레이', 'WSB-210', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '듄 선셋스톤', 'DU-02', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('furniture', '듄 선셋스톤', 'DU-02', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '듄 선셋스톤', 'PX454', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '듄 선셋스톤', 'WSB-190', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('flooring', '듄 선셋스톤', 'YMQ(R/W)-300', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '듄 데이브레이크', 'DU-03', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('furniture', '듄 데이브레이크', 'DU-03', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '듄 데이브레이크', 'PX454-1', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '듄 데이브레이크', 'WSB-200', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('flooring', '듄 데이브레이크', 'YMQ(W)-301', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '발렌 디머', 'PX449-3', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('flooring', '발렌 디머', 'YMQ-306', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('film', '드라이필드', 'PX457', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '드라이필드', 'IW(L)-280', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('door', '세도나', 'AP-200', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '세도나', 'WSB-240', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('flooring', '세도나', 'YMQ(W)-303', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '샌디힐', 'WSB-260', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('flooring', '샌디힐', 'YMQ(R/W)-305', '스톤마블', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '소프 포슬린', 'SF-01', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '소프 포슬린', 'SF-01', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('door', '소프 포슬린', 'AP-18S', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('film', '소프 포슬린', 'PSM190', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '소프 캐시미어', 'SF-06', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '소프 캐시미어', 'SF-06', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('door', '소프 캐시미어', 'AP-19S', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('film', '소프 캐시미어', 'PSM195', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '소프 포그그레이지', 'SF-08', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '소프 포그그레이지', 'SF-08', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('door', '소프 포그그레이지', 'AP-24S', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('film', '소프 포그그레이지', 'PSM198', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '소프 버터크림', 'SF-09', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '소프 버터크림', 'SF-09', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('film', '소프 버터크림', 'PSM211', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '소프 라이트그레이', 'SF-02', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '소프 라이트그레이', 'SF-02', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('door', '소프 라이트그레이', 'AP-20S', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('film', '소프 라이트그레이', 'PSM196', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '소프 로즈그레이', 'SF-03', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '소프 로즈그레이', 'SF-03', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('door', '소프 로즈그레이', 'AP-21S', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('film', '소프 로즈그레이', 'PSM197', '솔리드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '헤더 토피', 'HT-01', '레더', null, '영림 인테리어 매치업 2026'),
  ('door', '헤더 토피', 'AP-205', '레더', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '마티에르 보니타', 'MT-01', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '마티에르 보니타', 'MT-01', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '마티에르 보니타', 'PWE1500', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '나투라 피노아', 'NA-PN', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '나투라 피노아', 'NA-PN', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '나투라 피노아', 'PWE1502', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '나투라 모스', 'NA-MS', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '나투라 모스', 'NA-MS', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '나투라 모스', 'PW973', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '베네토 리체', 'VN-01', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '베네토 리체', 'VN-01', '우드', null, '영림 인테리어 매치업 2026'),
  ('door', '베네토 리체', 'AP-07V', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '베네토 리체', 'AFV2007', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '베네토 로우', 'VN-02', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '베네토 로우', 'VN-02', '우드', null, '영림 인테리어 매치업 2026'),
  ('door', '베네토 로우', 'AP-05V', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '베네토 로우', 'AFV2005', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '알토 윌로우', 'AO-WL', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '알토 윌로우', 'AO-WL', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '알토 윌로우', 'PW970', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '알토 체스트넛', 'AO-CT', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '알토 체스트넛', 'AO-CT', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '알토 체스트넛', 'PW968', '우드', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '알토 체스트넛', 'WSB-230', '우드', null, '영림 인테리어 매치업 2026'),
  ('kitchen', '알토 팔콘', 'AO-FC', '우드', null, '영림 인테리어 매치업 2026'),
  ('furniture', '알토 팔콘', 'AO-FC', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '알토 팔콘', 'PWE1501', '우드', null, '영림 인테리어 매치업 2026'),
  ('film', '헤이즈오크', 'PW969', '우드', null, '영림 인테리어 매치업 2026'),
  ('wallpanel', '헤이즈오크', 'WSB-220', '우드', null, '영림 인테리어 매치업 2026'),
  ('window', '발코니 맥스', 'BF-Y255BE', 'PVC 이중창', 'Y250B, Y140B', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '발코니 베이직', 'BF-Y230BE', 'PVC 이중창', 'Y230B, Y120B / 24T 로이유리+아르곤, 단열 1등급', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '일반창', 'BF-Y260', 'PVC', 'Y250, Y230, Y119, Y119WA', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '발코니 해안창', 'BF-Y248BE', 'PVC', 'Y131BE / 해안가 특화 프로파일', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '해안창', 'BF-Y243E', 'PVC', 'Y127', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '입면분할창', 'BF-Y248BNE', 'PVC', 'Y131BNE', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '학교창', 'SS-Y243E', 'PVC 단창', 'Y237, Y230, Y127, Y120B, Y119 / 미서기 분할창', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '프로젝트창', 'FM-Y115PJ', 'PVC 시스템', 'Y60', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '시스템 T/T창 & PS창', 'FM-Y70', 'PVC 시스템', '틸트&턴/슬라이딩', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '시스템 터닝도어 & 패널도어', 'FM-Y140', 'PVC 시스템', 'Y70, Y140P, Y70P', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '시스템 케이스먼트창', 'FM-Y70', 'PVC 시스템', '프로젝트/케이스먼트', '영림프라임 창호 종합카탈로그 2526'),
  ('window', '알루미늄 시스템 도어', 'F3133', 'ALUMINUM', 'Classic White / 단열·방범 강화 여닫이', '영림프라임 창호 종합카탈로그 2526')
) as v(category, series, model_code, pattern_group, spec, source)
where b.name = '영림';
