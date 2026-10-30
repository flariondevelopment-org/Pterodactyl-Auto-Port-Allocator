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
3. Sunucu oluşturulurken (`CreateServer`) veya yumurta değiştirilirken (`ChangeServerEgg`), gerekli ek portları node'un allocation havuzundan **otomatik olarak bulup sunucuya atamak**; yumurta değiştiğinde ana port hedef profile uymuyorsa yeni ana portu otomatik tahsis edip eski portları havuzda boşa çıkarmak.
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

## 5. Oyun Bazlı Profil & Port Tahsis Mimarisi (Game Profiles & Sub-Rules)

### 1. Oyun Profili (GameProfile)
Kullanıcı veya yönetici doğrudan oyuna özel bir profil oluşturur (örn: `MTA`, `Rust`, `Palworld`):
- **İlişkili Yumurtalar (`egg_ids` / `egg_id`):** Profilin geçerli olduğu oyun yumurtası veya yumurtaları (çoklu yumurta seçimi desteklenir).
- **Ana Port Aralığı / Aralıkları (`primary_port_ranges` / `primary_range_start` - `primary_range_end`):** Birincil oyun portunun (`SERVER_PORT`) bulunması gereken port aralığı veya birden fazla ayrık port aralığı (örn: MTA için `22003 - 22050`).

### 2. İkincil Port Alt Kuralları (Sub-Rules)
Oyun profilinin içerisinde birden fazla ikincil port (secondary allocations) tanımlanır. Her bir port için ayrı strateji belirlenebilir:
- **Fixed Offset (SERVER_PORT + offset):** Birincil porta belirli bir sayı eklenerek port tahsis edilir (örn: MTA HTTP için `SERVER_PORT + 2`, ASE için `SERVER_PORT + 123`).
- **Specific Range(s) (`port_ranges`):** İkincil port için özel bir port havuzundan veya havuzlarından (örn: RCON için `28016 - 28025`) boş port seçilir.
- **Any Available:** Node ve IP üzerindeki (gerektiğinde node üzerindeki diğer IP'lere fallback yaparak) ilk uygun boş allocation atanır.
- **Auto-create on Node:** İlgili offset veya range portu node'da allocation olarak henüz tanımlanmamışsa otomatik oluşturulması seçeneği.
- **Strictly Required:** Port bulunamadığında kurulumu durdurma veya opsiyonel bırakma seçeneği.

### 3. Yumurta Değişimi & Otomatik Yeniden Tahsis (Egg Switch & Reallocation)
Sunucunun yumurtası değiştirildiğinde (`ChangeServerEggDecorator`):
- Sunucunun mevcut ana portu hedef profilin `primary_port_ranges` kuralına uymuyorsa, hedef aralıktan yeni bir ana port otomatik tahsis edilir (`allocation_id` güncellenir).
- Eski oyundan kalan ikincil portlar ve eski birincil port sunucudan koparılıp boşa çıkarılarak (`unassign`) node havuzuna iade edilir (Seçenek A - Temiz Havuz).
- Yeni oyun profilinin tüm alt kuralları (HTTP, Query, RCON vb.) sıfırdan kurularak ortam değişkenleriyle senkronize edilir.

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

