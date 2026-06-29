-- 자재(Jajae) 0020 — 영림 카탈로그 샘플 단가(예상) + 컬러 hex. ADDITIVE.
-- ⚠ 단가는 추정 샘플(카탈로그 미포함) — 실공급가 확보 시 수정. price_status 개념 없이 unit_price만 채움.
-- hex는 3D 렌더 바닥/벽 틴트용 대표색(추정).

alter table material_catalog_items add column if not exists color text;

-- 카테고리별 샘플 단가
update material_catalog_items
set unit_price = case category
  when 'flooring' then 75000
  when 'door' then 260000
  when 'kitchen' then 3400000
  when 'furniture' then 920000
  when 'film' then 14000
  when 'wallpanel' then 60000
  when 'window' then 350000
  else unit_price end
where brand_id in (select id from material_brands where name = '영림');

-- 시리즈(컬러)별 대표 hex
update material_catalog_items m
set color = v.hex
from (values
  ('결 자갈', '#D9D6CF'),
  ('결 모래', '#DAD2C2'),
  ('결 현무', '#6E6E6A'),
  ('결 트라버틴 리조', '#D8CFC0'),
  ('결 트라버틴 포그', '#CFCAC0'),
  ('결 트라버틴 스모크', '#B9B4AC'),
  ('결 사하라 린넨', '#D9CFBE'),
  ('결 도랑 린넨', '#C9BFAE'),
  ('루나 화이트스톤', '#ECEAE4'),
  ('루나 라이트스톤', '#D8D6D0'),
  ('루나 그레이스톤', '#B5B3AE'),
  ('듄 서밋그레이', '#A9A8A3'),
  ('듄 선셋스톤', '#C9BCAA'),
  ('듄 데이브레이크', '#DAD3C7'),
  ('발렌 디머', '#BFB9B0'),
  ('드라이필드', '#ADA79D'),
  ('세도나', '#B98C6A'),
  ('샌디힐', '#CDB89A'),
  ('소프 포슬린', '#EFECE3'),
  ('소프 캐시미어', '#E3DCCF'),
  ('소프 포그그레이지', '#CFC9BE'),
  ('소프 버터크림', '#EEE4CC'),
  ('소프 라이트그레이', '#D6D4CE'),
  ('소프 로즈그레이', '#D8C9C4'),
  ('헤더 토피', '#8A6A4F'),
  ('마티에르 보니타', '#C8A06A'),
  ('나투라 피노아', '#D6B98C'),
  ('나투라 모스', '#8F8A6A'),
  ('베네토 리체', '#C9A47A'),
  ('베네토 로우', '#A8835C'),
  ('알토 윌로우', '#C2A988'),
  ('알토 체스트넛', '#9A6B45'),
  ('알토 팔콘', '#B89B73'),
  ('헤이즈오크', '#BBA585')
) as v(series, hex)
where m.series = v.series
  and m.brand_id in (select id from material_brands where name = '영림');
