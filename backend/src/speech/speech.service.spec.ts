import { Test, TestingModule } from '@nestjs/testing';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { SpeechService } from './speech.service.js';

describe('SpeechService', () => {
  let service: SpeechService;
  let cacheDirectory: string;
  let originalCacheDirectory: string | undefined;

  beforeEach(async () => {
    originalCacheDirectory = process.env.SPEECH_AUDIO_CACHE_DIR;
    cacheDirectory = join(tmpdir(), `spelling-audio-${randomUUID()}`);
    process.env.SPEECH_AUDIO_CACHE_DIR = cacheDirectory;
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpeechService],
    }).compile();

    service = module.get<SpeechService>(SpeechService);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    await rm(cacheDirectory, { recursive: true, force: true });
    if (originalCacheDirectory === undefined) delete process.env.SPEECH_AUDIO_CACHE_DIR;
    else process.env.SPEECH_AUDIO_CACHE_DIR = originalCacheDirectory;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('reuses cached audio for identical text and serves it by cache key', async () => {
    const audio = Buffer.from('wav-data');
    const generate = vi.spyOn(service, 'textToSpeech').mockResolvedValue({ audio, contentType: 'audio/wav' });

    const first = await service.audioForWord('apple');
    const second = await service.audioForWord('apple');
    const cacheKey = first.audioUrl.split('/').at(-1)!;

    expect(second).toEqual(first);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(await service.cachedAudio(cacheKey)).toEqual(audio);
  });

  it('uses valid HTTPS word audio without calling Python', async () => {
    const generate = vi.spyOn(service, 'textToSpeech');

    await expect(service.audioForWord('apple', 'https://cdn.example.test/apple.wav'))
      .resolves.toEqual({ audioUrl: 'https://cdn.example.test/apple.wav' });
    expect(generate).not.toHaveBeenCalled();
  });

  it('reports a temporary Python connection failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    await expect(service.textToSpeech('apple')).rejects.toThrow('Could not connect to the Python speech service');
  });
});
