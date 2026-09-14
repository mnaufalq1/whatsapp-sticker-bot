import { 
    makeWASocket, 
    useMultiFileAuthState, 
    DisconnectReason, 
    downloadMediaMessage 
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { readFileSync } from 'fs';
import pino from 'pino';

const config = JSON.parse(readFileSync('./config/config.json', 'utf-8'));

async function startBot() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log('\nScan QR Code di bawah ini:');
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log('Koneksi terputus. Reconnect?', shouldReconnect);
            if (shouldReconnect) {
                startBot();
            }
        } else if (connection === 'open') {
            console.log('Bot WhatsApp (Baileys) Siap!');
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

                // Proses pembuatan stiker jika media valid ditemukan
                if (targetMediaMessage && (isStickerCmd || msg.message?.imageMessage || msg.message?.videoMessage)) {
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

startBot();