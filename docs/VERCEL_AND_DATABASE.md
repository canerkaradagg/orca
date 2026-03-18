# Vercel’de yayın + Veritabanı (SQL Server) nasıl kullanılır?

## Mevcut yapı

- **Vercel:** Sadece frontend (Vite build) yayınlanıyor. Tarayıcı buradan JS/CSS alıyor.
- **Veritabanı:** SQL Server (`OrcaAlokasyon`) şu an `10.110.0.30` adresinde (yerel ağ).
- **API:** `scripts/db-server.cjs` — Node.js sunucusu; SQL Server’a bağlanıp `/api/*` isteklerine cevap veriyor.

Vercel’de **veritabanı çalıştırılamaz**. API de uzun süre çalışan bir sunucu olduğu için Vercel’in serverless ortamına doğrudan taşınmaz (isterseniz sonra serverless’e uyarlanabilir). Bu yüzden database ve API’yi ayrı bir yerde çalıştırmanız gerekir.

---

## Seçenek 1: API + DB aynı yerde (önerilen başlangıç)

SQL Server’ı **olduğu gibi** kullanın; API’yi de **veritabanına erişebilen** bir sunucuda çalıştırın.

### Adımlar

1. **SQL Server’ı erişilebilir yapın**
   - Şu an `10.110.0.30` muhtemelen sadece şirket içi ağdan erişilebilir.
   - API’nin çalışacağı sunucu bu ağa erişebilmeli:
     - Aynı ağdaki bir PC/sunucu, **veya**
     - VPN ile bu ağa bağlanan bir sunucu, **veya**
     - SQL Server’ı (güvenlik kurallarına uygun şekilde) internete açmak (önerilmez; mümkünse VPN/özel ağ kullanın).

2. **API’yi bir sunucuda çalıştırın**
   - Bu sunucu SQL Server’a (örn. `10.110.0.30`) bağlanabilsin.
   - Örnek: Kendi sunucunuz, Azure VM, AWS EC2, DigitalOcean Droplet, Railway, Render vb.
   - Sunucuda:
     - Node.js kurun.
     - Projeyi klonlayın, `npm install`, `.env` dosyasını doğru doldurun (`DB_SERVER`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` vb.).
     - API’yi sürekli çalışır tutun:
       - `node scripts/db-server.cjs` (ve PM2/systemd ile sürekli açık tutun), **veya**
       - İsterseniz mevcut Windows servis yapınızı kullanın.

3. **Vercel’deki frontend’i bu API’ye yönlendirin**
   - Vercel projesinde **Environment Variables** kısmına ekleyin:
     - `VITE_API_BASE` = API’nin dışarıdan erişilen adresi  
       Örnek: `https://api.sizin-domain.com` (sonunda `/` olmasın)
   - Build’i yeniden alın (veya bir sonraki deploy’da kullanılır).
   - Tarayıcıda açılan uygulama artık istekleri bu API’ye gönderir; API da SQL Server’a bağlanır.

Özet: **Database = mevcut SQL Server; Vercel = sadece arayüz; API = SQL’e erişebilen bir sunucuda.**

---

## Seçenek 2: SQL Server’ı buluta taşımak (Azure SQL)

Veritabanını buluta alıp, API’yi de bulutta çalıştırmak isterseniz:

1. **Azure SQL Database** (veya başka bir bulut SQL Server) oluşturun.
2. Mevcut `OrcaAlokasyon` veritabanınızı buraya **yedekleyip geri yükleyin** (backup/restore veya migration aracı).
3. API’yi çalıştırdığınız sunucunun `.env` dosyasında:
   - `DB_SERVER` = Azure SQL sunucu adresi (örn. `xxx.database.windows.net`)
   - `DB_NAME`, `DB_USER`, `DB_PASSWORD` = Azure’daki bilgiler
   - Gerekirse encryption/port ayarlarını dokümantasyona göre ekleyin.
4. Frontend tarafı aynı: Vercel’de `VITE_API_BASE` = bu API’nin URL’i.

Böylece “database’i nasıl yaparım” sorusu: **Azure SQL’de barındırıp, API’yi ona bağlamak** olur.

---

## Seçenek 3: API’yi Vercel Serverless yapmak (ileri seviye)

API’yi Vercel’de **serverless function** olarak çalıştırmak mümkün ama:

- `db-server.cjs` tek bir sürekli çalışan sunucu; bunu `/api/*` route’larına göre **ayrı serverless fonksiyonlara** bölmeniz gerekir.
- SQL Server bağlantısı her istekte açılıp kapanacağı için connection pooling ve timeout ayarları önemli.
- SQL Server’ın **internetten erişilebilir** olması (veya Vercel’in erişebildiği bir ağda olması) gerekir.

Bu yol daha çok refactor gerektirir; önce Seçenek 1 veya 2 ile çalışan bir yapı kurmanız daha mantıklı.

---

## Özet tablo

| Bileşen    | Nerede çalışır?        | Not |
|-----------|-------------------------|-----|
| Frontend  | Vercel                  | Zaten yayında; `VITE_API_BASE` ile API’yi hedefler. |
| Veritabanı| SQL Server (mevcut veya Azure) | Vercel’de DB çalışmaz; ayrı sunucu/Azure SQL. |
| API       | DB’ye erişebilen bir sunucu | `db-server.cjs`; Vercel dışında (VM, Railway, Render, kendi sunucu). |

## Hızlı kontrol listesi

- [ ] SQL Server’a API’nin çalışacağı makineden erişilebiliyor mu? (`DB_SERVER`, `DB_NAME`, kullanıcı/şifre)
- [ ] API sunucusu dışarıdan erişilebilir mi? (HTTPS, firewall, gerekirse domain)
- [ ] Vercel’de `VITE_API_BASE` bu API URL’i ile set edildi mi?
- [ ] CORS API tarafında açık mı? (Projede `Access-Control-Allow-Origin: *` var; production’da gerekirse domain kısıtlayın.)
- [ ] OrcaTrigger servisi kullanılıyorsa: `INTERNAL_SERVICE_API_KEY` hem API hem trigger `.env` dosyasında aynı değerle tanımlı mı?

Bu adımlarla Vercel’deki proje, database’i kullanan mevcut API’nize bağlanmış olur.
