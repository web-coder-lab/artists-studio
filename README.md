# Artist's Studio

## Live
https://artists-studio.onrender.com

## Phases
1. Auth  
2. Public multi-page CMS + WhatsApp prefill  
3. Contact form + admin Contact queue  
4. **Private chat (WhatsApp-style)** — user ↔ studio  

### Chat API
- `GET  /api/v1/conversations`
- `GET  /api/v1/conversations/:id/messages`
- `POST /api/v1/conversations/:id/messages` `{ "body": "..." }`
- `POST /api/v1/chat/artist` — user open/create thread

### UI
- User: `/chat.html`
- Admin: `/admin.html` → Chat Inbox + Contact form tabs

Admin seed: `admin` / `admin123`
