-- ── Creative Studio ─────────────────────────────────────────────────────────────
-- Manual creative builder + template tool. Run once in the Supabase SQL editor.
-- Additive migration — safe to re-run (create if not exists / on conflict do nothing).

create table if not exists creative_drafts (
  id              uuid primary key default gen_random_uuid(),
  account_id      text not null,                 -- the act_<id> the draft targets
  name            text not null,
  creative        jsonb not null,                -- serialized CreativeDraft union (lib/ads-create/chain.ts)
  preview         jsonb,                          -- { thumbUrl?, pageName?, headline?, message? } for list rendering
  status          text not null default 'draft',  -- draft | published
  fb_creative_id  text,                           -- set on publish (FB adcreative id)
  published_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists creative_drafts_account_idx
  on creative_drafts (account_id, updated_at desc);

create table if not exists creative_templates (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  category    text,                               -- objective / use-case label
  copy        jsonb not null,                     -- { message, headline, description, cta }
  created_at  timestamptz not null default now()
);

-- ── Seed default templates ───────────────────────────────────────────────────────
-- Stable ids so re-running is idempotent.
insert into creative_templates (id, name, category, copy) values
  (
    '11111111-1111-1111-1111-111111111111',
    'เก็บลีด (Lead Gen)',
    'Leads',
    '{"message":"สนใจรับข้อมูลเพิ่มเติม? กรอกข้อมูลสั้น ๆ แล้วทีมงานติดต่อกลับทันที ✅","headline":"รับสิทธิพิเศษวันนี้","description":"ปรึกษาฟรี ไม่มีค่าใช้จ่าย","cta":"SIGN_UP"}'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    'โปรโมชั่น / ลดราคา (Promo)',
    'Sales',
    '{"message":"🔥 ลดแรงเฉพาะช่วงนี้! ของมีจำนวนจำกัด รีบเลยก่อนหมด","headline":"ลดสูงสุด 50% วันนี้เท่านั้น","description":"ส่งฟรีทั่วประเทศ","cta":"SHOP_NOW"}'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    'สร้างการรับรู้ (Awareness)',
    'Awareness',
    '{"message":"รู้จักเราให้มากขึ้น — แบรนด์ที่ลูกค้ากว่าพันรายไว้วางใจ","headline":"ทำไมต้องเลือกเรา","description":"คุณภาพที่พิสูจน์ได้","cta":"LEARN_MORE"}'
  ),
  (
    '44444444-4444-4444-4444-444444444444',
    'ทักแชท (Message Us)',
    'Engagement',
    '{"message":"มีคำถาม? ทักมาคุยกับเราได้เลย ตอบไว ตอบจริง 💬","headline":"แอดมินพร้อมดูแลคุณ","description":"สอบถามรายละเอียดได้ทุกวัน","cta":"CONTACT_US"}'
  ),
  (
    '55555555-5555-5555-5555-555555555555',
    'จองตอนนี้ (Book Now)',
    'Leads',
    '{"message":"จองคิวง่าย ๆ เลือกวันและเวลาที่สะดวกของคุณได้เลย","headline":"จองคิวออนไลน์ สะดวกทุกที่","description":"ที่นั่งมีจำนวนจำกัด","cta":"BOOK_NOW"}'
  )
on conflict (id) do nothing;
