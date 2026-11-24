import type {
  BloggerTemplatePreset,
  ColorPalettePreset,
  FontOption,
  SampleBlogData,
} from '../types/blogger';
import {
  buildAuthorAvatarSvgUri,
  buildEditorialCoverSvgUri,
} from '../lib/bloggerTemplateEngine';

export const COLOR_PALETTE_PRESETS: ColorPalettePreset[] = [
  {
    id: 'editorial-blue',
    name: 'Editorial Biru',
    palette: {
      background: '#f8fafc',
      surface: '#ffffff',
      primary: '#2563eb',
      heading: '#0f172a',
      text: '#334155',
      mutedText: '#64748b',
      link: '#1d4ed8',
      headerBg: '#ffffff',
      headerText: '#0f172a',
      border: '#e2e8f0',
    },
  },
  {
    id: 'emerald-paper',
    name: 'Zamrud Hangat',
    palette: {
      background: '#f5f8f6',
      surface: '#ffffff',
      primary: '#059669',
      heading: '#064e3b',
      text: '#1f2937',
      mutedText: '#6b7280',
      link: '#047857',
      headerBg: '#064e3b',
      headerText: '#ffffff',
      border: '#d1fae5',
    },
  },
  {
    id: 'obsidian-night',
    name: 'Malam Obsidian',
    palette: {
      background: '#0f172a',
      surface: '#1e293b',
      primary: '#38bdf8',
      heading: '#f8fafc',
      text: '#cbd5e1',
      mutedText: '#94a3b8',
      link: '#38bdf8',
      headerBg: '#020617',
      headerText: '#f8fafc',
      border: '#334155',
    },
  },
  {
    id: 'terracotta-warm',
    name: 'Terakota Klasik',
    palette: {
      background: '#fdf8f5',
      surface: '#ffffff',
      primary: '#c2410c',
      heading: '#431407',
      text: '#3f3f46',
      mutedText: '#71717a',
      link: '#b45309',
      headerBg: '#431407',
      headerText: '#fff7ed',
      border: '#fed7aa',
    },
  },
];

export const FONT_OPTIONS: FontOption[] = [
  { name: 'Fraunces', category: 'serif', vibe: 'Editorial Modern' },
  { name: 'DM Sans', category: 'sans-serif', vibe: 'Bersih & Ringan' },
  { name: 'Plus Jakarta Sans', category: 'sans-serif', vibe: 'Modern Profesional' },
  { name: 'Manrope', category: 'sans-serif', vibe: 'Geometris Tajam' },
  { name: 'Lora', category: 'serif', vibe: 'Klasik Nyaman Baca' },
  { name: 'Merriweather', category: 'serif', vibe: 'Majalah Berita' },
  { name: 'JetBrains Mono', category: 'monospace', vibe: 'Kode & Teknis' },
];

