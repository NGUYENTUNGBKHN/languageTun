
# Run local server


python -m http.server 8080

ollama launch claude --model kimi-k2.5:cloud

## Supabase setup

If your English table is using a single permissive RLS policy, create the Japanese table the same way in Supabase SQL Editor:

```sql
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
