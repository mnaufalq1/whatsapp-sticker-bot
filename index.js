import { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadMediaMessage 
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { readFileSync, existsSync } from 'fs';
import pino from 'pino';

const config = JSON.parse(readFileSync('./config/config.json', 'utf-8'));

// ============================================================
// MULTI-DEVICE (TANPA DATABASE)
// ------------------------------------------------------------
// Sesi tiap device disimpan di folder terpisah: sessions/<nama>/
// sehingga tiap nomor WhatsApp punya QR + kredensial sendiri.
// Daftar device bisa diatur di config/devices.json, contoh:
//   ["device1", "device2", "device3"]
// Jika file tidak ada, bot tetap jalan dengan 1 device default "main".
// CATATAN: 1 device = 1 nomor WhatsApp. Jangan pakai nomor yang sama
// di 2 device sekaligus karena akan saling "kick".
// ============================================================
let devices = ['main'];
const devicesFile = './config/devices.json';
if (existsSync(devicesFile)) {
    const loaded = JSON.parse(readFileSync(devicesFile, 'utf-8'));
    if (Array.isArray(loaded) && loaded.length > 0) {
        devices = loaded.map(String);
    }
}

const activeSockets = new Map();

async function startBot(sessionName) {
    const { state, saveCreds } = await useMultiFileAuthState(`sessions/${sessionName}`);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    activeSockets.set(sessionName, sock);

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`\n[${sessionName}] Scan QR Code di bawah ini:`);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${sessionName}] Koneksi terputus. Reconnect?`, shouldReconnect);
            if (shouldReconnect) {
                startBot(sessionName);
            }
        } else if (connection === 'open') {
            console.log(`[${sessionName}] Bot WhatsApp (Baileys) Siap!`);
        }
    });

    sock.ev.on('messages.upsert', async ({ messages, type }) => {
        if (type !== 'notify') return;

        for (const msg of messages) {
            try {
                if (!msg.message) continue;

                const from = msg.key.remoteJid;
                const isGroup = from.endsWith('@g.us');

                if (isGroup && !config.groups) continue;

                // Ambil teks caption/pesan
                const caption = msg.message?.imageMessage?.caption || 
                                msg.message?.videoMessage?.caption || 
                                msg.message?.conversation || 
                                msg.message?.extendedTextMessage?.text || '';

                const isStickerCmd = caption.startsWith(`${config.prefix}sticker`) || caption.startsWith(`${config.prefix}s`) || caption.startsWith(`${config.prefix}stiker`) || caption.startsWith(`${config.prefix}S`);

                // Cek pesan reply (quoted)
                const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;

                // Tentukan objek media mana yang akan di-download
                let targetMediaMessage = null;

                if (msg.message?.imageMessage || msg.message?.videoMessage) {
                    // 1. Kirim gambar/video langsung
                    targetMediaMessage = msg;
                } else if (quotedMessage?.imageMessage || quotedMessage?.videoMessage) {
                    // 2. Reply gambar/video orang lain pake !sticker
                    targetMediaMessage = {
                        key: msg.key,
                        message: quotedMessage
                    };
                }

                // Proses pembuatan stiker jika media beserta command yg valid ditemukan
                if (isStickerCmd && targetMediaMessage) {
                    console.log('Menerima request stiker...');

                    const buffer = await downloadMediaMessage(
                        targetMediaMessage,
                        'buffer',
                        {},
                        { logger: pino({ level: 'silent' }) }
                    );

                    const sticker = new Sticker(buffer, {
                        pack: config.name,
                        author: config.author,
                        type: StickerTypes.FULL,
                        quality: 70
                    });

                    const stickerBuffer = await sticker.toBuffer();

                    await sock.sendMessage(from, { sticker: stickerBuffer }, { quoted: msg });
                    console.log('Stiker berhasil dikirim!');
                }

            } catch (err) {
                console.error('Error memproses pesan:', err.message || err);
            }
        }
    });
}

// Mulai semua device (1 device = 1 nomor WhatsApp)
console.log(`Memulai bot untuk ${devices.length} device:`, devices.join(', '));
devices.forEach((deviceName) => startBot(deviceName));