export const DEFAULT_SAMPLE_BLOG: SampleBlogData = {
  blogTitle: 'Jurnal Shona Official',
  blogDescription:
    'Catatan desain web, optimasi template Blogger XML, dan panduan produktivitas digital.',
  authorName: 'Shona Official',
  authorBio:
    'Kreator template Blogger Layout v3 ringan, bersih, dan ramah perangkat mobile.',
  authorAvatar: buildAuthorAvatarSvgUri('Shona Official'),
  navLinks: [
    { label: 'Beranda' },
    { label: 'Blogger XML', category: 'Blogger XML' },
    { label: 'Desain UI', category: 'Desain UI' },
    { label: 'SEO & Performa', category: 'SEO & Performa' },
  ],
  labels: [
    { name: 'Blogger XML', count: 14 },
    { name: 'Desain UI', count: 9 },
    { name: 'SEO & Performa', count: 7 },
    { name: 'Produktivitas', count: 5 },
  ],
  posts: [
    {
      id: 'post-1',
      title: 'Panduan Struktur Blogger Layout v3 yang Bersih dan Mudah Dirawat',
      snippet:
        'Pelajari cara menyusun section, widget, dan variabel b:skin agar tema Blogspot Anda tetap ringan dan valid di Studio Editor.',
      bodyHtml:
        '<p>Template Blogger modern dibangun di atas struktur XML yang rapi dengan pemisahan jelas antara <code>&lt;b:skin&gt;</code>, tata letak dashboard <code>&lt;b:template-skin&gt;</code>, dan widget modular.</p><h3>Mengapa Validitas XML Penting?</h3><p>Setiap karakter <code>&amp;</code> di luar CDATA serta atribut boolean wajib mengikuti standar XML 1.0 agar proses simpan tema di Blogger tidak ditolak oleh parser server.</p>',
      author: 'Shona Official',
      date: '18 Nov 2026',
      category: 'Blogger XML',
      readTime: '5 mnt baca',
      imageUrl: buildEditorialCoverSvgUri(
        'Panduan Struktur Blogger Layout v3',
        'Blogger XML',
        0
      ),
      commentsCount: 8,
    },
    {
      id: 'post-2',
      title: 'Tips Mengurangi CSS Mati dan Skrip Duplikat pada Tema Blogspot',
      snippet:
        'Aturan CSS yang tidak pernah dipanggil di markup hanya menambah ukuran XML tanpa dampak visual. Berikut cara mengidentifikasinya.',
      bodyHtml:
        '<p>Menghapus selektor usang dan pustaka eksternal ganda dapat memangkas ukuran unduhan awal secara signifikan serta memperbaiki skor Core Web Vitals.</p>',
      author: 'Shona Official',
      date: '14 Nov 2026',
      category: 'SEO & Performa',
      readTime: '4 mnt baca',
      imageUrl: buildEditorialCoverSvgUri(
        'Optimasi CSS & Skrip Tema Blogspot',
        'SEO & Performa',
        1
      ),
      commentsCount: 5,
    },
    {
      id: 'post-3',
      title: 'Menata Hirarki Tipografi Editorial agar Nyaman Dibaca di Ponsel',
      snippet:
        'Keseimbangan antara ukuran huruf dasar, tinggi baris, dan rasio kontras warna sangat menentukan betah tidaknya pengunjung membaca artikel.',
      bodyHtml:
        '<p>Gunakan ukuran huruf minimal 16px pada badan artikel dengan tinggi baris 1.65 agar mata pembaca tidak cepat lelah di layar sempit.</p>',
      author: 'Shona Official',
      date: '09 Nov 2026',
      category: 'Desain UI',
      readTime: '4 mnt baca',
      imageUrl: buildEditorialCoverSvgUri(
        'Tipografi Editorial Responsif Mobile',
        'Desain UI',
        2
      ),
      commentsCount: 3,
    },
    {
      id: 'post-4',
      title: 'Strategi Navigasi Label dan Widget Sidebar Tanpa Membuat Layout Penuh',
      snippet:
        'Susun widget PopularPosts, Label, dan kotak pencarian secara proporsional agar halaman utama tetap rapi di desktop maupun HP.',
      bodyHtml:
        '<p>Sidebar yang ringkas membantu pengunjung menemukan topik populer lebih cepat tanpa mengganggu fokus baca pada kolom utama.</p>',
      author: 'Shona Official',
      date: '04 Nov 2026',
      category: 'Produktivitas',
      readTime: '3 mnt baca',
      imageUrl: buildEditorialCoverSvgUri(
        'Navigasi Label & Tata Letak Sidebar',
        'Produktivitas',
        3
      ),
      commentsCount: 2,
    },
  ],
};

