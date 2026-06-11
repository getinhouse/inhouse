// Inhouse landing — scroll reveals, the greeting type-on, orb parallax.
// No dependencies, no network calls, nothing measured. Obviously.

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// --- scroll reveals -------------------------------------------------------
const revealables = document.querySelectorAll('.reveal, .reveal-line');
if (reduced) {
  revealables.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver(
    (entries) => entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }),
    { threshold: 0.25 },
  );
  revealables.forEach((el) => io.observe(el));
}

// --- the greeting types itself when it enters view ------------------------
const target = document.querySelector('.type-target');
if (target) {
  const text = target.dataset.text || '';
  if (reduced) {
    target.textContent = text;
  } else {
    let started = false;
    const io = new IntersectionObserver((entries) => {
      if (!entries[0].isIntersecting || started) return;
      started = true;
      io.disconnect();
      let i = 0;
      const tick = () => {
        target.textContent = text.slice(0, ++i);
        if (i < text.length) {
          // a human-ish cadence: brief pauses after punctuation
          const ch = text[i - 1];
          setTimeout(tick, '—.,'.includes(ch) ? 260 : 34);
        }
      };
      setTimeout(tick, 600);
    }, { threshold: 0.6 });
    io.observe(target);
  }
}

// --- hero orb: gentle pointer parallax + scroll fade ----------------------
const orb = document.querySelector('.orb');
const glow = document.querySelector('.orb-glow');
if (orb && !reduced) {
  addEventListener('pointermove', (e) => {
    const dx = (e.clientX / innerWidth - 0.5) * 18;
    const dy = (e.clientY / innerHeight - 0.5) * 14;
    orb.style.translate = `${dx}px ${dy}px`;
    glow.style.translate = `${dx * 0.5}px ${dy * 0.5}px`;
  }, { passive: true });
  addEventListener('scroll', () => {
    const fade = Math.max(0, 1 - scrollY / (innerHeight * 0.9));
    orb.style.opacity = fade;
    glow.style.opacity = fade;
  }, { passive: true });
}
