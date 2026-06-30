// ============================================
// PCStore Perth — shared Supabase client config
// Used by: index.html, admin.html, contact.html (and any future page)
// ============================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

export const SUPABASE_URL = 'https://ahquyhbbnrtdlaydrrnm.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFocXV5aGJibnJ0ZGxheWRycm5tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxNzg1MTgsImV4cCI6MjA5Nzc1NDUxOH0.vf1pMfXU5b7gvnC9AiFChw96WQZQMHMEeTH8R5tcUj4';

// ⚠️ Update this when you set up a Facebook Page (m.me only works with Pages, not personal profiles)
export const MESSENGER_LINK = 'https://m.me/codepcstore';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

export function formatPrice(p) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(p);
}

// Validates AU (mobile/landline) and VN mobile phone numbers
export function isValidPhone(raw) {
  const cleaned = raw.replace(/[\s-]/g, '');
  const auMobile = /^(\+?61|0)4\d{8}$/;
  const auLandline = /^(\+?61|0)[2378]\d{8}$/;
  const vnMobile = /^(\+?84|0)(3|5|7|8|9)\d{8}$/;
  return auMobile.test(cleaned) || auLandline.test(cleaned) || vnMobile.test(cleaned);
}

// Generates pickup time options based on day of week
// Mon-Fri: after 5pm only · Sat-Sun: anytime 8am-8pm
export function getPickupTimeOptions(dateStr) {
  const date = new Date(dateStr + 'T00:00:00');
  const day = date.getDay(); // 0 = Sun, 6 = Sat
  const options = [];
  if (day === 0 || day === 6) {
    for (let h = 8; h <= 20; h++) options.push(`${h}:00`);
  } else {
    for (let h = 17; h <= 21; h++) options.push(`${h}:00`);
  }
  return options;
}
