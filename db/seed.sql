-- ============================================================
--  Dilek Şarküteri - Başlangıç Verileri (SQLite)
--  schema.sql çalıştırıldıktan SONRA çalıştırın.
--  Not: admin kullanıcısı burada DEĞİL, `npm run admin:create`
--       komutuyla oluşturulur (şifre bcrypt ile hashlenmeli).
--
--  Tekrar çalıştırılabilir: mevcut kayıtların setting_value'su
--  korunur, sadece etiket/grup/sıra bilgisi tazelenir.
-- ============================================================

-- ---- Kategoriler -------------------------------------------
-- image: public/img klasöründen seçilmiş kart görselleri ('img/' öneki).
-- Bilerek ON CONFLICT listesinde DEĞİL: panelden başka bir görsel seçilirse
-- seed tekrar çalıştığında üzerine yazılmasın.
INSERT INTO categories (name, slug, description, image, sort_order, is_active) VALUES
  ('Meze',      'meze',      'Kadınbudu köfteden dolmaya, zeytinyağlılardan taramaya. Her gün mutfakta hazırlanıyor.', 'img/IMG-20260909-WA0125.jpg', 1, 1),
  ('Peynir',    'peynir',    'Obruk peynirinden küflüye, yerli kooperatiflerden ithal çeşitlere geniş bir yelpaze.',    'img/IMG-20260909-WA0091.jpg', 2, 1),
  ('Şarküteri', 'sarkuteri', 'Pastırma, füme et, salam, sucuk ve dilimlenmiş çeşitler — istediğiniz kalınlıkta.',       'img/IMG-20260909-WA0143.jpg', 3, 1)
ON CONFLICT (slug) DO UPDATE SET
  name        = excluded.name,
  description = excluded.description,
  sort_order  = excluded.sort_order;

