const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, 'data');
const dbFile = path.join(dataDir, 'studio.json');
fs.mkdirSync(dataDir, { recursive: true });

function defaultDb() {
  return {
    users: [
      {
        id: 1,
        username: 'admin',
        name: 'Studio Admin',
        password_hash: bcrypt.hashSync('admin123', 10),
        role: 'admin',
        status: 'active',
        created_at: new Date().toISOString(),
        last_login: null
      }
    ],
    site: {
      brand: "Artist's Studio",
      tagline: 'Photography · Direction · Craft',
      hero_title: 'A quiet space for work that holds attention.',
      hero_subtitle:
        "Artist's Studio is a private atelier online — portfolio, conversation, and collaboration under one calm roof.",
      profile_name: 'Studio Artist',
      profile_role: 'Photographer & Director',
      profile_bio:
        'I make images that feel still and honest — portraits, editorial, and quiet documentary work. Every frame is considered.',
      about:
        "Artist's Studio began as a small practice and grew into a place for clients and collaborators to meet the work properly — not as a feed, but as a room.",
      services: [
        { title: 'Portrait', text: 'Studio and location portraits with natural direction.' },
        { title: 'Editorial', text: 'Story-led series for publications and brands.' },
        { title: 'Events', text: 'Discreet coverage with an observational eye.' }
      ]
    },
    theme: {
      accent: '#c4a574',
      background: '#0a0a0b',
      text: '#f4f1ea',
      font_display: 'Cormorant Garamond',
      font_body: 'DM Sans'
    },
    socials: {
      instagram: 'https://www.instagram.com/aartistsstudios?igsh=YTllNTA0cXZkOXJj',
      youtube: '',
      whatsapp: '923244015101',
      email: 'abdullahshah5919@gmail.com'
    },
    draft: null,
    published_at: null,
    versions: [],
    portfolio: [
      {
        id: 1,
        title: 'Morning light',
        category: 'Portrait',
        image:
          'https://images.unsplash.com/photo-1531746020798-e6953c6e8e04?w=800&q=80',
        caption: 'Soft window light, single subject.'
      },
      {
        id: 2,
        title: 'City grain',
        category: 'Documentary',
        image:
          'https://images.unsplash.com/photo-1449824913935-59a10b8d2000?w=800&q=80',
        caption: 'Street study at dusk.'
      },
      {
        id: 3,
        title: 'Still table',
        category: 'Still life',
        image:
          'https://images.unsplash.com/photo-1493867387794-411ddf1f9f46?w=800&q=80',
        caption: 'Objects in quiet composition.'
      },
      {
        id: 4,
        title: 'Open road',
        category: 'Travel',
        image:
          'https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=800&q=80',
        caption: 'Landscape held in one frame.'
      }
    ],
    reels: [
      {
        id: 1,
        title: 'BTS — portrait set',
        thumb:
          'https://images.unsplash.com/photo-1452587925148-ce544e77e70d?w=600&q=80',
        url: '#'
      },
      {
        id: 2,
        title: 'Process notes',
        thumb:
          'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?w=600&q=80',
        url: '#'
      },
      {
        id: 3,
        title: 'Light tests',
        thumb:
          'https://images.unsplash.com/photo-1471341971476-ae15ff5dd4ea?w=600&q=80',
        url: '#'
      }
    ],
    policies: {
      privacy: {
        title: 'Privacy Policy',
        body: 'We collect only what is needed to run your account and conversations. Passwords are hashed. Private media is not public. Contact submissions are visible only to the studio admin.'
      },
      terms: {
        title: 'Terms & Conditions',
        body: "By using Artist's Studio you agree to use the platform respectfully. Accounts may be disabled for abuse. Bookings and commercial work may have separate written agreements."
      },
      disclaimer: {
        title: 'Disclaimer',
        body: 'Portfolio images are representative. Availability, pricing, and delivery timelines are confirmed directly with the studio.'
      }
    },
    pages: {
      home: { slug: 'home', title: 'Home', published: true },
      about: { slug: 'about', title: 'About', published: true },
      portfolio: { slug: 'portfolio', title: 'Portfolio', published: true },
      reels: { slug: 'reels', title: 'Reels', published: true },
      services: { slug: 'services', title: 'Services', published: true },
      contact: { slug: 'contact', title: 'Contact', published: true }
    },
    contacts: [],
    conversations: [],
    messages: [],
    media: [],
    calls: [],
    _seq: { users: 1, portfolio: 4, reels: 3, contacts: 0, conversations: 0, messages: 0, media: 0, calls: 0, versions: 0 }
  };
}

function load() {
  if (!fs.existsSync(dbFile)) {
    const d = defaultDb();
    save(d);
    return d;
  }
  const raw = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
  // migrate phase-1 DBs missing CMS fields
  const base = defaultDb();
  let changed = false;
  for (const key of ['site', 'theme', 'socials', 'portfolio', 'reels', 'policies', 'pages', 'contacts', 'conversations', 'messages', 'media', 'calls', 'versions']) {
    if (!raw[key]) {
      raw[key] = base[key];
      changed = true;
    }
  }
  if (!raw._seq) raw._seq = base._seq;
  if (raw._seq.contacts == null) raw._seq.contacts = (raw.contacts || []).length;
  if (raw._seq.conversations == null) raw._seq.conversations = (raw.conversations || []).length;
  if (raw._seq.messages == null) raw._seq.messages = (raw.messages || []).length;
  if (raw._seq.media == null) raw._seq.media = (raw.media || []).length;
  if (raw._seq.calls == null) raw._seq.calls = (raw.calls || []).length;
  if (!raw.theme) raw.theme = base.theme;
  if (!Array.isArray(raw.versions)) raw.versions = [];
  if (raw._seq.versions == null) raw._seq.versions = raw.versions.length;
  if (raw.draft === undefined) raw.draft = null;
  // Studio public contact (Phase setup)
  raw.socials = Object.assign({}, raw.socials || {}, {
    whatsapp: '923244015101',
    email: 'abdullahshah5919@gmail.com',
    instagram: 'https://www.instagram.com/aartistsstudios?igsh=YTllNTA0cXZkOXJj'
  });
  changed = true;
  if (changed) save(raw);
  return raw;
}

function save(db) {
  fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
}

module.exports = { load, save };
