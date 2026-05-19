export function initCollageEffects(): void {
  const root = document.documentElement;
  const MAX_EYEBROW = 2.923;
  const MIN_EYEBROW = 0.35;
  const MAX_TITLE = 0.63;
  const MIN_TITLE = 0.2;
  const MIN_GLASS_ALPHA = 0.03;
  const MAX_GLASS_ALPHA = 0.35;
  const MIN_GLASS_BLUR = 2;
  const MAX_GLASS_BLUR = 18;

  let ticking = false;

  const update = () => {
    const doc = document.documentElement;
    const scrollTop = window.scrollY || doc.scrollTop || 0;
    const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
    const t = Math.min(1, Math.max(0, scrollTop / maxScroll));
    const glassT = Math.pow(t, 2.2);

    const eyebrow = MAX_EYEBROW - (MAX_EYEBROW - MIN_EYEBROW) * t;
    const title = MAX_TITLE - (MAX_TITLE - MIN_TITLE) * t;
    const glassAlpha = MIN_GLASS_ALPHA + (MAX_GLASS_ALPHA - MIN_GLASS_ALPHA) * glassT;
    const glassBlur = MIN_GLASS_BLUR + (MAX_GLASS_BLUR - MIN_GLASS_BLUR) * glassT;

    root.style.setProperty('--collage-letter-space', `${eyebrow.toFixed(3)}em`);
    root.style.setProperty('--collage-letter-space-title', `${title.toFixed(3)}em`);
    root.style.setProperty('--collage-glass-alpha', `${glassAlpha.toFixed(3)}`);
    root.style.setProperty('--collage-glass-blur', `${glassBlur.toFixed(1)}px`);
  };

  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      update();
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', update);
  update();
}
