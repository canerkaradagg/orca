# ORCA Tetikleyici Servisi – Windows Service Kurulumu

Zamanlanmış işler (kuyruk işleme, draft temizlik, log temizlik, bakım raporu) **orca-trigger-service** ile çalıştırılır. Bu script önce local bilgisayarınızda, daha sonra sunucuda Windows Service olarak kurulabilir.

## Servisler nerede çalışıyor?

- **OrcaApi** (Windows Service: OrcaApi): `scripts/db-server.cjs` — HTTP API sunucusu. Tüm REST endpoint’leri (parametreler, kuyruk, finans, bakım vb.) bu process içinde çalışır.
- **OrcaTrigger** (Windows Service: OrcaTrigger): `scripts/orca-trigger-service.cjs` — Zamanlayıcı. Dakikada bir `GET /api/parameters` ile parametreleri alır; aralığı dolan job’lar için **OrcaApi’ye** `POST /api/...` atar. Job’ların kendisi OrcaApi’de çalışır (kuyruk işleme, draft temizlik, log temizlik, bakım raporu, Update Replenishment, Sync DispOrder, DispOrderHeader Category/Season/Brand güncellemesi vb.).

## Çalıştırma (manuel)

1. ORCA API sunucusunun ayakta olduğundan emin olun: `npm run db:serve`
2. Başka bir terminalde: `node scripts/orca-trigger-service.cjs`
3. Ortam değişkeni (isteğe bağlı): `ORCA_API_BASE=http://localhost:3001` (varsayılan bu)

Parametreler (çalışma sıklığı vb.) **Parametreler** sayfasından veya `dbo.SystemParameter` tablosundan okunur.

## Windows Service olarak kurulum (NSSM ile)

1. [NSSM](https://nssm.cc/download) indirip açın.
2. `nssm install OrcaTriggerService` çalıştırın.
3. Açılan pencerede:
   - **Path:** `node.exe` (veya `C:\Program Files\nodejs\node.exe`)
   - **Startup directory:** ORCA app klasörü (örn. `C:\...\ORCA\app`)
   - **Arguments:** `scripts/orca-trigger-service.cjs`
4. **Service** sekmesinde "Start service" ile başlatın.

Servisi kaldırmak için: `nssm remove OrcaTriggerService confirm`

## E-posta (bakım raporu)

Bakım raporunun e-posta ile gelmesi için `.env` dosyasında SMTP ayarları tanımlı olmalı:

- `SMTP_HOST`
- `SMTP_PORT` (örn. 587)
- `SMTP_USER`
- `SMTP_PASS`
- `SMTP_FROM` (isteğe bağlı)

Alıcı adresi **Parametreler** sayfasındaki **MaintenanceReportEmail** değeridir (varsayılan: caner.karadag@olka.com.tr).
