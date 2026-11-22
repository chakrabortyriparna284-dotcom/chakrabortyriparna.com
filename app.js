document.addEventListener("DOMContentLoaded", () => {
  const liquidGlass = typeof window.initLiquidGlass === "function" ? window.initLiquidGlass() : null;

  const hudNav = document.getElementById("hudNav");
  const heroBackdrop = document.getElementById("heroBackdrop");
  const giantVi = document.getElementById("giantVi");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const handleScroll = () => {
    const y = window.scrollY || window.pageYOffset;
    if (hudNav) {
      const wasScrolled = hudNav.classList.contains("scrolled");
      const nowScrolled = y > 24;
      hudNav.classList.toggle("scrolled", nowScrolled);
      if (nowScrolled !== wasScrolled && liquidGlass) {
        liquidGlass.scheduleRender();
      }
    }
    if (!prefersReducedMotion && y < window.innerHeight * 1.2) {
      if (heroBackdrop) {
        heroBackdrop.style.transform = `translate3d(0, ${y * 0.16}px, 0)`;
      }
      if (giantVi) {
        giantVi.style.transform = `translate(-50%, calc(-52% + ${y * 0.12}px))`;
      }
    }
  };

  window.addEventListener("scroll", handleScroll, { passive: true });
  handleScroll();

  const revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !prefersReducedMotion) {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14, rootMargin: "0px 0px -40px 0px" }
    );
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add("is-visible"));
  }

  const vibeToggle = document.getElementById("vibeToggle");
  const vibeLabel = document.getElementById("vibeLabel");

  if (vibeToggle && vibeLabel) {
    vibeToggle.addEventListener("click", () => {
      const isMidnight = document.body.classList.toggle("theme-midnight");
      vibeLabel.textContent = isMidnight ? "MIDNIGHT HEIST" : "VICE SUNSET";
      if (liquidGlass) {
        liquidGlass.refreshTheme(isMidnight);
      }
    });
  }

  const wantedWrap = document.getElementById("wantedStars");
  if (wantedWrap) {
    const stars = Array.from(wantedWrap.querySelectorAll(".star"));
    let level = 5;

    const renderStars = (count) => {
      stars.forEach((star, idx) => {
        star.classList.toggle("active", idx < count);
      });
    };

    const cycleStars = () => {
      level = level >= 5 ? 1 : level + 1;
      renderStars(level);
    };

    wantedWrap.addEventListener("click", cycleStars);
    wantedWrap.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        cycleStars();
      }
    });
  }

  document.querySelectorAll(".mission-card").forEach((card) => {
    const buttons = card.querySelectorAll(".tab-btn");
    const panels = card.querySelectorAll(".tab-panel");

    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const targetId = btn.getAttribute("data-target");
        buttons.forEach((b) => b.classList.remove("active"));
        panels.forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        const targetPanel = card.querySelector(`#${targetId}`);
        if (targetPanel) targetPanel.classList.add("active");
      });
    });
  });

  const filterChips = document.querySelectorAll(".filter-chip");
  const statCards = document.querySelectorAll(".stat-card");

  filterChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const filter = chip.getAttribute("data-filter");
      filterChips.forEach((c) => c.classList.remove("active"));
      chip.classList.add("active");

      statCards.forEach((card) => {
        const category = card.getAttribute("data-category");
        const shouldShow = filter === "all" || category === filter;
        card.classList.toggle("hidden", !shouldShow);
        if (shouldShow) {
          card.classList.add("is-visible");
        }
      });
    });
  });
});
