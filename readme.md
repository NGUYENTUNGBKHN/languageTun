
# Run local server

python -m http.server 8080
# Or on Windows if 'python' fails:
py -m http.server 8080

ollama launch claude --model kimi-k2.5:cloud

## Project Conventions

- **Code Comments**: All code comments across the codebase MUST always be written in English.

## Supabase setup

Execute the following script in your **Supabase SQL Editor** to create all required tables (`settings`, `vocabulary`, `vocabulary_jp`) with row-level security policies:

```sql
-- 1. Settings Table (for API keys and active model sync)
create table if not exists settings (
  key text primary key,
  value text,
  created_at timestamptz default now()
);
alter table settings enable row level security;
create policy "Allow all" on settings for all using (true) with check (true);

-- 2. English Vocabulary Table
create table if not exists vocabulary (
  id bigint generated always as identity primary key,
  word text not null,
  meaning text,
  example text,
  synonyms text,
  antonyms text,
  created_at timestamptz default now()
);
alter table vocabulary enable row level security;
create policy "Allow all" on vocabulary for all using (true) with check (true);

-- 3. Japanese Vocabulary Table
create table if not exists vocabulary_jp (
  id bigint generated always as identity primary key,
  word text not null,
  meaning text,
  reading text,
  example text,
  type text,
  created_at timestamptz default now()
);
alter table vocabulary_jp enable row level security;
create policy "Allow all" on vocabulary_jp for all using (true) with check (true);
```

## How to Get Free API Keys

LanguageTun supports 3 100% Free AI providers:

### 1. ✨ Google Gemini API (100% Free - Recommended)
1. Visit [Google AI Studio](https://aistudio.google.com/apikey).
2. Sign in with any Google Account (No credit card required).
3. Click **Create API Key**.
4. Copy the key starting with `AIza...` and paste it into LanguageTun **Settings**.

### 2. ⚡ Groq Cloud API (100% Free & Ultra Fast)
1. Visit [Groq Console](https://console.groq.com/keys).
2. Sign up or log in with GitHub/Google.
3. Click **Create API Key**.
4. Copy the key starting with `gsk_...` and paste it into LanguageTun **Settings**.

### 3. 🌐 OpenRouter API (Free Models Access)
1. Visit [OpenRouter Keys](https://openrouter.ai/keys).
2. Sign in with GitHub/Google.
3. Click **Create Key**.
4. Copy the key starting with `sk-or-v1-...` and paste it into LanguageTun **Settings**.

## Project Architecture

The JavaScript codebase is organized into clean, modular files inside the `script/` directory:

- [script/config.js](file:///e:/Project/AppPC/languageTun/script/config.js): Supabase credentials, global constants, state variables, and AI System Prompts.
- [script/supabase.js](file:///e:/Project/AppPC/languageTun/script/supabase.js): Supabase REST API helper and cloud vocabulary/settings sync.
- [script/ai-service.js](file:///e:/Project/AppPC/languageTun/script/ai-service.js): Unified Free AI Model caller (Gemini 3.6 Flash, Groq Llama 3.3 70B, OpenRouter).
- [script/vocabulary.js](file:///e:/Project/AppPC/languageTun/script/vocabulary.js): LocalStorage caching, vocabulary table rendering, CSV and JSON import/export.
- [script/flashcard.js](file:///e:/Project/AppPC/languageTun/script/flashcard.js): English & Japanese Flashcards engine logic, date filters, and keyboard shortcuts.
- [script/dictionary.js](file:///e:/Project/AppPC/languageTun/script/dictionary.js): Chat UI bubbles, metadata parsing, Speech TTS, and lookup event handlers.
- [script/app.js](file:///e:/Project/AppPC/languageTun/script/app.js): Main application entry point, sidebar tree navigation, modals, and initialization sequence.


