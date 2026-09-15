import { 
    makeWASocket, 
    DisconnectReason, 
    downloadMediaMessage,
    BufferJSON,
    initAuthCreds,
    proto
} from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';
import { readFileSync } from 'fs';
import pino from 'pino';
import express from 'express';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ quiet: true });

const { Pool } = pg;

// 1. Web server dummy untuk Health Check di Render
const app = express();
const PORT = process.env.PORT || 8000;

app.get('/', (req, res) => {
    res.send('Bot WhatsApp Baileys Status: OK');
});

app.listen(PORT, () => {
    console.log(`Web server listening on port ${PORT}`);
});

// Load Config
const config = JSON.parse(readFileSync('./config/config.json', 'utf-8'));

// 2. Koneksi Database Postgres/Supabase
if (!process.env.DATABASE_URL) {
    console.error('ERROR: DATABASE_URL tidak ditemukan.');
    console.error('Buat file .env (contoh di .env.example) atau set environment variable DATABASE_URL, lalu jalankan lewat `pnpm start`.');
    process.exit(1);
}
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000
});

// 3. Adapter Auth State khusus Postgres (Biar Sesi Permanen)
const usePostgresAuthState = async (sessionId = 'main') => {
    // Buat tabel otomatis jika belum ada di database
    await pool.query(`
        CREATE TABLE IF NOT EXISTS wa_sessions (
            id VARCHAR(255) PRIMARY KEY,
            data TEXT NOT NULL
        );
    `);

    // Namespace per device: device "main" = gaya lama (backward compatible),
    // device lain: semua ID disimpan dengan prefix "<nama>:"
    const ns = (sessionId && sessionId !== 'main') ? `${sessionId}:` : '';

    const writeData = async (data, id) => {
        const serialized = JSON.stringify(data, BufferJSON.replacer);
        await pool.query(
            `INSERT INTO wa_sessions (id, data) VALUES ($1, $2)
             ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data`,
            [ns + id, serialized]
        );
    };

    const readData = async (id) => {
        try {
            const res = await pool.query(`SELECT data FROM wa_sessions WHERE id = $1`, [ns + id]);
            if (res.rows.length > 0) {
                return JSON.parse(res.rows[0].data, BufferJSON.reviver);
            }
        } catch (error) {
            return null;
        }
        return null;
    };

    const removeData = async (id) => {
        await pool.query(`DELETE FROM wa_sessions WHERE id = $1`, [ns + id]);
    };

    const creds = (await readData('creds')) || initAuthCreds();

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            tasks.push(value ? writeData(value, key) : removeData(key));
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};

// 4. Fungsi Utama Bot
async function startBot(deviceName = 'main') {
    const { state, saveCreds } = await usePostgresAuthState(deviceName);

    const sock = makeWASocket({
        auth: state,
        printQRInTerminal: false,
        logger: pino({ level: 'silent' })
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect, qr } = update;

        if (qr) {
            console.log(`\n[${deviceName}] Scan QR Code di bawah ini:`);
            qrcode.generate(qr, { small: true });
        }

        if (connection === 'close') {
            const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
            console.log(`[${deviceName}] Koneksi terputus. Reconnect?`, shouldReconnect);
            if (shouldReconnect) {
                startBot(deviceName);
            }
        } else if (connection === 'open') {
            console.log(`[${deviceName}] Bot WhatsApp (Baileys) Siap!`);
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

                const caption = msg.message?.imageMessage?.caption || 
                                msg.message?.videoMessage?.caption || 
                                msg.message?.conversation || 
                                msg.message?.extendedTextMessage?.text || '';

                const isStickerCmd = caption.startsWith(`${config.prefix}sticker`) || 
                                     caption.startsWith(`${config.prefix}s`) || 
                                     caption.startsWith(`${config.prefix}stiker`) || 
                                     caption.startsWith(`${config.prefix}S`);

                const quotedMessage = msg.message?.extendedTextMessage?.contextInfo?.quotedMessage;
                let targetMediaMessage = null;

                if (msg.message?.imageMessage || msg.message?.videoMessage) {
                    targetMediaMessage = msg;
                } else if (quotedMessage?.imageMessage || quotedMessage?.videoMessage) {
                    targetMediaMessage = {
                        key: msg.key,
                        message: quotedMessage
                    };
                }

                if (isStickerCmd && targetMediaMessage) {
                    console.log(`[${deviceName}] Menerima request stiker...`);

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
                    console.log(`[${deviceName}] Stiker berhasil dikirim!`);
                }

            } catch (err) {
                console.error(`[${deviceName}] Error memproses pesan:`, err.message || err);
            }
        }
    });
}

// 5. Start semua device (multi-device): 1 QR = 1 nomor.
//    Tambah nama device di config.json > "devices" biar generate QR baru untuk nomor lain.
const devices = (Array.isArray(config.devices) && config.devices.length > 0)
    ? config.devices.map(d => String(d).trim()).filter(Boolean)
    : ['main'];

for (const device of devices) {
    startBot(device).catch((err) => {
        console.error(`[${device}] Bot gagal dijalankan:`, err?.message || err);
        process.exit(1);
    });
}