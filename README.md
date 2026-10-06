# Bot Sticker WhatsApp (Baileys)

## Deskripsi

Bot WhatsApp yang dibuat menggunakan library `whatsapp-web.js` (fork dari pedroslopez) dengan teknologi modern JavaScript (ESM, Async/Await).

Bot ini mampu membuat stiker langsung dari gambar/video yang dikirim atau di-reply.

### Teknologi yang Digunakan

*   **Runtime**: Node.js 20+
*   **Library WhatsApp**: [whatsapp-web.js](https://github.com/pedroslopez/whatsapp-web.js) (Fork Resmi)
*   **Authentication**: Baileys Multi-File Auth
*   **Web Driver**: Puppeteer (Secara Otomatis di-download)
*   **Sticker Library**: `wa-sticker-formatter`
*   **Video Processing**: `ffmpeg` (wajib terpasang di sistem, dipakai untuk stiker animasi dari video)
*   **Logging**: Pino (Silent Mode by default)
*   **Package Manager**: PNPM

## Instalasi

1.  Pastikan sudah terinstall Node.js 20+, PNPM, dan FFMPEG (cek dengan perintah `ffmpeg -version`)
2.  Install dependensi:

    ```bash
    pnpm install
    ```

## Konfigurasi

Buat file `config/config.json` dengan struktur berikut:

```json
{
  "prefix": "!",
  "name": "Nama Pack Stiker",
  "author": "Author Name",
  "groups": true,
  "sticker": {
    "maxSizeKb": 500,
    "videoMaxSeconds": 10,
    "videoMaxFps": 15,
    "imageQuality": 70
  }
}
```

*   `prefix`: Prefix untuk memanggil perintah (bisa diubah sesuka hati)
*   `name`: Nama pack stiker (author pada metadata stiker)
*   `author`: Author pada metadata stiker
*   `groups`: `true` jika ingin bot aktif di grup, `false` jika hanya Private Chat
*   `sticker`: Pengaturan pembuatan stiker (opsional, ada nilai default kalau tidak diisi)
    *   `maxSizeKb`: Batas ukuran stiker dalam KB. Menurut ketentuan WhatsApp, stiker statis maksimal 100 KB dan stiker animasi maksimal 500 KB, jadi defaultnya 500 KB. Stiker yang lebih besar dari batas ini bisa tampil rusak / gagal terkirim
    *   `videoMaxSeconds`: Durasi maksimal video yang dipakai untuk stiker (detik, WhatsApp membatasi 10 detik)
    *   `videoMaxFps`: Frame rate maksimal stiker animasi
    *   `imageQuality`: Kualitas WebP untuk stiker dari gambar (0-100)

## Batas Ukuran Stiker Video

Stiker animasi WhatsApp dibatasi: **512 x 512 px, maksimal 500 KB, dan durasi maksimal 10 detik** (lihat [ketentuan resmi WhatsApp](https://github.com/WhatsApp/stickers)). Karena itu, sebelum dijadikan stiker, video diproses dulu oleh bot:

1. Video dikonversi ke animated WebP langsung dengan `ffmpeg` (bukan lewat GIF seperti cara lama), dengan resolusi maksimal 512 px, fps dibatasi `videoMaxFps`, dan durasi dibatasi `videoMaxSeconds`.
2. Hasilnya dicek; kalau masih lebih besar dari `maxSizeKb`, bot mengulang proses dengan pengaturan yang lebih hemat (fps, durasi, dan kualitas diturunkan) sampai stiker masuk batas ukuran.

Video dibatasi supaya stiker animasi selalu lolos batas ukuran dan tidak error saat diproses. Untuk hasil terbaik, kirim video pendek (di bawah 10 detik).



## Catatan Terkait Prefix dan Perintah

Perlu diketahui bahwa prefix yang ada di config.json digunakan untuk memanggil perintah (seperti sticker, dll). Jadi, prefix tersebut harus diawali sebelum perintah yang ingin dipanggil. 

Contohnya jika prefix yang ada di config.json adalah "!", maka perintah yang ingin dipanggil harus diawali dengan "!" . 

Contohnya jika prefix yang ada di config.json adalah "?", maka perintah yang ingin dipanggil harus diawali dengan "?" . 

Dan begitu seterusnya. 

Untuk Command nya bisa menggunakan

```bash
(prefix yg ada di config.json)sticker
(prefix yg ada di config.json)s
(prefix yg ada di config.json)stiker
(prefix yg ada di config.json)S
```

Dan bisa dicustom di index.js di urutan ke 62 di bagian 

```javascript
const isStickerCmd = caption.startsWith(`${config.prefix}(disini command nya)`);
```

Contohnya jika ingin command nya "sticker", "s", "stiker", "S" maka:

```javascript
const isStickerCmd = caption.startsWith(`${config.prefix}(sticker|s|stiker|S)`);
```


## Cara Menjalankan Bot

```bash
pnpm start
```

## Cara Menggunakan

### 1. QR Code
Saat pertama kali dijalankan, bot akan menampilkan QR code:

```
Scan QR Code di bawah ini:
```

Scan QR tersebut menggunakan aplikasi WhatsApp di HP Anda.

### 2. Membuat Stiker
Kirim gambar/video ke bot atau reply pesan media dengan perintah.

**Contoh 1: Mengirim gambar/video langsung**

```
(kirim gambar/video)
```
Bot akan langsung mengubahnya menjadi stiker.

**Contoh 2: Reply gambar/video dengan (prefix yg ada di config.json default : !sticker)**

```
(User lain kirim gambar)
Anda reply gambar tersebut:
(prefix yg ada di config.json)sticker
```
Bot akan mengubah gambar yang di-reply menjadi stiker.
