# AGENTS.md — Auto Port Allocator (Pterodactyl 2.0 Extension)

Bu doküman, projede çalışan tüm AI ajanları ve geliştiriciler için projenin amacını, mimarisini, dosya yapısını ve kurallarını içeren merkezi kılavuzdur.

---

## 1. Proje Amacı ve Kapsamı
Pterodactyl panelinde varsayılan olarak sunucular tek bir ana port (primary allocation) ile kurulur. Ancak **Rust, MTA (Multi Theft Auto), Palworld, ARK** gibi modern oyunlar birden fazla porta (Game, Query, RCON, HTTP, Rust+ App vb.) ihtiyaç duyar:
- **Rust:** `SERVER_PORT` (UDP), `QUERY_PORT` (UDP), `RCON_PORT` (TCP), `APP_PORT` (Rust+ TCP).
- **MTA:** `SERVER_PORT` (UDP örn: 22003), `HTTP_PORT` (TCP örn: 22005 - Game + 2), `ASE_PORT` (UDP örn: 22126 - Game + 123).

Bu projenin (`auto-port-allocator`) amacı:
1. Pterodactyl 2.0 extension ekosistemine tam uyumlu bir eklenti olarak çalışmak.
2. Yumurtalara (Egg) özel çoklu port kuralları tanımlanmasını sağlamak.
3. Sunucu oluşturulurken (`CreateServer`) veya yumurta değiştirilirken (`ChangeServerEgg`), gerekli ek portları node'un allocation havuzundan **otomatik olarak bulup sunucuya atamak**.
4. Atanan portları doğrudan ilgili sunucu ortam değişkenlerine (`ServerVariable` / Environment) otomatik senkronize etmek.
5. Kullanıcı ve admin panelinde hangi portun ne amaçla kullanıldığını şeffaf bir şekilde listelemek.

---

## 2. Temel Referanslar ve Kaynaklar

