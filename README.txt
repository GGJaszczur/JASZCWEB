JASZCWEB V2

This version adds:
- join-by-invite UI
- message replies
- message reactions
- roles: owner/admin/moderator/member
- moderation actions: promote, kick, ban
- direct messages
- notifications
- customizable profiles
- avatar uploads
- custom community accent + banner colors
- private community file uploads/downloads
- voice channels using WebRTC + Supabase Realtime signaling
- online community presence

SETUP
1. Keep your existing js/config.js values.
2. In Supabase SQL Editor, run the ENTIRE `supabase-v2-upgrade.sql` once.
3. GitHub Pages will serve the same static files.
4. For voice chat, users must allow microphone access.
5. Voice is a peer-to-peer WebRTC mesh. It is intended for small groups; it is not a scalable SFU voice server.
6. Supabase Storage uses an `avatars` public bucket and a private `community-files` bucket with RLS policies.

The frontend uses Supabase's publishable key only. Never place a Supabase secret key in client-side files.
