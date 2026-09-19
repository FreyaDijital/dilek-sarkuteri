# Dilek Şarküteri

Kurumsal web sitesi + yönetim paneli. Node.js / Express / EJS / SQLite (better-sqlite3).
Online satış yoktur; sipariş akışı WhatsApp'a yönlendirilir.

## Kurulum

```bash
npm install
cp .env.example .env     # değerleri doldurun (DB_PATH, UPLOAD_DIR, SESSION_SECRET)
npm run db:init -- --seed   # şema + göçler + kategoriler + sabit bilgiler
npm run admin:create        # panel kullanıcısı
npm start
```

## Hostinger notları

- Uygulama "Web Uygulaması" (Node.js) olarak çalışır, giriş dosyası `app.js`.
- **Her deploy'da uygulama klasörü silinir.** Yüklenen görseller bu yüzden
  `UPLOAD_DIR` ile uygulama klasörünün dışına yazılır
  (örn. `/home/KULLANICI/uploads/dilek-sarkuteri`).
  Bu klasör deploy'dan bağımsızdır ve elle bir kez oluşturulmalıdır.
- `.env` sunucuda elle oluşturulur, repoya girmez.
- `better-sqlite3` native bir modüldür ama **hazır derlenmiş binary ile gelir**
  (`prebuilds/linux-x64.node`, `linux-arm64`, `linuxmusl-*`) ve Node-API
  kullandığı için Node sürümü değişse de yeniden derleme gerekmez.
  Derleyici gerektirmez; `npm install` yeterlidir.
- **`DB_PATH` varsayılanı `./data/dilek.db` uygulama klasörünün içindedir ve
  deploy'da silinir.** Canlıda `UPLOAD_DIR` gibi dışarı alın:
  `DB_PATH=/home/KULLANICI/data/dilek.db`

## Site sayfaları

| Adres | İçerik |
|---|---|
| `/` | hikâye, kategoriler, tedarik, mutfak şeridi (öne çıkan ürünler), tabaklar, yorumlar, ziyaret |
| `/hakkimizda` | sabit metin (`views/pages/about.ejs`) |
| `/urunler`, `/urunler?ara=…` | tüm aktif ürünler, arama |
| `/urunler/:kategori` | kategori ürünleri (pasif kategori → 404) |
| `/urun/:slug` | ürün detayı + aynı kategoriden ürünler (pasif ürün → 404) |
| `/tabaklar` | tabak/kutu seçenekleri + yayındaki kampanyalar |
| `/kampanyalar/:slug` | kampanya detayı (`/kampanyalar` → `/tabaklar#kampanyalar`) |
| `/iletisim` | bilgiler, harita, iletişim formu (mesajlar panele düşer) |

Notlar:

- İletişim bilgileri, saatler ve Instagram her yerde panel **Ayarlar**'dan okunur.
- Ana sayfadaki "Mutfağımızdan" şeridi panelde **öne çıkarılan** ürünleri gösterir;
  hiç yoksa tasarımdaki örnek mezeler görünür.
- Tabaklar sayfası `tabaklar` slug'lı kategorideki ürünleri listeler. Panelde
  "Tabaklar" adında kategori açılıp ürün eklenene kadar sabit 4 seçenek görünür.
- İletişim formunda CSRF, bot tuzağı (gizli alan) ve oturum başına 60 sn bekleme var.
- Harita için panele Google Haritalar "Yerleştir" kodu yapıştırılır; sayfaya sadece
  `google.com/maps/embed` adresli iframe basılır.

### Görseller

Tasarımdaki sabit fotoğraflar `public/img/` altında aşağıdaki adlarla aranır; dosya
yoksa placeholder gösterilir. Aynı adla dosya koymak yeterli, kod değişmez:

`peynir-tahtasi.jpg` (ana başlık) · `peynir-tabagi.jpg` · `meze-tabagi.jpg` ·
`peynir-kutusu.jpg` · `sarkuteri-tabagi.jpg` · `sandvic.jpg` · `patlican-salatasi.jpg` ·
`havuc-tarator.jpg` · `mucver.jpg` · `cig-kofte.jpg` · `yesillik-mezesi.jpg` · `salam-salatasi.jpg`