> [!IMPORTANT]
> Herhangi bir geliştirme yapmadan önce mutlaka aşağıdaki iki kaynağı referans alınız:
> 1. **Resmi Pterodactyl 2.0 Extension Dokümanı:** [https://docs.pterodactyl.io/v2/extensions/building](https://docs.pterodactyl.io/v2/extensions/building)
> 2. **Pterodactyl Panel Kaynak Kodları:** `../panel-files` dizinindedir (Bu projenin bir üst klasöründeki `panel-files`).

### Panel İçi Kritik Çekirdek Sınıflar (`../panel-files`):
- **Server Creation Action:** `Pterodactyl\Actions\Servers\CreateServer` (implements `Pterodactyl\Contracts\Servers\CreatesServers`)
- **Server Allocation Actions:**
  - `Pterodactyl\Actions\Allocations\AssignAllocation`
  - `Pterodactyl\Actions\Allocations\AssignAvailableAllocation`
  - `Pterodactyl\Actions\Allocations\CreateAllocations`
- **Extension Action Extender / Decorator:**
  - `Pterodactyl\Services\Extensions\ExtensionActionDecorators`
  - Extension Provider içindeki `$this->wrapAction(Contract::class, fn ($inner) => ...)` yeteneği.
- **Environment & Configuration:**
  - `Pterodactyl\Services\Servers\EnvironmentService`
  - `Pterodactyl\Services\Servers\ServerConfigurationStructureService`
- **SDK & Frontend:**
  - `../panel-files/packages/sdk` (React 19, TanStack Router/Query, Tailwind 4, Lucide React).

---

## 3. Extension Kimlik Bilgileri & Standartları

- **Extension ID:** `auto-port-allocator`
- **Extension Name:** Auto Port Allocator
- **Namespace:** `AutoPortAllocator\`
- **Provider:** `AutoPortAllocator\AutoPortAllocatorProvider`
- **Tailwind UI Prefix:** `apa:` (Tüm frontend stil sınıfları bu prefix ile yazılmalıdır: örn. `apa:text-sm apa:bg-muted`)
- **Frontend Entry:** `src/client/index.tsx`
- **SDK Bağımlılığı:** `@pterodactyl/sdk` -> `file:../panel-files/packages/sdk`
- **PHP Sürümü:** `^8.3`

---

## 4. Proje Dizin Yapısı

```
Auto-Port-Allocator/
├── .github/workflows/ci.yml       # Extension CI doğrulama
├── database/
│   └── migrations/                # Eklenti veritabanı tabloları (port kuralları)
├── routes/
│   ├── client.php                 # İstemci API rotaları (/api/client/extensions/auto-port-allocator/...)
│   ├── server.php                 # Sunucu özel rotalar (/api/client/servers/{server}/extensions/...)
│   └── admin.php                  # Yönetici API rotaları (Kural tanımlama)
├── scripts/
│   └── externalize-api.mjs
├── src/
│   ├── AutoPortAllocatorProvider.php # Laravel Extension Provider
│   ├── Actions/                   # Port tahsis ve kural işleme eylemleri
│   ├── Decorators/                # CreateServer vb. action wrapper sınıfları
│   ├── Http/Controllers/          # API Controller sınıfları
│   ├── Models/                    # PortAllocationRule vb. Eloquent modelleri
│   ├── Services/                  # Dağıtım ve algoritma motoru (Offset, Any Free vb.)
│   └── client/                    # React 19 / TypeScript Frontend
│       ├── generated/             # OpenAPI ile üretilen tipler/istekler
│       ├── screens/               # Extension ekranları
│       ├── styles.css             # Tailwind v4 stilleri (apa prefix)
│       └── index.tsx              # Extension client register noktası
├── composer.json                  # PSR-4 Autoload tanımı
├── extension.json                 # Pterodactyl 2.0 extension manifesti
├── package.json                   # UI bağımlılıkları & derleme komutları
├── tsconfig.json
├── vite.config.mjs
├── vitest.config.mjs
├── README.md
└── AGENTS.md                      # Bu dosya
```

---

## 5. Port Tahsis Algoritmaları & Kural Mantığı

### Temel Mimari: `SERVER_PORT` ve Alt Kurallar (Sub-Rules)
- **Ana Port (`SERVER_PORT`):** Pterodactyl panelinde bir sunucu oluşturulduğunda belirlenen birincil port (`allocation_id`) her zaman varsayılan oyun portu olarak atanır ve sistem genelinde `SERVER_PORT` rezerve değişkeni ile temsil edilir. Kullanıcı veya yönetici `SERVER_PORT` için kural tanımlayamaz veya değer atayamaz; `SERVER_PORT` sistemin değişmez temel referansıdır.
- **Alt Kurallar (Sub-Rules):** Auto Port Allocator üzerinde tanımlanan tüm kurallar birer **alt kuraldır (sub-rule)**. Bu kurallar ek portları (secondary/tertiary allocations) otomatik tahsis eder ve değerlerini ilgili yumurta ortam değişkenine (örn: `RCON_PORT`, `APP_PORT`, `HTTP_PORT`, `ASE_PORT`) aktarır.

Bir yumurta (Egg) için oluşturulabilecek alt kural tipleri:

1. **Offset Kuralı (Fixed Offset from SERVER_PORT):**
   - Birincil porta (`SERVER_PORT`) belirli bir sayı ekleyerek aynı IP üzerinde tahsis arar: `SERVER_PORT + offset`.
   - Örnek MTA: `SERVER_PORT` = 22003 ise, `HTTP_PORT` = Primary + 2 (22005), `ASE_PORT` = Primary + 123 (22126).
   - Eğer offset portu o node/IP üzerinde allocation olarak yoksa veya doluysa, admin yapılandırmasına göre ya otomatik oluşturulur ya da hata fırlatılır.

2. **Any Available Kuralı (Herhangi bir boş port):**
   - Aynı Node ve aynı IP üzerinde bulunan ve henüz bir sunucuya atanmamış ilk boş allocation seçilir.
   - Örnek Rust: `RCON_PORT` veya `APP_PORT` için ardışık olma zorunluluğu yoktur, boşta olan herhangi bir port atanabilir.

3. **Range / Pool Kuralı:**
   - Belirlenen bir port aralığından (örn. 28000-28100) boş port tahsis edilir.

---

## 6. Geliştirme ve Derleme Kuralları

- **Frontend Derleme:**
  ```bash
  npm install
  npm run build        # dist/client.js üretir
  npm run dev          # Değişiklikleri anlık izler
  npm run typecheck    # TypeScript kontrolü
  ```
- **Panel ile Bağlama (Development):**
  Pterodactyl panel ana dizininden:
  ```bash
  php artisan p:extension:dev "c:/Projects/Pterodactyl Projects/Auto-Port-Allocator" --enable
  ```
- **Paketleme (Production):**
  ```bash
  php artisan p:extension:pack "c:/Projects/Pterodactyl Projects/Auto-Port-Allocator"
  ```

---

## 7. Uygulama Durumu ve Yol Haritası
- [x] Extension iskeleti & manifest (`extension.json`, `composer.json`, `package.json`, Vite/Tailwind 4).
- [x] `database/migrations`: `auto_port_allocator_rules` ve `auto_port_allocator_server_ports` tabloları.
- [x] Eloquent Modelleri: `PortRule.php` ve `ServerAllocatedPort.php`.
- [x] `src/Services/AutoPortAllocationService.php`: Fixed offset (+1, +2, +123 vb.), any available ve range tahsis motoru.
- [x] `src/Decorators/CreateServerDecorator.php`: `CreatesServers` kontratını wrap ederek sunucu açılışında otomatik port tahsisi.
- [x] `src/Decorators/ChangeServerEggDecorator.php`: `ChangesServerEgg` kontratını wrap ederek yumurta değiştiğinde portları güncelleme.
- [x] `routes/admin.php` & `EggPortRuleController.php`: Admin kural yönetimi ve yumurta değişkenleri API'si.
- [x] `routes/server.php` & `ServerPortAllocationController.php`: Sunucu port rolleri listesi ve canlı senkronizasyon API'si.
- [x] `src/client/screens/ServerScreen.tsx`: Sunucu detayında portları rolleriyle gösteren ve eksik portları tek tıkla senkronize eden ekran.
- [x] `src/client/screens/AdminScreen.tsx`: Admin panelinde Egg bazlı port kuralları ekleme/silme ve yapılandırma arayüzü.

