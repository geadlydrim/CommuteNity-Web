# Web app only; no native client

CommuteNity ships as one Next.js web app, used in phone and desktop browsers. An Android-first plan (Kotlin/Compose, Room, WorkManager, `supabase-kt`) was dropped in favor of a single client, because one codebase that a rider can open from a shared link beats installing an app to read a commute tip. The sibling `../CommuteNity/` Compose project is a Hello World scaffold, not a client; do not plan native work, or a TWA, here.
