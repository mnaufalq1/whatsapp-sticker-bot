import { execFile } from 'child_process';
import { promisify } from 'util';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { Sticker, StickerTypes } from 'wa-sticker-formatter';

const execFileAsync = promisify(execFile);

/** WhatsApp membatasi stiker: statis <= 100 KB, animasi <= 500 KB. Kita pakai 500 KB sebagai batas aman. */
export const DEFAULT_MAX_STICKER_SIZE = 500 * 1024;

/** Batas default untuk video (stiker animasi WhatsApp idealnya pendek & ringan) */
export const DEFAULT_VIDEO_LIMITS = {
    maxSeconds: 10,
    maxFps: 15,
    maxSize: DEFAULT_MAX_STICKER_SIZE,
    imageQuality: 70
};

/** ffmpeg boleh dioverride lewat env FFMPEG_PATH (dipakai juga oleh fluent-ffmpeg) */
const FFMPEG_PATH = process.env.FFMPEG_PATH || 'ffmpeg';

/** Perkiraan rasio ukuran akhir stiker terhadap WebP mentah dari ffmpeg */
const STICKER_SIZE_RATIO = 1.4;

/**
 * Rangkaian preset dari kualitas terbaik ke paling hemat.
 * Dipakai berurutan sampai ukuran stiker lolos batas maxSize.
 * Kualitas diturunkan lebih dulu supaya durasi & fps video bisa dipertahankan.
 */
const buildPresets = ({ maxSeconds, maxFps }) => [
    { fps: maxFps, seconds: maxSeconds, videoQuality: 60, webpQuality: 80 },
    { fps: maxFps, seconds: maxSeconds, videoQuality: 40, webpQuality: 65 },
    { fps: maxFps, seconds: maxSeconds, videoQuality: 28, webpQuality: 55 },
    { fps: Math.min(maxFps, 12), seconds: Math.min(maxSeconds, 7), videoQuality: 25, webpQuality: 45 },
    { fps: Math.min(maxFps, 10), seconds: Math.min(maxSeconds, 5), videoQuality: 20, webpQuality: 40 }
];

/**
 * Konversi video -> animated WebP memakai ffmpeg.
 *
 * Ini pengganti langkah `videoToGif` milik wa-sticker-formatter yang memakai
 * pengaturan default ffmpeg (fps & resolusi ikut video asli) sehingga hasil
 * stikernya bisa membengkak sampai lewat 1 MB dan tampil rusak di WhatsApp.
 *
 * @param {Buffer} videoBuffer - Isi file video
 * @param {{fps: number, seconds: number, videoQuality: number}} preset - Batas keluaran
 * @returns {Promise<Buffer>} Buffer animated WebP
 */
const videoToAnimatedWebp = async (videoBuffer, preset) => {
    const dir = await mkdtemp(join(tmpdir(), 'sticker-video-'));
    const input = join(dir, 'input');
    const output = join(dir, 'output.webp');

    const args = (encoder) => [
        '-y',
        '-i', input,
        '-an',
        '-c:v', encoder,
        '-vf', `fps=${preset.fps},scale=512:512:force_original_aspect_ratio=decrease`,
        '-loop', '0',
        '-lossless', '0',
        '-q:v', String(preset.videoQuality),
        '-t', String(preset.seconds),
        output
    ];

    try {
        await writeFile(input, videoBuffer);

        // ffmpeg baru: libwebp_anim. ffmpeg lama: libwebp (masih bisa animasi).
        try {
            await execFileAsync(FFMPEG_PATH, args('libwebp_anim'), { timeout: 120000, windowsHide: true });
        } catch (err) {
            await execFileAsync(FFMPEG_PATH, args('libwebp'), { timeout: 120000, windowsHide: true });
        }

        return await readFile(output);
    } finally {
        await rm(dir, { recursive: true, force: true });
    }
};

/**
 * Ubah video menjadi stiker sesuai batas ukuran WhatsApp.
 * Selalu mengembalikan stiker <= maxSize bila salah satu preset berhasil.
 */
const videoToSticker = async (videoBuffer, options) => {
    const { pack, author, type, maxSeconds, maxFps, maxSize } = options;
    const presets = buildPresets({ maxSeconds, maxFps });
    let smallest = null;     // stiker terkecil yang sudah dilengkapi metadata
    let smallestWebp = null; // WebP mentah terkecil (belum dilengkapi metadata)

    for (const preset of presets) {
        const webp = await videoToAnimatedWebp(videoBuffer, preset);
        if (!smallestWebp || webp.length < smallestWebp.length) smallestWebp = webp;

        // Perkirakan ukuran akhirnya dulu; kalau jelas masih kegedean,
        // langsung coba preset berikutnya tanpa encode ulang pakai sharp.
        if (webp.length * STICKER_SIZE_RATIO > maxSize) continue;

        const sticker = await new Sticker(webp, {
            pack,
            author,
            type,
            quality: preset.webpQuality
        }).toBuffer();

        if (sticker.length <= maxSize) return sticker;

        if (!smallest || sticker.length < smallest.length) smallest = sticker;
    }

    if (smallest) return smallest;

    // Semua preset masih kelewat batas: kirim versi paling hemat supaya bot tetap bisa balas.
    return new Sticker(smallestWebp, {
        pack,
        author,
        type,
        quality: presets[presets.length - 1].webpQuality
    }).toBuffer();
};

/**
 * Bikin buffer stiker dari media (gambar atau video).
 *
 * @param {Buffer} mediaBuffer - Isi media dari WhatsApp
 * @param {object} [options] - Opsi stiker
 * @param {string} [options.pack] - Nama pack stiker
 * @param {string} [options.author] - Author stiker
 * @param {boolean} [options.isVideo] - true bila media berupa video
 * @param {string} [options.type] - Tipe stiker (default: FULL)
 * @param {number} [options.quality] - Kualitas WebP untuk gambar
 * @param {number} [options.maxSize] - Batas ukuran stiker dalam byte
 * @param {number} [options.maxSeconds] - Durasi maksimal video (detik)
 * @param {number} [options.maxFps] - FPS maksimal video
 * @returns {Promise<Buffer>} Buffer stiker siap kirim
 */
export const createStickerBuffer = async (mediaBuffer, options = {}) => {
    const {
        pack = '',
        author = '',
        isVideo = false,
        type = StickerTypes.FULL,
        quality = DEFAULT_VIDEO_LIMITS.imageQuality,
        maxSize = DEFAULT_VIDEO_LIMITS.maxSize,
        maxSeconds = DEFAULT_VIDEO_LIMITS.maxSeconds,
        maxFps = DEFAULT_VIDEO_LIMITS.maxFps
    } = options;

    // Gambar: cukup pakai wa-sticker-formatter seperti sebelumnya.
    if (!isVideo) {
        return new Sticker(mediaBuffer, { pack, author, type, quality }).toBuffer();
    }

    try {
        return await videoToSticker(mediaBuffer, { pack, author, type, maxSize, maxSeconds, maxFps });
    } catch (err) {
        // ffmpeg tidak tersedia / gagal: jatuh kembali ke cara lama supaya bot tetap jalan.
        console.error('Gagal memproses video via ffmpeg, pakai cara lama:', err.message || err);
        return new Sticker(mediaBuffer, { pack, author, type, quality }).toBuffer();
    }
};
