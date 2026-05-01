/* Minimalist Lucide-style inline SVG icons */
const I = ({ d, fill, size = 16, sw = 1.75, children, ...p }) => (
  <svg viewBox="0 0 24 24" width={size} height={size} fill={fill || "none"} stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" {...p}>
    {d && <path d={d} />}
    {children}
  </svg>
);

const Icon = {
  Dash:   (p) => <I {...p}><rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/><rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/></I>,
  Users:  (p) => <I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></I>,
  Bldg:   (p) => <I {...p}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01"/><path d="M9 12v.01"/><path d="M9 15v.01"/><path d="M9 18v.01"/></I>,
  Brief:  (p) => <I {...p}><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/></I>,
  Kanban: (p) => <I {...p}><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></I>,
  Trend:  (p) => <I {...p}><path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/></I>,
  Clip:   (p) => <I {...p}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/></I>,
  Mail:   (p) => <I {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></I>,
  Spark:  (p) => <I {...p}><path d="M12 3l1.8 5.4L19 10l-5.2 1.6L12 17l-1.8-5.4L5 10l5.2-1.6z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z"/></I>,
  Pulse:  (p) => <I {...p}><path d="M3 12h4l3-8 4 16 3-8h4"/></I>,
  Plug:   (p) => <I {...p}><path d="M9 2v6"/><path d="M15 2v6"/><path d="M4 8h16v5a8 8 0 0 1-16 0z"/><path d="M12 21v-3"/></I>,
  Tool:   (p) => <I {...p}><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-3 3-2.7-.7-.7-2.7 3-3z"/></I>,
  Shield: (p) => <I {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></I>,
  Gear:   (p) => <I {...p}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1A1.7 1.7 0 0 0 9 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></I>,
  Search: (p) => <I {...p}><circle cx="11" cy="11" r="7"/><path d="m20 20-4.3-4.3"/></I>,
  Bell:   (p) => <I {...p}><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10 21a2 2 0 0 0 4 0"/></I>,
  Sun:    (p) => <I {...p}><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></I>,
  Moon:   (p) => <I {...p}><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></I>,
  Plus:   (p) => <I {...p}><path d="M12 5v14M5 12h14"/></I>,
  Up:     (p) => <I {...p}><path d="M7 17L17 7M17 17V7H7"/></I>,
  Dn:     (p) => <I {...p}><path d="M7 7l10 10M17 7v10H7"/></I>,
  Chev:   (p) => <I {...p}><path d="m6 9 6 6 6-6"/></I>,
  Left:   (p) => <I {...p}><path d="m15 18-6-6 6-6"/></I>,
  Dots:   (p) => <I {...p}><circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></I>,
  MapPin: (p) => <I {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></I>,
  Phone:  (p) => <I {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L7.9 9.8a16 16 0 0 0 6 6l1.4-1.4a2 2 0 0 1 2.1-.5c.8.3 1.7.5 2.6.6A2 2 0 0 1 22 17z"/></I>,
  Envelope:(p)=> <I {...p}><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></I>,
  FileTxt:(p) => <I {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6M9 17h6"/></I>,
  Star:   (p) => <I {...p}><path d="m12 2 3 7h7l-5.5 4.5L18 21l-6-4-6 4 1.5-7.5L2 9h7z"/></I>,
  Check:  (p) => <I {...p}><path d="m5 12 5 5L20 7"/></I>,
  X:      (p) => <I {...p}><path d="M18 6 6 18M6 6l12 12"/></I>,
  Cal:    (p) => <I {...p}><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></I>,
  Clock:  (p) => <I {...p}><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></I>,
  Eye:    (p) => <I {...p}><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></I>,
  Upload: (p) => <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/></I>,
  Pin:    (p) => <I {...p}><path d="M12 17v5M5 3h14l-1 9H6z"/></I>,
  Burger: (p) => <I {...p}><path d="M3 6h18M3 12h18M3 18h18"/></I>,
  Sliders:(p) => <I {...p}><path d="M4 21V14M4 10V3M12 21V12M12 8V3M20 21V16M20 12V3M1 14h6M9 8h6M17 16h6"/></I>,
  Filter: (p) => <I {...p}><path d="M3 4h18l-7 9v7l-4-2v-5z"/></I>,
  Download:(p)=> <I {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/></I>,
  Flag:   (p) => <I {...p}><path d="M4 22V4M4 4h13l-2 4 2 4H4"/></I>,
  Whats:  (p) => <I {...p}><path d="M21 11.5a8.5 8.5 0 0 1-13 7.2L3 20l1.3-5a8.5 8.5 0 1 1 16.7-3.5z"/></I>,
  Fire:   (p) => <I {...p}><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.4-.5-2.3-1.3-3a5 5 0 0 1 7.8 5.6 6 6 0 1 1-10.6 0c.3 1 .8 1.6 1.6 1.9z"/></I>,
  UserAdd:(p) => <I {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/></I>,
  Arr:    (p) => <I {...p}><path d="M5 12h14M13 5l7 7-7 7"/></I>,
};
Object.assign(window, { Icon });
