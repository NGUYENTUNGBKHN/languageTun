// ═══════════════════════════════════════════════════════════════
// CONFIG & GLOBAL CONSTANTS
// ═══════════════════════════════════════════════════════════════

/** Supabase Project Configuration */
const SUPABASE_URL = 'https://rknbxrqlzgjmiylqihno.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJrbmJ4cnFsemdqbWl5bHFpaG5vIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ3OTQ0NDEsImV4cCI6MjA5MDM3MDQ0MX0.BzkXWgEKYv5MdMwwS3o1Ht9QY5syzITNoobK8nnHv9g';

/** Application State */
let currentModel = 'gemini';
let vocabLog = [];
let vocabLogJP = [];
const histories = { translate: [], japanese: [] };
const STORAGE_KEY = 'linguaagent_local';
let jpCloudAvailable = true;
let jpCloudWarningShown = false;
let adminUnlocked = false;
const ADMIN_PASS = '123456';

/** API Keys State (Only 100% Free Providers) */
let apiKeys = { gemini: '', groq: '', openrouter: '' };

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPTS FOR AI DICTIONARIES
// ─────────────────────────────────────────────────────────────

/** English - Vietnamese Dictionary System Prompt */
const DICT_SYSTEM = `You are a precise English-Vietnamese Dictionary assistant for Vietnamese learners.

CRITICAL FORMAT RULES:
- DO NOT start with conversational greetings (e.g. "Chào bạn!", "Dưới đây là...").
- Start DIRECTLY with the dictionary word header.
- Provide: IPA pronunciation, Part of Speech, Vietnamese meaning, 2-3 English example sentences with Vietnamese translations, Synonyms/Antonyms.

MANDATORY ENDING METADATA:
At the absolute end of your response, output EXACTLY these 4 lines with NO markdown backticks or bolding around them:
[VOCAB:English_word:short_Vietnamese_meaning]
[EXAMPLE:one best English example sentence]
[SYN:synonym 1, synonym 2]
[ANT:antonym 1, antonym 2]

If no synonyms/antonyms exist, leave them empty: [SYN:] or [ANT:]
Respond in Vietnamese, example sentences in English.`;

/** Japanese - Vietnamese Dictionary System Prompt */
const JP_SYSTEM = `Bạn là trợ lý từ điển Nhật - Việt chính xác cho người Việt Nam.

QUY TẮC ĐỊNH DẠNG BẮT BUỘC:
- KHÔNG dùng câu chào hỏi hay xã giao ("Chào bạn!", "Dưới đây là...").
- Bắt đầu TRỰC TIẾP bằng tiêu đề từ vựng.
- Cung cấp: Cách đọc Hiragana + Romaji, Từ loại/Nhóm động từ, Nghĩa tiếng Việt, 2-3 câu ví dụ tiếng Nhật có dịch tiếng Việt.

METADATA BẮT BUỘC Ở CUỐI:
Ở cuối bài trả lời BẮT BUỘC có đúng 4 dòng sau, KHÔNG dùng markdown hay backticks:
[VOCAB_JP:từ_tiếng_Nhật:nghĩa_tiếng_Việt_ngắn]
[READING:hiragana/romaji]
[EXAMPLE_JP:câu_ví_dụ_tiếng_Nhật]
[TYPE:loại_từ]

Trả lời bằng tiếng Việt, câu ví dụ bằng tiếng Nhật.`;
