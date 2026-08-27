# Artist's Studio

https://artists-studio.onrender.com

## Phases 1–9 (web)

1. Auth  
2. Public multi-page CMS + WhatsApp prefill  
3. Contact form  
4. Private WhatsApp-style chat  
5. Chat media (private attachments)  
6. WebSocket + admin notifications  
7. Voice/Video calls (WebRTC)  
8. **Admin remote control** (site, socials, portfolio, reels, users)  
9. **Draft → Publish → Version restore**

### Admin
https://artists-studio.onrender.com/admin.html  
`admin` / `admin123`

### Key admin APIs
- `GET/PUT /api/v1/admin/site`
- `GET/PUT /api/v1/admin/socials`
- `POST/PATCH/DELETE /api/v1/admin/portfolio`
- `POST/DELETE /api/v1/admin/reels`
- `GET/PATCH /api/v1/admin/users`
- `POST /api/v1/admin/publish`
- `GET /api/v1/admin/versions`
- `POST /api/v1/admin/versions/:id/restore`
