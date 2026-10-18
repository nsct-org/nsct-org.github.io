(() => {
  const root = document.documentElement;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduce) root.classList.add("motion");

  // Intro: plays every time the home page opens; click or any key skips it
  const intro = document.querySelector(".intro");
  if (intro) {
    if (reduce) intro.remove();
    else {
      root.classList.add("intro-on"); intro.classList.add("run");
      // Natural end: only remove the overlay. The hero's rise animations are still mid-way at this point
      // and their delays depend on .intro-on, so the class must stay or they jump to the end.
      const finish = () => { intro.remove(); removeEventListener("keydown", skip); };
      // Skip: drop .intro-on so the hero animations start right away instead of waiting out the intro
      const skip = () => {
        clearTimeout(t); finish(); root.classList.remove("intro-on");
        root.classList.remove("motion"); void root.offsetWidth; root.classList.add("motion"); // restart from the first frame
      };
      const t = setTimeout(finish, 2800);
      intro.addEventListener("click", skip);
      addEventListener("keydown", skip, { once: true });
    }
  }

  // News ticker: duplicate the items once so the scroll loops seamlessly (copies hidden from screen readers)
  const track = document.querySelector(".ticker-track");
  if (track) {
    for (const li of [...track.children]) {
      const c = li.cloneNode(true); c.setAttribute("aria-hidden", "true");
      c.querySelectorAll("a").forEach(a => a.tabIndex = -1); track.append(c);
    }
    const ticker = track.closest(".ticker"), tbtn = ticker.querySelector(".ticker-toggle");
    tbtn?.addEventListener("click", () => {
      const paused = ticker.classList.toggle("paused");
      tbtn.setAttribute("aria-pressed", String(paused));
      tbtn.setAttribute("aria-label", paused ? "เล่นแถบข่าวต่อ" : "หยุดแถบข่าว");
    });
  }

  // Page transitions: curtain rises over the page, then the next page's curtain lifts off.
  // With reduced motion the page just fades out quickly instead.
  const curtain = document.querySelector(".curtain");
  document.addEventListener("click", e => {
    const a = e.target.closest("a[href]");
    if (!a || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (a.target === "_blank" || a.hasAttribute("download")) return;
    const url = new URL(a.href, location.href);
    if (url.origin !== location.origin || !/\.html$|\/$/.test(url.pathname)) return;
    if (url.pathname === location.pathname && url.hash) return; // in-page anchor
    e.preventDefault();
    let gone = false;
    const go = () => { if (!gone) { gone = true; location.href = url.href; } };
    if (reduce || !curtain) { document.body.classList.add("fade-out"); setTimeout(go, 180); return; }
    curtain.classList.add("leave");
    curtain.addEventListener("animationend", go, { once: true });
    setTimeout(go, 700); // in case animationend never fires
  });
  addEventListener("pageshow", e => { // coming back via the back button: uncover the page
    if (e.persisted) { curtain?.classList.remove("leave"); document.body.classList.remove("fade-out"); }
  });

  // Header turns solid after scrolling
  const header = document.querySelector(".site-header");
  const onScroll = () => header && header.classList.toggle("solid", scrollY > 24);
  onScroll(); addEventListener("scroll", onScroll, { passive: true });

  // Mobile menu
  const btn = document.querySelector(".menu-btn"), nav = document.querySelector(".nav");
  if (btn && nav) {
    btn.addEventListener("click", () => {
      const open = btn.getAttribute("aria-expanded") !== "true";
      btn.setAttribute("aria-expanded", String(open)); nav.classList.toggle("open", open);
    });
    nav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => { btn.setAttribute("aria-expanded", "false"); nav.classList.remove("open"); }));
  }

  // Scroll reveal (elements start visible if motion is off or IntersectionObserver is missing)
  const reveals = document.querySelectorAll(".reveal, .timeline");
  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(entries => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }, { threshold: .15, rootMargin: "0px 0px -40px 0px" });
    reveals.forEach(el => io.observe(el));
  } else {
    reveals.forEach(el => el.classList.add("in"));
  }

  // Record spins while the music section is on screen (touch devices have no hover)
  const record = document.querySelector(".record");
  if (record && !reduce && "IntersectionObserver" in window) {
    new IntersectionObserver(([e]) => record.classList.toggle("playing", e.isIntersecting), { threshold: .5 }).observe(record);
  }

  // Toast + copy email
  const toast = (msg) => {
    let t = document.querySelector(".toast");
    if (!t) { t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); document.body.append(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
  };
  document.querySelectorAll("[data-copy]").forEach(b => b.addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(b.dataset.copy); toast("คัดลอกอีเมลแล้ว"); }
    catch { toast(b.dataset.copy); }
  }));

  // Contact form: compose an email in the visitor's mail app
  const form = document.querySelector("#contact-form");
  if (form) form.addEventListener("submit", e => {
    e.preventDefault();
    const f = new FormData(form);
    const subject = `[${f.get("topic")}] จาก ${f.get("name")}`;
    const body = `${f.get("message")}\n\n— ${f.get("name")}${f.get("reply") ? " (" + f.get("reply") + ")" : ""}`;
    location.href = `mailto:nsct.org@gmail.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    toast("กำลังเปิดแอปอีเมลของคุณ");
  });

  // Content page: Netflix-style rows built from videos.js
  const rowsEl = document.querySelector("#rows");
  if (rowsEl && window.NSCT_VIDEOS) {
    const all = window.NSCT_VIDEOS;
    const latestDay = all.reduce((m, v) => v.published > m ? v.published : m, "").slice(0, 10);
    const top = all.filter(v => v.short && v.cat !== "poll").sort((a, b) => b.views - a.views).slice(0, 10);
    const topIds = new Set(top.map(v => v.id));
    const partNo = v => +(v.title.match(/Part (\d+)/) || [0, 0])[1];
    const byPart = list => list.slice().sort((a, b) => partNo(a) - partNo(b));
    const url = v => v.short ? `https://www.youtube.com/shorts/${v.id}` : `https://www.youtube.com/watch?v=${v.id}`;
    const pl = id => `https://www.youtube.com/playlist?list=${id}`;
    // Thumbnails whose picture sits inside black bars (measured from maxresdefault): clip the bars off
    // and fill the card with a blurred copy instead. Values are clip-path insets (top right bottom left).
    const LETTERBOX = { bYtgoJgnEew: "0 22% 0 22%", "Ac-6oH6XU9M": "30% 0 30% 0" };
    const ICON_PLAY ='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';

    const badgeFor = (v, inTopRow) => {
      if (v.cat === "poll") return ["โหวตเลย", "hot"];
      if (v.published.slice(0, 10) === latestDay) return ["เพิ่มใหม่ล่าสุด", "hot"];
      if (!inTopRow && topIds.has(v.id)) return ["TOP 10", "top"];
      if (v.full || !v.short) return ["คลิปเต็ม", ""]; // every horizontal video, incl. the intro and the full song
      return null;
    };
    const card = (v, { rank, wide } = {}) => {
      const a = document.createElement("a");
      a.className = "tile" + (wide ? " wide" : " tall") + (rank ? " ranked" : "");
      a.href = url(v); a.target = "_blank"; a.rel = "noopener";
      // wide: 16:9 maxres (hqdefault is 4:3 with black bars); tall: the Shorts' own 9:16 frame
      const img = `https://i.ytimg.com/vi/${v.id}/${wide ? "maxresdefault" : "oardefault"}.jpg`;
      a.innerHTML = (rank ? `<span class="rank" aria-hidden="true">${rank}</span>` : "") +
        `<span class="poster"><img loading="lazy" alt="" src="${img}"><span class="shade"></span><span class="play">${ICON_PLAY}</span><span class="cap"></span></span>`;
      a.querySelector(".cap").textContent = v.title;
      if (wide && LETTERBOX[v.id]) {
        const fg = a.querySelector("img"), bg = fg.cloneNode();
        bg.className = "blur-bg"; fg.classList.add("lb-fg"); fg.style.clipPath = `inset(${LETTERBOX[v.id]})`;
        fg.before(bg);
      }
      // YouTube answers a missing vertical thumbnail with a tiny grey placeholder instead of an error
      const im = a.querySelector("img");
      im.addEventListener("load", () => {
        if (im.naturalWidth >= 200) return;
        if (wide) im.src = `https://i.ytimg.com/vi/${v.id}/mqdefault.jpg`; // 16:9, smaller
        else { a.classList.add("no-oar"); im.src = `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`; }
      }, { once: true });
      a.setAttribute("aria-label", (rank ? `อันดับ ${rank} ` : "") + v.title);
      const b = badgeFor(v, !!rank);
      if (b) { const s = document.createElement("span"); s.className = "badge " + b[1]; s.textContent = b[0]; a.querySelector(".poster").append(s); }
      return a;
    };
    const row = (title, items, opts = {}) => {
      if (!items.length) return;
      const sec = document.createElement("section");
      sec.className = "row reveal";
      sec.innerHTML = `<div class="wrap row-head"><h2></h2>${opts.note ? '<span class="warn"></span>' : ""}${opts.more ? '<a class="more" target="_blank" rel="noopener">ดูทั้งหมด ›</a>' : ""}</div><div class="rail-wrap"><button class="nav-btn prev" type="button" aria-label="เลื่อนซ้าย">‹</button><div class="rail"></div><button class="nav-btn next" type="button" aria-label="เลื่อนขวา">›</button></div>`;
      sec.querySelector("h2").textContent = title;
      if (opts.note) sec.querySelector(".warn").textContent = opts.note;
      if (opts.more) sec.querySelector(".more").href = opts.more;
      const rail = sec.querySelector(".rail");
      items.forEach((v, i) => rail.append(card(v, { rank: opts.ranked ? i + 1 : 0, wide: opts.wide || !v.short })));
      const step = () => rail.clientWidth * .85;
      sec.querySelector(".prev").addEventListener("click", () => rail.scrollBy({ left: -step(), behavior: reduce ? "auto" : "smooth" }));
      sec.querySelector(".next").addEventListener("click", () => rail.scrollBy({ left: step(), behavior: reduce ? "auto" : "smooth" }));
      rowsEl.append(sec);
    };

    rowsEl.replaceChildren();
    row("Top 10 Shorts ของ ศนท. วันนี้", top, { ranked: true });
    // every horizontal video: full clips first, then the landscape channel intro, then the full song
    const wideOrder = v => v.full ? 0 : v.cat === "intro" ? 1 : 2;
    row("คลิปเต็ม", all.filter(v => !v.short).sort((a, b) => wideOrder(a) - wideOrder(b)), { wide: true });
    row("ซีรีส์ 6 ตุลา 2519", byPart(all.filter(v => v.cat === "oct6" && v.short)), { note: "มีภาพเหตุการณ์จริงที่แสดงความรุนแรง", more: pl("PLSsvtX7GmfA8") });
    row("ซีรีส์ 14 ตุลา 2516", byPart(all.filter(v => v.cat === "oct14" && v.short)), { more: pl("PLM0Q34zogMUI") });
    row("ร่วมแสดงความเห็น", all.filter(v => v.cat === "poll"));
    row("NSCT Music", all.filter(v => v.cat === "music").sort((a, b) => a.short - b.short), { wide: true, more: pl("PLZ_5bGJRwCBQ") });
    row("รู้จัก ศนท.", byPart(all.filter(v => (v.cat === "journey" || v.cat === "intro") && !v.full)), { more: pl("PLUQLa3VCWaps") });
    rowsEl.querySelectorAll(".reveal").forEach(el => el.classList.add("in"));
  }

  const y = document.querySelector("[data-year]");
  if (y) y.textContent = new Date().getFullYear() + 543;
})();