-- ---- Ayarlar ------------------------------------------------
INSERT INTO settings (setting_key, setting_value, setting_group, label, input_type, sort_order) VALUES
  -- genel
  ('site_title',       'Dilek Şarküteri',                'genel', 'Site Başlığı',        'text',     1),
  ('site_tagline',     '1977''den beri',                 'genel', 'Slogan',              'text',     2),
  ('site_description', '1977''den beri Suadiye''de meze, peynir ve şarküteri.', 'genel', 'Site Açıklaması (SEO)', 'textarea', 3),
  ('logo',             '',                               'genel', 'Logo', 'image', 4),
  -- Fiyat toggle: '0' kapalı (varsayılan), '1' açık. Fiyatlar sitede gizlenir/gösterilir.
  ('show_prices',      '0',                              'genel', 'Fiyatları sitede göster', 'checkbox', 5),

  -- iletişim
  ('address',          'Suadiye Mah. Ayşe Çavuş Cad. No:12/A Kadıköy/İstanbul', 'iletisim', 'Adres', 'textarea', 1),
  ('phone',            '0216 373 27 52',                 'iletisim', 'Telefon',           'tel',      2),
  ('whatsapp',         '0542 478 76 05',                 'iletisim', 'WhatsApp Numarası', 'tel',      3),
  ('whatsapp_intl',    '905424787605',                   'iletisim', 'WhatsApp (wa.me formatı, başında 90)', 'text', 4),
  ('email',            'dileksarkuteri@gmail.com',                               'iletisim', 'E-posta',           'email',    5),
  ('map_embed',        '',                               'iletisim', 'Google Harita Embed Kodu', 'textarea', 6),

  -- çalışma saatleri
  ('hours_weekday',    'Pazartesi - Cumartesi: 08:00 - 21:00', 'saatler', 'Hafta İçi / Cumartesi', 'text', 1),
  ('hours_sunday',     'Pazar: 08:00 - 20:00',           'saatler', 'Pazar',             'text',     2),
  ('hours_note',       '',                               'saatler', 'Ek Not (tatil vb.)','text',     3),

  -- sosyal medya
  ('instagram_1',      'dilekmezesarkuteri',             'sosyal', 'Instagram 1',         'text',     1),
  ('instagram_2',      'dilek_sarkuteri_suadiye',        'sosyal', 'Instagram 2',         'text',     2),
  ('facebook',         '',                               'sosyal', 'Facebook',            'url',      3),

  -- ana sayfa: şubeler bölümü (kartların içeriği `branches` tablosundan gelir)
  ('branches_enabled', '1',                              'subeler', 'Şubeler bölümünü ana sayfada göster', 'checkbox', 1),
  ('branches_eyebrow', 'Şubelerimiz',                    'subeler', 'Üst Yazı',            'text',     2),
  ('branches_title',   'İki tezgâh, aynı ciddiyet',      'subeler', 'Başlık',              'text',     3),
  ('branches_text',    '',                               'subeler', 'Açıklama',            'textarea', 4),

  -- ana sayfa: dükkânda yiyin
  ('dine_in_enabled',  '1',                              'dukkanda', 'Dükkânda Yiyin bölümünü ana sayfada göster', 'checkbox', 1),
  ('dine_in_eyebrow',  'Dükkânda yiyin',                 'dukkanda', 'Üst Yazı',           'text',     2),
  ('dine_in_title',    'Tezgâhın başında bir tabak',     'dukkanda', 'Başlık',             'text',     3),
  ('dine_in_text',     'Aldığınızı paket yaptırmak zorunda değilsiniz. Dükkânda oturup günün mezelerinden bir tabak, serpme kahvaltı ya da tezgâhta hazırlanan sandviçlerden birini yiyebilirsiniz.', 'dukkanda', 'Açıklama', 'textarea', 4),
  ('dine_in_items',    'Meze tabağı
Kahvaltı
Sandviç',                                           'dukkanda', 'Maddeler (her satır bir madde)', 'textarea', 5),

  -- ana sayfa: organizasyonlar
  ('events_enabled',   '1',                              'organizasyon', 'Organizasyonlar bölümünü ana sayfada göster', 'checkbox', 1),
  ('events_eyebrow',   'Organizasyonlar',                'organizasyon', 'Üst Yazı',       'text',     2),
  ('events_title',     'Kalabalık bir sofra mı kuruyorsunuz?', 'organizasyon', 'Başlık',   'text',     3),
  ('events_text',      'Toplu meze siparişi, davet ve organizasyonlar için tezgâh sizin adınıza çalışır. Kişi sayısını ve tarihi söyleyin, menüyü birlikte çıkaralım.', 'organizasyon', 'Açıklama', 'textarea', 4),
  ('events_items',     'Toplu meze siparişi
Davet ve kutlamalar
Kurumsal ikramlar',                                  'organizasyon', 'Maddeler (her satır bir madde)', 'textarea', 5),
  ('events_cta',       'WhatsApp''tan teklif alın',      'organizasyon', 'Buton Yazısı',   'text',     6),
  ('events_wa_message','Merhaba, organizasyon için toplu sipariş hakkında bilgi almak istiyorum.', 'organizasyon', 'WhatsApp Mesajı', 'text', 7),

  -- pop-up duyuru (Panel > Pop-up Duyuru). Varsayılan: kapalı.
  ('popup_enabled',    '0',                              'popup', 'Pop-up duyuruyu sitede göster', 'checkbox', 1),
  ('popup_title',      '',                               'popup', 'Başlık',              'text',     2),
  ('popup_text',       '',                               'popup', 'Metin',               'textarea', 3),
  ('popup_image',      '',                               'popup', 'Görsel',              'image',    4),
  ('popup_button_text','',                               'popup', 'Buton Yazısı',        'text',     5),
  ('popup_button_url', '',                               'popup', 'Buton Linki',         'url',      6),

  -- tanıtım videosu (Panel > Tanıtım Videosu). Link boşken bölüm çizilmez.
  ('video_url',        '',                               'video', 'YouTube veya Vimeo Linki', 'url', 1),
  ('video_eyebrow',    'Tanıtım',                        'video', 'Üst Yazı',            'text',     2),
  ('video_title',      'Tezgâhın arkasında bir gün',     'video', 'Başlık',              'text',     3),
  ('video_text',       '',                               'video', 'Açıklama',            'textarea', 4)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_group = excluded.setting_group,
  label         = excluded.label,
  input_type    = excluded.input_type,
  sort_order    = excluded.sort_order;

-- ---- Şubeler -------------------------------------------------
-- Yalnızca tablo boşken doldurulur; panelden düzenlenen kayıtların
-- üzerine yazılmaz. İkinci şubenin adresi/telefonu bilerek boş:
-- siteye uydurma bilgi çıkmasın, panelden girilsin.
INSERT INTO branches (name, address, phone, hours, note, sort_order, is_active)
SELECT * FROM (
  SELECT 'Suadiye (Merkez)' AS name,
         'Suadiye Mah. Ayşe Çavuş Cad. No:12/A Kadıköy/İstanbul' AS address,
         '0216 373 27 52' AS phone,
         'Pazartesi - Cumartesi: 08:00 - 21:00' || char(10) || 'Pazar: 08:00 - 20:00' AS hours,
         NULL AS note, 1 AS sort_order, 1 AS is_active
  UNION ALL
  SELECT 'Şaşkınbakkal', NULL, NULL, NULL,
         'Açılış hazırlıkları sürüyor. Adres ve telefon panelden girilebilir.', 2, 1
)
WHERE NOT EXISTS (SELECT 1 FROM branches);
