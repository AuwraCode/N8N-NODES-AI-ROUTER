/**
 * Task Detector — heuristic classification of AI task type from prompt text.
 *
 * Purely local: no external API calls, no async operations.
 * Uses weighted regex pattern matching across 8 task categories.
 *
 * The task_hint node parameter always overrides these results.
 */

import type { TaskType } from './modelRegistry';

/** Result of task detection. */
export interface TaskDetectionResult {
  /** The most likely task type. */
  primaryTask: TaskType;
  /**
   * Confidence score 0–1.
   * Computed as the gap between the top and second-place scores plus
   * a bonus for the absolute top score (so strong single-category prompts
   * score higher than ambiguous ones).
   */
  confidence: number;
  /** Normalized score (0–1) for each task type. */
  scores: Record<TaskType, number>;
}

interface RuleSet {
  /** Each matching pattern adds `weight` to the raw score. */
  patterns: RegExp[];
  /** Score added per pattern match (multiplied by number of matches). */
  weight: number;
}

const RULES: Record<TaskType, RuleSet> = {
  coding: {
    weight: 2.0,
    patterns: [
      /\b(function|def |class |import |require\(|const |let |var |async |await )\b/,
      /\b(debug|refactor|implement|unit test|fix( the)? bug|code review|write a (script|function|class|method|test))\b/i,
      /```[a-z]*/,
      /\b(typescript|javascript|python|rust|go|golang|java|c\+\+|c#|sql|bash|shell|ruby|php|swift|kotlin)\b/i,
      /\b(npm|pip|cargo|gradle|maven|makefile|webpack|vite|eslint|prettier)\b/i,
      /\.(ts|js|py|rs|go|java|cpp|cs|sql|sh|rb|php)\b/,
      /\b(algorithm|data structure|recursion|api endpoint|rest api|graphql|database query|regex|regular expression)\b/i,
    ],
  },
  vision: {
    weight: 3.0,
    patterns: [
      /https?:\/\/\S+\.(png|jpg|jpeg|gif|webp|svg)/i,
      /data:image\/(png|jpeg|gif|webp);base64,/i,
      /\b(describe|analyze|what('s| is) in|read( the)?|extract( text)? from|identify|recognize)\b.{0,30}\b(image|photo|screenshot|diagram|chart|picture|figure)\b/i,
      /\b(ocr|image recognition|computer vision|visual( content)?|look at (this|the))\b/i,
    ],
  },
  embeddings: {
    weight: 3.0,
    patterns: [
      /\b(embed(ding)?s?|vector(ize)?|semantic search|cosine similarity|nearest neighbor)\b/i,
      /\b(encode (this|the) text|generate (an? )?embedding|text-to-vector)\b/i,
      /\b(rag|retrieval.augmented|vector (store|database|index|search))\b/i,
    ],
  },
  summarization: {
    weight: 1.5,
    patterns: [
      /\b(summar(ize|y|ies)|tl;?dr|brief(ly)?|condense|shorten|key (points?|takeaways?|insights?)|main (points?|ideas?))\b/i,
      /\b(in \d+ (words?|sentences?|bullet points?|bullets?|paragraphs?)|executive summary|abstract)\b/i,
      /\b(give me (the )?(gist|overview|highlights)|what('s| is) the (main |key )?point)\b/i,
    ],
  },
  classification: {
    weight: 1.5,
    patterns: [
      /\b(classif(y|ication)|categori[sz](e|ation)|label(ing)?|tag(ging)?)\b/i,
      /\b(is this (a |an |the )?(spam|positive|negative|relevant|toxic|safe)|detect (spam|sentiment|language|intent|emotion))\b/i,
      /\b(true or false|yes or no|positive or negative|sentiment analysis|binary classification)\b/i,
      /\b(which (category|class|group|type|bucket) does|belongs? to)\b/i,
    ],
  },
  writing: {
    weight: 1.2,
    patterns: [
      /\b(write|draft|compose|create|generate)\b.{0,40}\b(email|blog (post)?|article|essay|story|poem|letter|post|ad copy|description|bio|caption|tweet|thread|press release|cover letter|resume|report)\b/i,
      /\b(creative writing|marketing copy|product description|social media post|content (for|about))\b/i,
      /\b(rewrite|paraphrase|improve|polish|edit|proofread|rephrase|make (this|it) (sound|more|better))\b/i,
      /\b(in (a |the )?(professional|casual|formal|friendly|persuasive|engaging) (tone|style|voice))\b/i,
    ],
  },
  analysis: {
    weight: 1.3,
    patterns: [
      /\b(analyz[es]?|analyse|evaluate|assess|examine|investigate|deep.?dive|break( it)? down)\b/i,
      /\b(compare (and contrast)?|contrast|pros? and cons?|tradeoffs?|advantages? and disadvantages?|implications?)\b/i,
      /\b(explain (why|how|what causes?|the reason)|root cause|what (does|do) .{1,30} (mean|represent|indicate))\b/i,
      /\b(data analysis|statistical|trend(s)?|insights? (from|about)|find patterns?)\b/i,
    ],
  },
  chat: {
    weight: 0.5,
    patterns: [
      /\b(hi+|hello|hey|howdy|greetings|what'?s up|how are you|nice to meet|good (morning|afternoon|evening))\b/i,
      /\b(thanks?|thank you|cheers|appreciated|you'?re (right|correct|awesome|great))\b/i,
      /\?$/,
    ],
  },
};

/**
 * Classify the task type of a prompt using heuristic keyword matching.
 *
 * @param prompt - The user's input text.
 * @returns Detection result with primary task, confidence, and per-task scores.
 */
export function detectTask(prompt: string): TaskDetectionResult {
  const rawScores: Record<TaskType, number> = {
    coding: 0,
    vision: 0,
    embeddings: 0,
    summarization: 0,
    classification: 0,
    writing: 0,
    analysis: 0,
    chat: 0,
  };

  for (const [task, ruleset] of Object.entries(RULES) as Array<[TaskType, RuleSet]>) {
    for (const pattern of ruleset.patterns) {
      const matches = prompt.match(pattern);
      if (matches) {
        rawScores[task] += ruleset.weight * matches.length;
      }
    }
  }

  const total = Object.values(rawScores).reduce((sum, v) => sum + v, 0);

  const scores = {} as Record<TaskType, number>;
  if (total === 0) {
    // No signals detected — default to chat
    for (const task of Object.keys(rawScores) as TaskType[]) {
      scores[task] = 0;
    }
    scores.chat = 1.0;
  } else {
    for (const task of Object.keys(rawScores) as TaskType[]) {
      scores[task] = rawScores[task] / total;
    }
  }

  const entries = (Object.entries(scores) as Array<[TaskType, number]>).sort(
    (a, b) => b[1] - a[1],
  );

  const primaryTask = entries[0][0];
  const topScore = entries[0][1];
  const secondScore = entries[1]?.[1] ?? 0;

  // Confidence = weighted gap between top and runner-up
  const confidence = Math.min(1, topScore - secondScore + topScore * 0.5);

  return { primaryTask, confidence, scores };
}
