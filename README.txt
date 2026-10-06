JASZCWEB — STRONA NYGGANYGGA
============================

This is the real multi-user foundation for JASZCWEB.

PROJECT
-------
index.html        Login / signup
 dashboard.html   Your communities + create/join
 community.html   Channels + real-time group chat
 members.html     Community members
 settings.html    Owner customization
 profile.html     User profile
 css/style.css    Global design
 js/config.js     Supabase credentials
 js/*.js          App logic
 supabase.sql     Database, RLS, RPCs and realtime setup

SETUP
-----
1. Create a Supabase project.
2. Open the Supabase SQL Editor.
3. Paste all of supabase.sql and run it.
4. Open js/config.js.
5. Replace YOUR_SUPABASE_URL and YOUR_SUPABASE_PUBLISHABLE_KEY.
6. Open index.html through your normal web hosting/static site setup.

AUTH
----
Supabase Auth handles signup/login.
If email confirmation is enabled, users must confirm before they can sign in.

COMMUNITIES
-----------
A user can create a community and becomes its owner.
The create RPC automatically creates:
- the owner membership
- #general
- an 8-character invite code

Members join with that invite code from dashboard.html.

CHAT
----
Messages are stored in Postgres in the messages table.
Supabase Realtime listens for INSERT events on messages, so everyone in the same
channel can receive new messages without refreshing.

SECURITY
--------
The SQL enables Row Level Security on the exposed tables.
Do NOT put a Supabase service_role secret in browser code.
Only use the project URL and publishable key in js/config.js.

NEXT BUILD
----------
This foundation is ready for:
- admin/moderator controls
- kick/ban/mute
- message edit/delete
- reactions
- replies
- direct messages
- notifications
- file/image uploads
- custom emojis
- community banners
- voice channels
- online presence
- search