const SHONA_EDITORIAL_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:css='false' b:defaultwidgetversion='2' b:layoutsVersion='3' b:responsive='true' xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:data='http://www.google.com/2005/gml/data' xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta charset='UTF-8'/>
  <meta content='width=device-width, initial-scale=1, viewport-fit=cover' name='viewport'/>
  <title><data:blog.pageTitle/></title>
  <b:include data='blog' name='all-head-content'/>
  <link href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&amp;family=Fraunces:wght@600;700&amp;display=swap' rel='stylesheet'/>
  <b:skin><![CDATA[/*
-----------------------------------------------
Blogger Template Style
Template Name: Shona Official
Version: 2.0.0
Author: Shona Official
URL: https://www.youtube.com/@ShonaOfficial
Description: Tema editorial responsif smartphone dan desktop berbasis Blogger Layout v3.
----------------------------------------------- */
<Group description="Warna Utama">
  <Variable name="body.background" description="Latar Belakang" type="color" default="#f8fafc" value="#f8fafc"/>
  <Variable name="body.text.color" description="Warna Teks" type="color" default="#334155" value="#334155"/>
  <Variable name="keycolor" description="Warna Aksen" type="color" default="#2563eb" value="#2563eb"/>
</Group>
<Group description="Tipografi">
  <Variable name="body.font" description="Font Paragraf" type="font" default="normal 400 16px 'DM Sans', sans-serif" value="normal 400 16px 'DM Sans', sans-serif"/>
  <Variable name="heading.font" description="Font Judul" type="font" default="normal 700 28px 'Fraunces', serif" value="normal 700 28px 'Fraunces', serif"/>
</Group>
:root {
  --bg: $(body.background);
  --surface: #ffffff;
  --surface-subtle: #f1f5f9;
  --text: $(body.text.color);
  --heading: #0f172a;
  --muted: #64748b;
  --accent: $(keycolor);
  --border: #e2e8f0;
  --radius: 14px;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; overflow-x: hidden; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: $(body.font);
  line-height: 1.65;
  overflow-x: hidden;
}
a { color: var(--accent); text-decoration: none; transition: color 0.15s ease; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
.site-shell {
  width: 100%;
  max-width: 1180px;
  margin: 0 auto;
  padding: 0 24px;
}
.header-outer {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 22px 0;
}
.Header h1, .Header .title {
  margin: 0;
  font: $(heading.font);
  font-size: clamp(1.375rem, 2.5vw, 1.9rem);
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--heading);
}
.Header .title a { color: inherit; text-decoration: none; }
.Header .description {
  margin: 6px 0 0;
  font-size: 14px;
  color: var(--muted);
  max-width: 62ch;
}
.nav-bar {
  position: sticky;
  top: 0;
  z-index: 20;
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--border);
}
.PageList ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 20px;
}
.PageList li a {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  padding: 10px 2px;
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  border-bottom: 2px solid transparent;
  white-space: nowrap;
}
.PageList li a:hover { color: var(--heading); text-decoration: none; }
.PageList li.selected a {
  color: var(--accent);
  font-weight: 700;
  border-bottom-color: var(--accent);
}
.layout-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 330px;
  gap: 32px;
  padding: 32px 0 48px;
  align-items: start;
}
.main-wrapper, .sidebar-container { min-width: 0; }
.post-outer {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 24px;
  margin-bottom: 22px;
}
.post-thumb {
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: cover;
  border-radius: calc(var(--radius) - 4px);
  margin-bottom: 16px;
  display: block;
  background: var(--surface-subtle);
}
.post-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 8px;
  font-size: 12.5px;
  color: var(--muted);
  margin-bottom: 10px;
}
.post-title {
  margin: 0 0 10px;
  font-family: 'Fraunces', serif;
  font-size: clamp(1.22rem, 2.2vw, 1.55rem);
  line-height: 1.28;
  color: var(--heading);
  text-wrap: balance;
}
.post-title a { color: inherit; text-decoration: none; }
.post-title a:hover { color: var(--accent); }
.post-body { font-size: 15.5px; line-height: 1.7; color: var(--text); }
.post-body p { margin: 0 0 14px; }
.post-body h3 { margin: 20px 0 10px; font-size: 18px; color: var(--heading); }
.post-body pre, .post-body code { font-family: ui-monospace, SFMono-Regular, monospace; }
.post-body pre { overflow-x: auto; padding: 12px; border-radius: 8px; background: var(--surface-subtle); }
.jump-link { margin-top: 14px; }
.jump-link a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 8px 16px;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  text-decoration: none;
}
.jump-link a:hover { opacity: 0.92; text-decoration: none; }
.sidebar-container {
  position: sticky;
  top: 64px;
}
.sidebar-container .widget {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin-bottom: 20px;
}
.sidebar-container .widget h2 {
  margin: 0 0 14px;
  font-size: 15px;
  font-weight: 700;
  color: var(--heading);
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border);
}
.BlogSearch form { display: flex; gap: 8px; }
.BlogSearch input[type='text'] {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--heading);
  font-size: 13.5px;
}
.BlogSearch input[type='submit'] {
  min-height: 40px;
  padding: 8px 16px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.PopularPosts ul, .Label ul { list-style: none; margin: 0; padding: 0; }
.PopularPosts li {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid var(--border);
}
.PopularPosts li:first-child { padding-top: 0; }
.PopularPosts li:last-child { border-bottom: none; padding-bottom: 0; }
.PopularPosts li img {
  width: 68px;
  height: 50px;
  object-fit: cover;
  border-radius: 8px;
  flex-shrink: 0;
}
.PopularPosts .item-title a {
  font-size: 13.5px;
  font-weight: 600;
  line-height: 1.38;
  color: var(--heading);
}
.Label li { border-bottom: 1px solid var(--surface-subtle); }
.Label li:last-child { border-bottom: none; }
.Label li a {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 0;
  font-size: 13.5px;
  color: var(--text);
}
.Label li a span { font-size: 12px; color: var(--muted); }
.Profile .profile-wrap {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.Profile .profile-img { width: 48px; height: 48px; border-radius: 9999px; object-fit: cover; }
.footer-outer {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 24px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

/* Tablet Layout (<= 1024px) */
@media (max-width: 1024px) {
  .site-shell { padding: 0 18px; }
  .layout-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding: 24px 0 36px;
  }
  .sidebar-container {
    position: static;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 16px;
  }
  .sidebar-container .widget { margin-bottom: 0; }
}

/* Smartphone Layout (<= 640px) */
@media (max-width: 640px) {
  .site-shell { padding: 0 14px; }
  .header-outer { padding: 16px 0; }
  .Header .description { font-size: 13px; }
  .PageList ul {
    flex-wrap: nowrap;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    scrollbar-width: none;
    gap: 16px;
  }
  .PageList ul::-webkit-scrollbar { display: none; }
  .layout-grid { gap: 18px; padding: 16px 0 28px; }
  .post-outer {
    padding: 16px;
    border-radius: 12px;
    margin-bottom: 14px;
  }
  .post-thumb { margin-bottom: 12px; border-radius: 8px; }
  .post-body { font-size: 15px; }
  .jump-link a { width: 100%; min-height: 44px; }
  .sidebar-container {
    grid-template-columns: 1fr;
    gap: 14px;
  }
  .sidebar-container .widget { padding: 16px; border-radius: 12px; }
  .BlogSearch input[type='text'], .BlogSearch input[type='submit'] { min-height: 44px; }
  .footer-outer { padding: 20px 0; font-size: 12.5px; }
}
]]></b:skin>
  <b:template-skin><![CDATA[
body#layout .site-shell { width: 100%; }
body#layout .layout-grid { display: flex; gap: 16px; }
body#layout .main-wrapper { flex: 1; }
body#layout .sidebar-container { width: 300px; }
]]></b:template-skin>
</head>
<body>
  <header class='header-outer'>
    <div class='site-shell'>
      <b:section class='header' id='header' maxwidgets='1' showaddelement='no'>
        <b:widget id='Header1' locked='true' title='Jurnal Shona Official (Header)' type='Header' version='2' visible='true'>
          <b:includable id='main'>
            <h1 class='title'><data:title/></h1>
            <p class='description'><data:description/></p>
          </b:includable>
        </b:widget>
      </b:section>
    </div>
  </header>
  <nav class='nav-bar'>
    <div class='site-shell'>
      <b:section class='crosscol' id='crosscol' maxwidgets='1' showaddelement='yes'>
        <b:widget id='PageList1' locked='false' title='Menu Navigasi' type='PageList' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
    </div>
  </nav>
  <div class='site-shell'>
    <div class='layout-grid'>
      <main class='main-wrapper'>
        <b:section class='main' id='main' maxwidgets='2' showaddelement='yes'>
          <b:widget id='Blog1' locked='true' title='Postingan Blog' type='Blog' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
        </b:section>
      </main>
      <aside class='sidebar-container'>
        <b:section class='sidebar' id='sidebar' showaddelement='yes'>
          <b:widget id='BlogSearch1' locked='false' title='Cari Artikel' type='BlogSearch' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
          <b:widget id='PopularPosts1' locked='false' title='Artikel Populer' type='PopularPosts' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
          <b:widget id='Label1' locked='false' title='Kategori' type='Label' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
        </b:section>
      </aside>
    </div>
  </div>
  <footer class='footer-outer'>
    <div class='site-shell'>
      <b:section class='footer' id='footer' maxwidgets='2' showaddelement='yes'>
        <b:widget id='Attribution1' locked='false' title='' type='Attribution' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
    </div>
  </footer>
