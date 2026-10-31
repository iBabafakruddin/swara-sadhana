import { ComparisonService } from '@/application/ComparisonService';
import type { AudioRecorderFactory, PitchAnalyzer, TonePlayer } from '@/application/ports';
import { PracticeService } from '@/application/PracticeService';
import { RecordingService } from '@/application/RecordingService';
import { ReferenceService } from '@/application/ReferenceService';
import { appConfig, type AppConfig } from '@/config/appConfig';
import { HtmlAudioInspector } from '@/infrastructure/audio/HtmlAudioInspector';
import { MediaRecorderAudioRecorder } from '@/infrastructure/audio/MediaRecorderAudioRecorder';
import { OscillatorTonePlayer } from '@/infrastructure/audio/OscillatorTonePlayer';
import { WebAudioPitchAnalyzer } from '@/infrastructure/audio/WebAudioPitchAnalyzer';
import { BrowserFileExporter } from '@/infrastructure/export/BrowserFileExporter';
import { IndexedDbRecordingRepository } from '@/infrastructure/storage/IndexedDbRecordingRepository';
import { IndexedDbReferenceRepository } from '@/infrastructure/storage/IndexedDbReferenceRepository';
import { cryptoIdGenerator, systemClock } from '@/infrastructure/system';

export interface AppServices {
  config: AppConfig;
  recordings: RecordingService;
  references: ReferenceService;
  comparisons: ComparisonService;
  practice: PracticeService;
  tonePlayer: TonePlayer;
  recorderSupported: boolean;
  createRecorder: AudioRecorderFactory;
  pitchAnalyzer: PitchAnalyzer;
}

/**
 * Composition root: the only place that picks concrete implementations.
 * To add a backend later, write e.g. an HttpRecordingRepository and swap it in here.
 */
export function createAppServices(config: AppConfig = appConfig): AppServices {
  const recordingRepository = new IndexedDbRecordingRepository(config.storage.databaseName);
  const referenceRepository = new IndexedDbReferenceRepository(config.storage.databaseName);

  const recordings = new RecordingService(
    {
      repository: recordingRepository,
      exporter: new BrowserFileExporter(),
      clock: systemClock,
      ids: cryptoIdGenerator,
    },
    { retentionMs: config.retentionMs },
  );

  const references = new ReferenceService(
    {
      repository: referenceRepository,
      inspector: new HtmlAudioInspector(),
      clock: systemClock,
      ids: cryptoIdGenerator,
    },
    { maxUploadBytes: config.references.maxUploadBytes },
  );

  const comparisons = new ComparisonService(
    {
      references: referenceRepository,
      recordings: recordingRepository,
      analyzer: new WebAudioPitchAnalyzer({ ...config.pitch, hopSize: config.comparison.hopSize }),
    },
    config.comparison,
  );

  const practice = new PracticeService(
    { comparisons, clock: systemClock, ids: cryptoIdGenerator },
    { passScore: config.comparison.scoring.passScore, passesInARow: config.practice.passesInARow },
  );

  return {
    config,
    recordings,
    references,
    comparisons,
    practice,
    tonePlayer: new OscillatorTonePlayer(),
    recorderSupported: MediaRecorderAudioRecorder.isSupported(),
    createRecorder: () => new MediaRecorderAudioRecorder(config.pitch),
    pitchAnalyzer: new WebAudioPitchAnalyzer({ ...config.pitch }),
  };
}
