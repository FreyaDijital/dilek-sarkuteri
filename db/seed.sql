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
  ('facebook',         '',                               'sosyal', 'Facebook',            'url',      3)
ON CONFLICT (setting_key) DO UPDATE SET
  setting_group = excluded.setting_group,
  label         = excluded.label,
  input_type    = excluded.input_type,
  sort_order    = excluded.sort_order;