</body>
</html>`;

const SHONA_RESPONSIVE_GRID_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:css='false' b:defaultwidgetversion='2' b:layoutsVersion='3' b:responsive='true' xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:data='http://www.google.com/2005/gml/data' xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta charset='UTF-8'/>
  <meta content='width=device-width, initial-scale=1, viewport-fit=cover' name='viewport'/>
  <title><data:blog.pageTitle/></title>
  <b:include data='blog' name='all-head-content'/>
  <link href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&amp;family=Plus+Jakarta+Sans:wght@600;700;800&amp;display=swap' rel='stylesheet'/>
  <b:skin><![CDATA[/*
-----------------------------------------------
Blogger Template Style
Template Name: Shona Grid Responsif
Version: 1.0.0
Author: Shona Official
URL: https://www.youtube.com/@ShonaOfficial
Description: Tata letak grid modern 2 kolom di desktop & 1 kolom nyaman sentuh di smartphone.
----------------------------------------------- */
<Group description="Warna Utama">
  <Variable name="body.background" description="Latar Belakang" type="color" default="#f1f5f9" value="#f1f5f9"/>
  <Variable name="body.text.color" description="Warna Teks" type="color" default="#334155" value="#334155"/>
  <Variable name="keycolor" description="Warna Aksen" type="color" default="#0f172a" value="#0f172a"/>
</Group>
<Group description="Tipografi">
  <Variable name="body.font" description="Font Paragraf" type="font" default="normal 400 15.5px 'DM Sans', sans-serif" value="normal 400 15.5px 'DM Sans', sans-serif"/>
  <Variable name="heading.font" description="Font Judul" type="font" default="normal 800 28px 'Plus Jakarta Sans', sans-serif" value="normal 800 28px 'Plus Jakarta Sans', sans-serif"/>
</Group>
:root {
  --bg: $(body.background);
  --surface: #ffffff;
  --text: $(body.text.color);
  --heading: #0f172a;
  --muted: #64748b;
  --accent: $(keycolor);
  --border: #e2e8f0;
}
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; overflow-x: hidden; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font: $(body.font);
  line-height: 1.65;
  overflow-x: hidden;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
.wrap { width: 100%; max-width: 1260px; margin: 0 auto; padding: 0 24px; }
.topbar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 30;
}
.topbar-inner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  padding: 14px 0;
}
.Header h1, .Header .title {
  margin: 0;
  font: $(heading.font);
  font-size: clamp(1.2rem, 2.2vw, 1.55rem);
  color: var(--heading);
  letter-spacing: -0.02em;
}
.Header .description { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); }
.PageList ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  align-items: center;
  gap: 18px;
}
.PageList li a {
  display: inline-flex;
  align-items: center;
  min-height: 40px;
  font-size: 13.5px;
  font-weight: 600;
  color: var(--text);
  white-space: nowrap;
}
.PageList li.selected a { color: #2563eb; }
.portal-grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 28px;
  padding: 28px 0 48px;
  align-items: start;
}
.blog-posts:not(.is-single) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 20px;
}
.post-outer {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.post-outer .post-thumb {
  width: 100%;
  aspect-ratio: 16 / 10;
  object-fit: cover;
  display: block;
}
.post-outer .post-content {
  padding: 18px 20px 20px;
}
.post-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  font-size: 12px;
  color: var(--muted);
  margin-bottom: 8px;
}
.post-title {
  margin: 0 0 8px;
  font-family: 'Plus Jakarta Sans', sans-serif;
  font-size: clamp(1.08rem, 1.8vw, 1.3rem);
  line-height: 1.3;
  color: var(--heading);
}
.post-title a { color: inherit; }
.post-body { font-size: 14.5px; color: var(--text); }
.jump-link { margin-top: 12px; }
.jump-link a {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 38px;
  padding: 7px 14px;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-size: 12.5px;
  font-weight: 600;
}
.sidebar-container .widget {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px;
  margin-bottom: 18px;
}
.sidebar-container .widget h2 {
  margin: 0 0 12px;
  font-size: 14px;
  font-weight: 700;
  color: var(--heading);
}
.BlogSearch form { display: flex; gap: 8px; }
.BlogSearch input[type='text'] {
  flex: 1;
  min-width: 0;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.BlogSearch input[type='submit'] {
  min-height: 40px;
  padding: 8px 14px;
  border: none;
  border-radius: 8px;
  background: var(--accent);
  color: #ffffff;
  font-weight: 600;
  cursor: pointer;
}
.PopularPosts ul, .Label ul { list-style: none; margin: 0; padding: 0; }
.PopularPosts li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid var(--border); }
.PopularPosts li:last-child { border-bottom: none; }
.PopularPosts li img { width: 64px; height: 48px; object-fit: cover; border-radius: 8px; flex-shrink: 0; }
.Label li a { display: flex; justify-content: space-between; padding: 7px 0; font-size: 13px; color: var(--text); border-bottom: 1px solid #f1f5f9; }
.footer-outer {
  background: var(--surface);
  border-top: 1px solid var(--border);
  padding: 22px 0;
  text-align: center;
  font-size: 13px;
  color: var(--muted);
}

@media (max-width: 1024px) {
  .topbar-inner { flex-direction: column; align-items: stretch; gap: 6px; padding: 12px 0; }
  .portal-grid { grid-template-columns: 1fr; gap: 22px; }
  .sidebar-container { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
}

@media (max-width: 640px) {
  .wrap { padding: 0 14px; }
  .PageList ul { overflow-x: auto; scrollbar-width: none; padding-bottom: 2px; }
  .PageList ul::-webkit-scrollbar { display: none; }
  .portal-grid { padding: 16px 0 28px; gap: 16px; }
  .blog-posts:not(.is-single) { grid-template-columns: 1fr; gap: 14px; }
  .post-outer .post-content { padding: 14px 16px 16px; }
  .jump-link a { width: 100%; min-height: 44px; }
  .sidebar-container { grid-template-columns: 1fr; gap: 14px; }
}
]]></b:skin>
</head>
<body>
  <header class='topbar'>
    <div class='wrap topbar-inner'>
      <b:section class='header' id='header' maxwidgets='1' showaddelement='no'>
        <b:widget id='Header1' locked='true' title='Jurnal Shona Official' type='Header' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
      <b:section class='crosscol' id='crosscol' maxwidgets='1' showaddelement='yes'>
        <b:widget id='PageList1' locked='false' title='Menu' type='PageList' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
    </div>
  </header>
  <div class='wrap'>
    <div class='portal-grid'>
      <main class='main-wrapper'>
        <b:section class='main' id='main' maxwidgets='2' showaddelement='yes'>
          <b:widget id='Blog1' locked='true' title='Postingan Blog' type='Blog' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
        </b:section>
      </main>
      <aside class='sidebar-container'>
        <b:section class='sidebar' id='sidebar' showaddelement='yes'>
          <b:widget id='BlogSearch1' locked='false' title='Cari Artikel' type='BlogSearch' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
          <b:widget id='PopularPosts1' locked='false' title='Artikel Populer' type='PopularPosts' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
          <b:widget id='Label1' locked='false' title='Kategori' type='Label' version='2' visible='true'>
            <b:includable id='main'/>
          </b:widget>
        </b:section>
      </aside>
    </div>
  </div>
  <footer class='footer-outer'>
    <div class='wrap'>
      <b:section class='footer' id='footer' maxwidgets='2' showaddelement='yes'>
        <b:widget id='Attribution1' locked='false' title='' type='Attribution' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
    </div>
  </footer>
</body>
</html>`;