Ürün, kategori ve kampanya görselleri panelden yüklenir; yüklenmemişse placeholder çıkar.

## Yönetim paneli

`/admin/giris` adresinden girilir. Panelden yönetilenler:

| Bölüm | Adres | Neler yapılır |
|---|---|---|
| Ürünler | `/admin/urunler` | ekle / düzenle / sil, filtrele, görsel yükle veya `public/img`'den seç, listeden ↑↓ sırala, aktif/pasif ve öne çıkar rozetlerine tıklayarak değiştir |
| Kategoriler | `/admin/kategoriler` | ekle / düzenle / sil, ↑↓ sıralama, aktif/pasif, görsel |
| Kampanyalar | `/admin/kampanyalar` | ekle / düzenle / sil, tek tıkla yayına al-kaldır, tarih aralığı |
| Ayarlar | `/admin/ayarlar` | logo yükleme, **fiyatları göster/gizle**, iletişim bilgileri, çalışma saatleri, sosyal medya |
| Mesajlar | `/admin/mesajlar` | iletişim formu mesajlarını oku / sil |

Notlar:

- **Fiyat görünürlüğü:** Ayarlar > Genel > "Fiyatları sitede göster" kapalıyken
  ürün kartlarında ve ürün sayfasında fiyat yazmaz; sipariş butonları çalışmaya
  devam eder. Panelde fiyatlar her zaman görünür. Varsayılan: kapalı.
- **Ürün görselinin iki kaynağı var:**
  - *Bilgisayardan yükle* → `UPLOAD_DIR` altına rastgele adla yazılır,
    veritabanında `foo.jpg` olarak tutulur (deploy'dan etkilenmez).
  - *Hazır fotoğraflardan seç* → repodaki `public/img/` klasöründen seçilir,
    veritabanında `img/foo.jpg` olarak tutulur. Bu dosyalar paylaşımlı kabul
    edilir; ürün silinse bile diskten silinmez.
  Dosyayı `urun-adi.jpg` biçiminde koyarsanız, ürünün adresiyle (slug) aynı adı
  taşıyan dosya seçim listesinde **★ Önerilen** olarak en üstte çıkar.
- Yüklenen görseller `UPLOAD_DIR` altına rastgele adla yazılır; kayıt silindiğinde
  veya görsel değiştirildiğinde eski dosya diskten de silinir.
- **Adres (slug) elle girilebilir.** Dolu bırakılırsa ürün adı değişse bile adres
  sabit kalır, daha önce paylaşılan linkler kırılmaz.
- Kategori silinirse ürünler **silinmez**, kategorisiz kalır.
- Fiyat boş bırakılabilir; sitede "Fiyat için arayınız" yazar.
- Ürün/kategori adı değişince adres (slug) da değişir.
- Tüm panel formları CSRF token'ı taşır.

## Şema göçleri

`db/schema.sql` yalnızca `CREATE TABLE IF NOT EXISTS` içerir; mevcut bir
veritabanındaki tabloyu değiştirmez. Sütun/kısıt değişiklikleri
`db/migrations.js` içine yazılır ve `npm run db:init` çalıştığında bir kez
uygulanır (uygulananlar `migrations` tablosunda tutulur). Yeni göçü listenin
sonuna ekleyin, adını sonradan değiştirmeyin.

## Klasör yapısı

```
config/      veritabanı bağlantısı, uygulama ayarları
db/          schema.sql, seed.sql, migrations.js (SQLite)
middleware/  oturum kontrolü, multer yapılandırması, hata yakalama
models/      tablo bazlı sorgular (product, category, campaign, setting, message, user)
routes/      site rotaları + routes/admin altında panel rotaları
             (products, categories, campaigns, settings, messages)
utils/       slug üretimi, biçimlendirme yardımcıları
views/       EJS şablonları (layouts, partials, pages, admin)
public/      statik dosyalar (css, js, img)
scripts/     init-db.js, create-admin.js
```
