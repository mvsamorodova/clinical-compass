export const EMOTION_LABELS=['angry','sad','neutral','positive'] as const;
export const EMOTION_NAMES={angry:'Гнев',sad:'Грусть',neutral:'Нейтральный тон',positive:'Позитивный тон'};
export const EMOTION_MODEL_VERSION='gigaam-emo-matmul-int8-8fad2a2c-v1';
export type EmotionScores=Record<typeof EMOTION_LABELS[number],number>;
