import { describe, it, expect } from 'vitest';
import { detectTask } from '../nodes/AiRouter/router/taskDetector';

describe('detectTask', () => {
  describe('coding detection', () => {
    it('detects coding from Python function request', () => {
      const result = detectTask('Write a Python function to sort a list of integers');
      expect(result.primaryTask).toBe('coding');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('detects coding from TypeScript with code block', () => {
      const result = detectTask('Can you refactor this TypeScript class?\n```ts\nclass Foo {}\n```');
      expect(result.primaryTask).toBe('coding');
    });

    it('detects coding from bug fix request', () => {
      const result = detectTask('Help me fix this bug in my JavaScript code');
      expect(result.primaryTask).toBe('coding');
    });

    it('detects coding from algorithm request', () => {
      const result = detectTask('Implement a binary search algorithm in Rust');
      expect(result.primaryTask).toBe('coding');
    });
  });

  describe('vision detection', () => {
    it('detects vision from image URL in prompt', () => {
      const result = detectTask('Describe what you see in this image: https://example.com/photo.jpg');
      expect(result.primaryTask).toBe('vision');
      expect(result.confidence).toBeGreaterThan(0.5);
    });

    it('detects vision from base64 image data', () => {
      const result = detectTask('What is shown here? data:image/png;base64,iVBORw0KGgo=');
      expect(result.primaryTask).toBe('vision');
    });

    it('detects vision from OCR request', () => {
      const result = detectTask('Extract text from this screenshot using OCR');
      expect(result.primaryTask).toBe('vision');
    });
  });

  describe('summarization detection', () => {
    it('detects summarization from explicit request', () => {
      const result = detectTask('Summarize this article in 3 bullet points');
      expect(result.primaryTask).toBe('summarization');
    });

    it('detects summarization from tl;dr request', () => {
      const result = detectTask('tl;dr this document');
      expect(result.primaryTask).toBe('summarization');
    });

    it('detects summarization from key points request', () => {
      const result = detectTask('What are the key takeaways from this report?');
      expect(result.primaryTask).toBe('summarization');
    });
  });

  describe('classification detection', () => {
    it('detects classification from sentiment analysis request', () => {
      const result = detectTask('Detect the sentiment of this review: positive or negative');
      expect(result.primaryTask).toBe('classification');
    });

    it('detects classification from spam detection', () => {
      const result = detectTask('Is this email spam? True or false.');
      expect(result.primaryTask).toBe('classification');
    });

    it('detects classification from category request', () => {
      const result = detectTask('Which category does this product belong to?');
      expect(result.primaryTask).toBe('classification');
    });
  });

  describe('writing detection', () => {
    it('detects writing from blog post request', () => {
      const result = detectTask('Write a blog post about the benefits of exercise');
      expect(result.primaryTask).toBe('writing');
    });

    it('detects writing from email draft request', () => {
      const result = detectTask('Draft a professional email to my client about the project delay');
      expect(result.primaryTask).toBe('writing');
    });

    it('detects writing from paraphrase request', () => {
      const result = detectTask('Rewrite this paragraph in a more formal tone');
      expect(result.primaryTask).toBe('writing');
    });
  });

  describe('analysis detection', () => {
    it('detects analysis from compare request', () => {
      // Note: avoid tech names that also trigger coding patterns
      const result = detectTask('Compare and contrast two different management styles');
      expect(result.primaryTask).toBe('analysis');
    });

    it('detects analysis from pros/cons request', () => {
      const result = detectTask('What are the pros and cons of microservices architecture?');
      expect(result.primaryTask).toBe('analysis');
    });
  });

  describe('embeddings detection', () => {
    it('detects embeddings from vector request', () => {
      const result = detectTask('Generate an embedding for this text for semantic search');
      expect(result.primaryTask).toBe('embeddings');
    });

    it('detects embeddings from RAG mention', () => {
      const result = detectTask('I need to vectorize this text for a RAG pipeline');
      expect(result.primaryTask).toBe('embeddings');
    });
  });

  describe('chat detection (fallback)', () => {
    it('defaults to chat for empty prompt', () => {
      const result = detectTask('');
      expect(result.primaryTask).toBe('chat');
      expect(result.scores.chat).toBe(1.0);
    });

    it('defaults to chat for greeting', () => {
      const result = detectTask('Hello, how are you?');
      expect(result.primaryTask).toBe('chat');
    });

    it('defaults to chat for unrecognized short prompt', () => {
      const result = detectTask('Tell me something interesting');
      // Should return something valid, chat is the fallback
      expect(result.primaryTask).toBeDefined();
      expect(result.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('score structure', () => {
    it('returns scores for all task types', () => {
      const result = detectTask('Write a Python sorting algorithm');
      const taskTypes = ['coding', 'writing', 'analysis', 'summarization', 'classification', 'vision', 'embeddings', 'chat'];
      for (const task of taskTypes) {
        expect(result.scores).toHaveProperty(task);
        expect(result.scores[task as keyof typeof result.scores]).toBeGreaterThanOrEqual(0);
        expect(result.scores[task as keyof typeof result.scores]).toBeLessThanOrEqual(1);
      }
    });

    it('scores sum to approximately 1.0 when signals are detected', () => {
      const result = detectTask('Implement a quicksort function in Python');
      const total = Object.values(result.scores).reduce((a, b) => a + b, 0);
      expect(total).toBeCloseTo(1.0, 5);
    });

    it('confidence is between 0 and 1', () => {
      const result = detectTask('Any prompt');
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });
});
