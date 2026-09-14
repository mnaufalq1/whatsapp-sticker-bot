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
*   **Logging**: Pino (Silent Mode by default)
*   **Package Manager**: PNPM

## Instalasi

1.  Pastikan sudah terinstall Node.js 20+ dan PNPM
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
  "groups": true
}
```

*   `prefix`: Prefix untuk memanggil perintah (bisa diubah sesuka hati)
*   `name`: Nama pack stiker (author pada metadata stiker)
*   `author`: Author pada metadata stiker
*   `groups`: `true` jika ingin bot aktif di grup, `false` jika hanya Private Chat

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