const MINIMAL_ZINE_XML = `<?xml version="1.0" encoding="UTF-8" ?>
<!DOCTYPE html>
<html b:css='false' b:defaultwidgetversion='2' b:layoutsVersion='3' b:responsive='true' xmlns='http://www.w3.org/1999/xhtml' xmlns:b='http://www.google.com/2005/gml/b' xmlns:data='http://www.google.com/2005/gml/data' xmlns:expr='http://www.google.com/2005/gml/expr'>
<head>
  <meta charset='UTF-8'/>
  <meta content='width=device-width, initial-scale=1, viewport-fit=cover' name='viewport'/>
  <title><data:blog.pageTitle/></title>
  <b:include data='blog' name='all-head-content'/>
  <b:skin><![CDATA[/*
-----------------------------------------------
Blogger Template Style
Template Name: Zine Satu Kolom
Version: 1.2.0
Author: TemaLoka Presets
Description: Tata letak fokus baca satu kolom responsif smartphone dan desktop.
----------------------------------------------- */
<Variable name="body.background" description="Background" type="color" default="#ffffff" value="#ffffff"/>
<Variable name="keycolor" description="Accent" type="color" default="#059669" value="#059669"/>
*, *::before, *::after { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; overflow-x: hidden; }
body { margin: 0; background: $(body.background); color: #1e293b; font-family: system-ui, -apple-system, sans-serif; line-height: 1.7; overflow-x: hidden; }
a { color: $(keycolor); text-decoration: none; }
a:hover { text-decoration: underline; }
img { max-width: 100%; height: auto; }
.wrap { width: 100%; max-width: 780px; margin: 0 auto; padding: 0 24px; }
.header-outer { padding: 36px 0 22px; border-bottom: 1px solid #e2e8f0; }
.Header h1 { margin: 0; font-size: clamp(1.4rem, 2.8vw, 1.95rem); line-height: 1.2; color: #0f172a; }
.Header .description { margin: 6px 0 0; font-size: 14px; color: #64748b; }
.post-outer { padding: 28px 0; border-bottom: 1px solid #e2e8f0; }
.post-thumb { width: 100%; aspect-ratio: 16 / 9; object-fit: cover; border-radius: 10px; margin-bottom: 14px; display: block; }
.post-title { margin: 0 0 8px; font-size: clamp(1.2rem, 2.2vw, 1.5rem); line-height: 1.3; color: #0f172a; }
.post-title a { color: inherit; }
.post-meta { font-size: 12.5px; color: #64748b; margin-bottom: 10px; display: flex; flex-wrap: wrap; gap: 6px; }
.jump-link { margin-top: 12px; }
.jump-link a { display: inline-flex; align-items: center; justify-content: center; min-height: 38px; padding: 7px 14px; border-radius: 8px; background: $(keycolor); color: #ffffff; font-size: 13px; font-weight: 600; }
.footer-outer { padding: 28px 0; font-size: 13px; color: #64748b; text-align: center; }

@media (max-width: 640px) {
  .wrap { padding: 0 16px; }
  .header-outer { padding: 20px 0 16px; }
  .post-outer { padding: 20px 0; }
  .jump-link a { width: 100%; min-height: 44px; }
}
]]></b:skin>
</head>
<body>
  <header class='header-outer'>
    <div class='wrap'>
      <b:section class='header' id='header' maxwidgets='1' showaddelement='no'>
        <b:widget id='Header1' locked='true' title='Zine Satu Kolom' type='Header' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
    </div>
  </header>
  <main class='wrap'>
    <b:section class='main' id='main' maxwidgets='2' showaddelement='yes'>
      <b:widget id='Blog1' locked='true' title='Artikel' type='Blog' version='2' visible='true'>
        <b:includable id='main'/>
      </b:widget>
    </b:section>
  </main>
  <footer class='footer-outer'>
    <div class='wrap'>
      <b:section class='footer' id='footer' maxwidgets='1' showaddelement='yes'>
        <b:widget id='Attribution1' locked='false' title='' type='Attribution' version='2' visible='true'>
          <b:includable id='main'/>
        </b:widget>
      </b:section>
    </div>
  </footer>
</body>
</html>`;

export const TEMPLATE_PRESETS: BloggerTemplatePreset[] = [
  {
    id: 'shona-editorial',
    name: 'Shona Official Editorial',
    category: 'Editorial',
    description:
      'Template Blogger Layout v3 dua kolom responsif smartphone & desktop lengkap dengan variabel warna, font, navigasi sticky, dan sidebar widget.',
    xml: SHONA_EDITORIAL_XML,
  },
  {
    id: 'shona-responsive-grid',
    name: 'Shona Grid Responsif',
    category: 'Majalah Grid',
    description:
      'Tampilan kartu artikel 2 kolom modern di layar desktop dan 1 kolom nyaman sentuh di smartphone.',
    xml: SHONA_RESPONSIVE_GRID_XML,
  },
  {
    id: 'minimal-zine',
    name: 'Zine Satu Kolom',
    category: 'Minimalis',
    description:
      'Desain baca satu kolom ultra-ringan dan responsif penuh untuk blog pribadi maupun esai panjang.',
    xml: MINIMAL_ZINE_XML,
  },
];
