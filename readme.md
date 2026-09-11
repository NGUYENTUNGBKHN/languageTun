
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

## How to Get API Keys (Guide)

LanguageTun supports 5 AI providers. Here is how to get an API key for each platform:

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

### 4. 🤖 OpenAI GPT-4o mini (Paid / Credit)
1. Visit [OpenAI Platform API Keys](https://platform.openai.com/api-keys).
2. Create an API Key starting with `sk-...`.

### 5. ⚡ Anthropic Claude Sonnet (Paid / Credit)
1. Visit [Anthropic Console](https://console.anthropic.com).
2. Create an API Key starting with `sk-ant-...`.

