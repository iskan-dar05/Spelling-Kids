
import {
  BadGatewayException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const SPEECH_AI_URL =
  process.env.SPEECH_AI_URL ?? 'http://127.0.0.1:8001';

const SPEECH_API_KEY = process.env.SPEECH_API_KEY;
const AUDIO_CACHE_DIR = '.cache/speech';
const TTS_MODEL = process.env.TTS_MODEL_NAME ?? 'tts_models/multilingual/multi-dataset/xtts_v2';
const TTS_VOICE = process.env.TTS_SPEAKER ?? 'Ana Florence';

@Injectable()
export class SpeechService {
  private async forwardError(response: Response): Promise<never> {
    const message = await response.text().catch(() => '');

    if (response.status === 503) {
      throw new ServiceUnavailableException(
        'The speech AI service is unavailable',
      );
    }

    throw new BadGatewayException(
      `Speech AI error (${response.status}): ${message.slice(0, 300)}`,
    );
  }

  async textToSpeech(text: string, language = 'en') {
    const form = new FormData();

    form.append('text', text);
    form.append('language', language);

    let response: Response;

    try {
      response = await fetch(`${SPEECH_AI_URL}/tts`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not connect to the Python speech service',
      );
    }

    if (!response.ok) {
      return this.forwardError(response);
    }

    const audio = Buffer.from(await response.arrayBuffer());

    return {
      audio,
      contentType: response.headers.get('content-type') ?? 'audio/wav',
    };
  }

  async audioForWord(text: string, existingAudioUrl?: string | null) {
    if (existingAudioUrl) {
      try {
        const parsed = new URL(existingAudioUrl);
        if (parsed.protocol === 'https:') return { audioUrl: existingAudioUrl };
      } catch {
        // Invalid stored URLs fall back to generated speech.
      }
    }

    const cacheKey = createHash('sha256')
      .update(JSON.stringify({ text, language: 'en', voice: TTS_VOICE, model: TTS_MODEL, generation: { speed: 1 } }))
      .digest('hex');
    const cacheDirectory = process.env.SPEECH_AUDIO_CACHE_DIR ?? AUDIO_CACHE_DIR;
    const filePath = join(cacheDirectory, `${cacheKey}.wav`);

    try {
      await access(filePath);
    } catch {
      const result = await this.textToSpeech(text, 'en');
      await mkdir(cacheDirectory, { recursive: true });
      const tempPath = `${filePath}.${randomUUID()}.tmp`;
      await writeFile(tempPath, result.audio);
      try {
        await rename(tempPath, filePath);
      } catch (error) {
        await unlink(tempPath).catch(() => undefined);
        try {
          await readFile(filePath);
        } catch {
          throw error;
        }
      }
    }

    return { audioUrl: `/api/speech/audio/${cacheKey}` };
  }

  async cachedAudio(cacheKey: string) {
    if (!/^[a-f0-9]{64}$/.test(cacheKey)) throw new NotFoundException('Audio not found');
    try {
      return await readFile(join(process.env.SPEECH_AUDIO_CACHE_DIR ?? AUDIO_CACHE_DIR, `${cacheKey}.wav`));
    } catch {
      throw new NotFoundException('Audio not found');
    }
  }

  async speechToText(
    file: Express.Multer.File,
    language = 'en',
  ) {
    const form = new FormData();

    const audioBlob = new Blob([new Uint8Array(file.buffer)], {
      type: file.mimetype || 'application/octet-stream',
    });

    form.append('audio', audioBlob, file.originalname || 'recording.wav');
    form.append('language', language);

    let response: Response;

    try {
      response = await fetch(`${SPEECH_AI_URL}/stt`, {
        method: 'POST',
        headers: this.headers(),
        body: form,
        signal: AbortSignal.timeout(120_000),
      });
    } catch {
      throw new ServiceUnavailableException(
        'Could not connect to the Python speech service',
      );
    }

    if (!response.ok) {
      return this.forwardError(response);
    }

    return response.json();
  }

  private headers(): Record<string, string> {
    return SPEECH_API_KEY
      ? { 'x-api-key': SPEECH_API_KEY }
      : {};
  }
}
