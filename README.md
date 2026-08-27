# Artist's Studio

https://artists-studio.onrender.com

## Phases 1–6
1. Auth  
2. Public multi-page CMS + WhatsApp prefill  
3. Contact form  
4. Private chat (WhatsApp-style)  
5. Chat media (image / video / file) — private, auth-only  
6. **WebSocket realtime + admin toast notifications**

### Realtime
- `WS /ws` — send `{ "type": "auth", "token": "<jwt>" }`
- Events: `auth_ok`, `new_message`, `notification`

### Media
- `POST /api/v1/conversations/:id/messages` multipart: `body`, `file`
- `GET /api/v1/media/private/:id` (Bearer required)

Admin: `admin` / `admin123`  
Chat: `/chat.html` · Admin: `/admin.html`
