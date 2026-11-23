/* Impeccabyte CRM — shared data + helpers (no UI is built here). */
window.IB = (function () {
  var C = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z';
  var I = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    leads: 'M15 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M8.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M19 8v6M22 11h-6',
    deals: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v7h-4z',
    store: 'M3 9l1.5-5h15L21 9M4 9v11h16V9M3 9h18M9 20v-6h6v6',
    app: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 14l2 2 4-4',
    support: 'M21 12a8 8 0 0 1-11.8 7L4 20.5l1.5-4.6A8 8 0 1 1 21 12z',
    cb: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 8v5M12 16h.01',
    reports: 'M4 20V11M10 20V4M16 20v-7M21 20H3',
    res: 'M12 2v20M17 6.5c0-1.9-2.2-3-5-3s-5 1.3-5 3.5 2.2 3.2 5 3.8 5 1.8 5 4.2-2.2 3.5-5 3.5-5-1.1-5-3',
    settings: 'M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1M15 4v4M9 10v4M17 16v4',
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    plus: 'M12 5v14M5 12h14',
    bell: 'M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 0 0 4 0',
    chevD: 'M6 9l6 6 6-6', chevR: 'M9 6l6 6-6 6', chevL: 'M15 6l-6 6 6 6', chevU: 'M6 15l6-6 6 6',
    panel: 'M4 4h16v16H4zM9 4v16',
    sun: 'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
    moon: 'M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z',
    filter: 'M3 5h18M6 12h12M10 19h4',
    cols: 'M4 4h16v16H4zM10 4v16M15 4v16',
    dl: 'M12 3v12M7 10l5 5 5-5M4 21h16',
    phone: 'M22 16.9v3a2 2 0 0 1-2.2 2A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
    mail: 'M3 5h18v14H3zM3 6l9 7 9-7',
    note: 'M4 4h16v11l-5 5H4zM15 20v-5h5',
    task: 'M4 4h16v16H4zM8 12l3 3 5-6',
    check: 'M5 12l5 5L20 7', x: 'M6 6l12 12M18 6 6 18',
    clock: C + 'M12 7v5l3 2',
    alert: 'M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01',
    info: C + 'M12 11v5M12 8h.01',
    eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
    lock: 'M5 11h14v10H5zM8 11V7a4 4 0 0 1 8 0v4',
    clip: 'M21 11l-8.5 8.5a5 5 0 0 1-7-7L14 4a3.5 3.5 0 0 1 5 5l-8.5 8.5a2 2 0 0 1-3-3L15 7',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    link: 'M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1',
    refresh: 'M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M3 21v-5h5',
    send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
    building: 'M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 9h4a1 1 0 0 1 1 1v11M2 21h20M8 8h3M8 12h3M8 16h3',
    card: 'M2 6h20v12H2zM2 10h20M6 15h4',
    file: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5',
    upload: 'M12 21V9M7 14l5-5 5 5M4 3h16',
    merge: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
    ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    copy: 'M9 9h11v11H9zM5 15H4V4h11v1',
    sign: 'M3 17c3 0 4-8 7-8s1 8 4 8 3-4 5-4M3 21h18',
    shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
    users: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 20v-1a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
    plug: 'M9 2v5M15 2v5M6 7h12v4a6 6 0 0 1-12 0zM12 17v5',
    hook: 'M18 16.9A5 5 0 0 0 15 8h-1M6 7.1A5 5 0 0 0 9 16h1M12 3v6M12 15v6',
    flag: 'M4 22V4M4 4h13l-2 4 2 4H4',
    star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z',
    grip: 'M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01',
    cal: 'M4 5h16v16H4zM4 10h16M9 3v4M15 3v4',
    arrowR: 'M5 12h14M13 6l6 6-6 6', arrowUp: 'M12 19V5M6 11l6-6 6 6', arrowDn: 'M12 5v14M6 13l6 6 6-6',
    sort: 'M8 4v16M4 8l4-4 4 4M16 20V4M12 16l4 4 4-4',
    bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
    terminal: 'M6 3h12v18H6zM9 7h6v4H9zM9 15h.01M12 15h.01M15 15h.01M9 18h.01M12 18h.01M15 18h.01',
    trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
    template: 'M4 4h16v6H4zM4 14h7v6H4zM15 14h5v6h-5z'
  };
  var PI = { neutral: C, blue: C + 'M12 7v5l3 2', amber: C + 'M12 3v18', green: C + 'M8 12l3 3 5-6', red: C + 'M9 9l6 6M15 9l-6 6', gray: C + 'M8 12h8' };
  var TONE = {
    'New': 'neutral', 'Unsigned': 'neutral', 'Prospect': 'neutral', 'Not started': 'neutral',
    'Pending': 'blue', 'In Progress': 'blue', 'Processed': 'blue', 'Boarding': 'blue', 'Retrying': 'blue', 'Sent': 'blue', 'Viewed': 'blue',
    'Underwriting': 'amber', 'On Hold': 'amber', 'Partially Signed': 'amber', 'Conditional': 'amber', 'Due soon': 'amber', 'Held': 'amber',
    'Approved': 'green', 'Signed': 'green', 'Won': 'green', 'Live': 'green', 'Passed': 'green', 'Connected': 'green', 'Active': 'green', 'Uploaded': 'green', 'Deposited': 'green', 'Settled': 'green',
    'Declined': 'red', 'Rejected': 'red', 'Lost': 'red', 'Failed': 'red', 'Overdue': 'red', 'Missing': 'red', 'SLA breached': 'red',
    'Cancelled': 'gray', 'Closed': 'gray', 'Inactive': 'gray', 'Deactivated': 'gray'
  };
  function pill(label, tone) { var t = tone || TONE[label] || 'neutral'; return { label: label, cls: 'pill t-' + t, d: PI[t], tone: t }; }
  function usd(n) { var s = Math.abs(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); return (n < 0 ? '−$' : '$') + s; }
  function usd0(n) { return (n < 0 ? '−$' : '$') + Math.round(Math.abs(n)).toLocaleString('en-US'); }
  function short(n) { var a = Math.abs(n), s = n < 0 ? '−$' : '$'; if (a >= 1e6) return s + (a / 1e6).toFixed(2) + 'M'; if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'K'; return usd(n); }
  function num(n) { return n.toLocaleString('en-US'); }
  var AG = {
    dr: { name: 'Dana Reyes', ini: 'DR', av: 'av av-1', role: 'Agent' },
    mo: { name: 'Marcus Okafor', ini: 'MO', av: 'av av-2', role: 'Agent' },
    tw: { name: 'Tess Whitaker', ini: 'TW', av: 'av av-3', role: 'Agent' },
    jl: { name: 'Jordan Lee', ini: 'JL', av: 'av av-4', role: 'Sub-agent', parent: 'dr' },
    sk: { name: 'Sam Kowalski', ini: 'SK', av: 'av av-5', role: 'Sub-agent', parent: 'mo' },
    am: { name: 'Alex Morgan', ini: 'AM', av: 'av av-6', role: 'Manager / Admin' },
    lb: { name: 'Leah Brooks', ini: 'LB', av: 'av av-7', role: 'Onboarding Specialist' },
    oh: { name: 'Omar Haddad', ini: 'OH', av: 'av av-8', role: 'Support Rep' }
  };
  var ROLES = [
    { v: 'manager', label: 'Manager / Admin', user: 'am' },
    { v: 'agent', label: 'Sales Agent', user: 'dr' },
    { v: 'onboarding', label: 'Onboarding Specialist', user: 'lb' },
    { v: 'support', label: 'Support Rep', user: 'oh' }
  ];
  var NAV = [
    { k: 'home', label: 'Home', href: 'Main.dc.html', d: I.home, roles: 'manager agent onboarding support' },
    { k: 'leads', label: 'Leads', href: 'Leads.dc.html', d: I.leads, roles: 'manager agent', count: 24 },
    { k: 'deals', label: 'Deals', href: 'Deals.dc.html', d: I.deals, roles: 'manager agent' },
    { k: 'merchants', label: 'Merchants', href: 'Merchants.dc.html', d: I.store, roles: 'manager agent onboarding support' },
    { k: 'applications', label: 'Applications', href: 'Boarding.dc.html', d: I.app, roles: 'manager agent onboarding', count: 8 },
    { k: 'support', label: 'Support', href: 'Support.dc.html', d: I.support, roles: 'manager onboarding support', count: 12 },
    { k: 'chargebacks', label: 'Chargebacks', href: 'Chargebacks.dc.html', d: I.cb, roles: 'manager support', count: 3 },
    { k: 'reports', label: 'Reports', href: 'Reports.dc.html', d: I.reports, roles: 'manager agent onboarding support' },
    { k: 'residuals', label: 'Residuals', href: 'Residuals.dc.html', d: I.res, roles: 'manager agent' },
    { k: 'settings', label: 'Settings', href: 'Settings.dc.html', d: I.settings, roles: 'manager' }
  ];
  var M = [
    { id: 'hsc', dba: 'Harbor Street Coffee Co.', legal: 'Harbor Street Hospitality LLC', ein4: '4821', mid: '527104400128731', status: 'Live', mcc: '5812', ind: 'Restaurants', city: 'Portland, OR', vol: 84212.55, prev: 79904.10, txn: 6214, cbr: 0.03, owner: 'dr', contact: 'Maya Lindqvist', phone: '(503) 555-0142', email: 'maya@harborstreet.example', opened: 'Mar 3, 2024' },
    { id: 'hsp', dba: 'Harbor Street Coffee Co. – Pearl District', legal: 'Harbor Street Hospitality LLC', ein4: '4821', mid: '527104400133906', status: 'Live', mcc: '5812', ind: 'Restaurants', city: 'Portland, OR', vol: 61480.20, prev: 63002.75, txn: 4870, cbr: 0.00, owner: 'dr', contact: 'Maya Lindqvist', phone: '(503) 555-0187', email: 'pearl@harborstreet.example', opened: 'Aug 19, 2025' },
    { id: 'hsh', dba: 'Harbor Street Coffee Co. – Hawthorne', legal: 'Harbor Street Hospitality LLC', ein4: '4821', mid: '—', status: 'Boarding', mcc: '5812', ind: 'Restaurants', city: 'Portland, OR', vol: 0, prev: 0, txn: 0, cbr: null, owner: 'dr', contact: 'Maya Lindqvist', phone: '(503) 555-0119', email: 'hawthorne@harborstreet.example', opened: '—' },
    { id: 'mva', dba: 'Mesa Verde Auto Repair', legal: 'Mesa Verde Automotive Inc.', ein4: '7730', mid: '527104400109254', status: 'Live', mcc: '7538', ind: 'Auto service', city: 'Tucson, AZ', vol: 142906.40, prev: 138220.00, txn: 512, cbr: 0.78, owner: 'mo', contact: 'Ruben Alcaraz', phone: '(520) 555-0163', email: 'ruben@mesaverdeauto.example', opened: 'Nov 2, 2022' },
    { id: 'bpd', dba: 'Bluebird Pediatric Dental', legal: 'Bluebird Pediatric Dentistry PLLC', ein4: '0396', mid: '—', status: 'Boarding', mcc: '8021', ind: 'Dentists', city: 'Raleigh, NC', vol: 0, prev: 0, txn: 0, cbr: null, owner: 'tw', contact: 'Dr. Anika Shah', phone: '(919) 555-0124', email: 'office@bluebirddental.example', opened: '—' },
    { id: 'nhs', dba: 'Northline Hardware & Supply', legal: 'Northline Supply Co.', ein4: '5512', mid: '527104400097718', status: 'Live', mcc: '5251', ind: 'Hardware', city: 'Duluth, MN', vol: 118340.95, prev: 121877.60, txn: 2391, cbr: 0.04, owner: 'dr', contact: 'Gus Halvorsen', phone: '(218) 555-0171', email: 'gus@northlinehardware.example', opened: 'Jun 14, 2021' },
    { id: 'ckb', dba: 'Copper Kettle Bakery', legal: 'Copper Kettle Foods LLC', ein4: '2284', mid: '527104400141160', status: 'Live', mcc: '5462', ind: 'Bakeries', city: 'Asheville, NC', vol: 38215.70, prev: 35110.25, txn: 3302, cbr: 0.00, owner: 'jl', contact: 'Hannah Pruitt', phone: '(828) 555-0138', email: 'hello@copperkettle.example', opened: 'Jan 9, 2025' },
    { id: 'lyc', dba: 'Lakeshore Yoga Collective', legal: 'Lakeshore Wellness LLC', ein4: '9047', mid: '527104400122485', status: 'Live', mcc: '7997', ind: 'Clubs & fitness', city: 'Madison, WI', vol: 22480.00, prev: 22950.00, txn: 389, cbr: 0.26, owner: 'sk', contact: 'Priya Venkataraman', phone: '(608) 555-0156', email: 'studio@lakeshoreyoga.example', opened: 'Apr 22, 2024' },
    { id: 'gpo', dba: 'Granite Peak Outfitters', legal: 'Granite Peak Outdoor Co.', ein4: '6613', mid: '527104400115837', status: 'Live', mcc: '5941', ind: 'Sporting goods', city: 'Bozeman, MT', vol: 96720.35, prev: 74410.90, txn: 1142, cbr: 0.18, owner: 'mo', contact: 'Wes Thornbury', phone: '(406) 555-0149', email: 'wes@granitepeak.example', opened: 'Sep 30, 2023' },
    { id: 'sfp', dba: 'Saguaro Family Pharmacy', legal: 'Saguaro Health Partners LLC', ein4: '3158', mid: '—', status: 'Boarding', mcc: '5912', ind: 'Pharmacies', city: 'Mesa, AZ', vol: 0, prev: 0, txn: 0, cbr: null, owner: 'tw', contact: 'Elena Marquez', phone: '(480) 555-0192', email: 'elena@saguaropharmacy.example', opened: '—' },
    { id: 'dpg', dba: 'Driftwood Pet Grooming', legal: 'Driftwood Pets LLC', ein4: '8870', mid: '—', status: 'Prospect', mcc: '0742', ind: 'Veterinary & pet', city: 'Savannah, GA', vol: 0, prev: 0, txn: 0, cbr: null, owner: 'jl', contact: 'Corinne Baptiste', phone: '(912) 555-0110', email: 'corinne@driftwoodpets.example', opened: '—' },
    { id: 'oep', dba: 'Oak & Ember Pizzeria', legal: 'Oak and Ember Restaurant Group LLC', ein4: '1409', mid: '527104400088302', status: 'Live', mcc: '5812', ind: 'Restaurants', city: 'Columbus, OH', vol: 73905.15, prev: 71260.40, txn: 3928, cbr: 0.10, owner: 'dr', contact: 'Tony Castellano', phone: '(614) 555-0177', email: 'tony@oakandember.example', opened: 'May 5, 2022' },
    { id: 'rdc', dba: 'Riverbend Dry Cleaners', legal: 'Riverbend Garment Care Inc.', ein4: '7725', mid: '527104400064419', status: 'Closed', mcc: '7216', ind: 'Dry cleaning', city: 'Boise, ID', vol: 0, prev: 4120.00, txn: 0, cbr: 0.00, owner: 'sk', contact: 'Linda Osei', phone: '(208) 555-0133', email: 'linda@riverbendclean.example', opened: 'Feb 11, 2020' },
    { id: 'tms', dba: 'Tidewater Marine Supply', legal: 'Tidewater Marine Supply Corp.', ein4: '4402', mid: '527104400102077', status: 'Live', mcc: '5551', ind: 'Boat dealers', city: 'Norfolk, VA', vol: 201450.80, prev: 188730.15, txn: 874, cbr: 0.11, owner: 'mo', contact: 'Ray Delacroix', phone: '(757) 555-0108', email: 'ray@tidewatermarine.example', opened: 'Jul 18, 2021' }
  ];
  function mask(ein4) { return '••-•••' + ein4; }
  function rowKeys(e) {
    var k = e.key; if (k !== 'ArrowDown' && k !== 'ArrowUp' && k !== 'Home' && k !== 'End') return;
    var items = Array.prototype.slice.call(e.currentTarget.querySelectorAll('[data-nav]'));
    var i = items.indexOf(document.activeElement); if (i < 0 || !items.length) return;
    e.preventDefault();
    var j = k === 'Home' ? 0 : k === 'End' ? items.length - 1 : Math.max(0, Math.min(items.length - 1, i + (k === 'ArrowDown' ? 1 : -1)));
    items[j].focus();
  }
  function lineChart(vals, o) {
    var W = o.w || 560, H = o.h || 220, L = o.l == null ? 48 : o.l, R = o.r || 12, T = o.t || 14, B = o.b || 28;
    var min = o.min, max = o.max, n = o.n || vals.length;
    function sx(i) { return L + (W - L - R) * i / (n - 1); } function sy(v) { return T + (H - T - B) * (1 - (v - min) / (max - min)); }
    var pts = vals.map(function (v, i) { return { x: +sx(i).toFixed(1), y: +sy(v).toFixed(1) }; });
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p.x + ' ' + p.y; }).join(' ');
    var area = d + ' L' + pts[pts.length - 1].x + ' ' + (H - B) + ' L' + pts[0].x + ' ' + (H - B) + ' Z';
    var yt = []; for (var k = 0; k <= o.steps; k++) { var v = min + (max - min) * k / o.steps; yt.push({ y: +sy(v).toFixed(1), ty: +sy(v).toFixed(1) + 4, label: o.fmt(v), x: L - 8, x1: L, x2: W - R, lp: +((L - 8) / W * 100).toFixed(2), tp: +(sy(v) / H * 100).toFixed(2) }); }
    var xt = (o.labels || []).map(function (l, i) { return { x: +sx(i).toFixed(1), y: H - 8, label: l, lp: +(sx(i) / W * 100).toFixed(2), tp: +((H - 12) / H * 100).toFixed(2) }; });
    return { d: d, area: area, pts: pts, yt: yt, xt: xt, vb: '0 0 ' + W + ' ' + H, sx: sx, sy: sy };
  }
  function bars(series, o) {
    var W = o.w || 560, H = o.h || 220, L = o.l == null ? 48 : o.l, R = o.r || 8, T = o.t || 14, B = o.b || 28, max = o.max, n = series.length;
    var slot = (W - L - R) / n, pair = series[0].v2 != null, bw = Math.min(o.bw || 28, slot * (pair ? 0.34 : 0.58));
    function sy(v) { return T + (H - T - B) * (1 - v / max); }
    var out = series.map(function (s, i) {
      var cx = L + slot * i + slot / 2, x1 = pair ? cx - bw - 1 : cx - bw / 2;
      return { x: +x1.toFixed(1), y: +sy(s.v).toFixed(1), w: +bw.toFixed(1), h: +((H - B) - sy(s.v)).toFixed(1),
        x2: +(cx + 1).toFixed(1), y2: pair ? +sy(s.v2).toFixed(1) : 0, h2: pair ? +((H - B) - sy(s.v2)).toFixed(1) : 0,
        lx: +cx.toFixed(1), ly: H - 8, label: s.label, cls: s.cls || 'b1', tv: s.tv || '', ty: +(sy(s.v) - 6).toFixed(1),
        lp: +(cx / W * 100).toFixed(2), ltp: +((H - 12) / H * 100).toFixed(2) };
    });
    var yt = []; for (var k = 0; k <= o.steps; k++) { var v = max * k / o.steps; yt.push({ y: +sy(v).toFixed(1), ty: +sy(v).toFixed(1) + 4, label: o.fmt(v), x: L - 8, x1: L, x2: W - R, lp: +((L - 8) / W * 100).toFixed(2), tp: +(sy(v) / H * 100).toFixed(2) }); }
    return { bars: out, yt: yt, vb: '0 0 ' + W + ' ' + H, base: H - B };
  }
  function agent(id) { return AG[id] || AG.am; }
  function roleOf(v) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].v === v) return ROLES[i]; return ROLES[0]; }
  function canSee(role, ownerId) { if (role !== 'agent') return true; return ownerId === 'dr' || ownerId === 'jl'; }
  return { I: I, PI: PI, TONE: TONE, pill: pill, usd: usd, usd0: usd0, short: short, num: num, AG: AG, agent: agent, ROLES: ROLES, roleOf: roleOf, NAV: NAV, M: M, mask: mask, rowKeys: rowKeys, lineChart: lineChart, bars: bars, canSee: canSee };
})();
