export default class ToastService {
    /**
     * Affiche un toast dans le navigateur
     * @param {string} message - Message à afficher
     * @param {object} options - Options : type ('info'|'success'|'error'), duration (ms)
     */
    static show(message, { type = 'info', duration = 3000 } = {}) {
      // Créer le conteneur s'il n'existe pas
      let container = document.getElementById('toast-container');
      if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.position = 'fixed';
        container.style.top = '20px';
        container.style.right = '20px';
        container.style.zIndex = 9999;
        container.style.display = 'flex';
        container.style.flexDirection = 'column';
        container.style.gap = '10px';
        document.body.appendChild(container);
      }
  
      // Créer le toast
      const toast = document.createElement('div');
      toast.innerHTML = message;
      toast.style.padding = '10px 15px';
      toast.style.borderRadius = '5px';
      toast.style.color = '#fff';
      toast.style.minWidth = '200px';
      toast.style.maxWidth = '350px';
      toast.style.boxShadow = '0 2px 6px rgba(0,0,0,0.2)';
      toast.style.opacity = '0';
      toast.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      toast.style.transform = 'translateX(100%)';
      
      // Définir la couleur selon le type
      switch (type) {
        case 'success': toast.style.backgroundColor = '#4caf50'; break;
        case 'error': toast.style.backgroundColor = '#f44336'; break;
        default: toast.style.backgroundColor = '#2196f3'; break;
      }
  
      container.appendChild(toast);
  
      // Animation d'entrée
      requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(0)';
      });
  
      // Retirer le toast après le délai
      setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(100%)';
        toast.addEventListener('transitionend', () => toast.remove());
      }, duration);
    }
  }
  