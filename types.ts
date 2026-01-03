
export enum AppMode {
  IDLE = 'IDLE',
  DATASET = 'DATASET'
}

export type Resolution = '1K' | '2K' | '4K';

export type DatasetGroup = 'portrait' | 'upper' | 'full';

export interface DatasetPose {
  id: string;
  label: string;
  group: DatasetGroup;
  description: string;
}

export interface GeneratedImage {
  id: string;
  url: string;
  prompt: string;
  timestamp: number;
  group?: string;
}

export interface CharacterAdjustments {
  eyeColor: string;
  bodyBuild: string;
  chestSize: string;
  hipSize: string;
}

export interface GenerationTask {
  status: 'pending' | 'generating' | 'completed' | 'failed' | 'stopped';
  total: number;
  current: number;
  images: GeneratedImage[];
  error?: string;
}
