document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('.accordion-section');
    if (!sections.length) return;
  
    // ─── Fonctions d'ouverture/fermeture ───
    const openSection = (section) => {
      const header = section.querySelector('.accordion-header');
      const body = section.querySelector('.accordion-body');
      header.classList.add('open');
      body.classList.add('open');
    };
  
    const closeSection = (section) => {
      const header = section.querySelector('.accordion-header');
      const body = section.querySelector('.accordion-body');
      header.classList.remove('open');
      body.classList.remove('open');
    };
  
    // 1️⃣ Ouvrir la première section par défaut
    openSection(sections[0]);
  
    // 2️⃣ Clic manuel sur un header
    sections.forEach(section => {
      const header = section.querySelector('.accordion-header');
      header.addEventListener('click', () => {
        const isOpen = header.classList.contains('open');
  
        if (isOpen) {
          closeSection(section);
        } else {
          // fermer toutes les autres
          sections.forEach(sec => closeSection(sec));
          openSection(section);
        }
      });
    });
  
    // 3️⃣ Auto-avancement quand toutes les questions d’une section sont remplies
    const isSectionComplete = (section) => {
      const inputs = section.querySelectorAll('input, select, textarea');
      for (const input of inputs) {
        if (input.type === 'checkbox' || input.type === 'radio') {
          const name = input.name;
          const checked = section.querySelectorAll(`input[name="${name}"]:checked`);
          if (!checked.length) return false;
        } else if (!input.value) {
          return false;
        }
      }
      return true;
    };
  
    sections.forEach((section, index) => {
      const inputs = section.querySelectorAll('input, select, textarea');
      inputs.forEach(input => {
        input.addEventListener('change', () => {
          if (isSectionComplete(section)) {
            closeSection(section);
  
            const nextSection = sections[index + 1];
            if (nextSection) {
              openSection(nextSection);
              nextSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }
          }
        });
      });
    });
  });
  