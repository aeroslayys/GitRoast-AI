// Stable public interface for the audit engine. Subsystems remain independently testable.
export { validUsername, ApiError, collectProfile } from './core/github.js';
export { scoreProfile } from './core/scoring.js';
export { fallbackFeedback, requestGeminiModel, aiFeedback } from './core/feedback.js';
