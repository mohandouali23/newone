// export default class SessionCleanupUtils {

//     static isEmptyValue(value) {
//       if (value === null || value === undefined) return true;
  
//       if (typeof value === 'string') return value.trim() === '';
  
//       if (Array.isArray(value)) return value.length === 0;
  
//       if (typeof value === 'object') {
//         return Object.keys(value).length === 0;
//       }
  
//       return false;
//     }
  
//     static cleanObject(obj, options = {}) {
//       const {
//         removeKeys = ['_action']
//       } = options;
  
//       if (!obj || typeof obj !== 'object') return obj;
  
//       Object.keys(obj).forEach(key => {
//         const value = obj[key];
  
//         // supprimer clés techniques
//         if (removeKeys.includes(key)) {
//           delete obj[key];
//           return;
//         }
  
//         // nettoyage récursif
//         if (typeof value === 'object') {
//           this.cleanObject(value, options);
//         }
  
//         // supprimer valeur vide
//         if (this.isEmptyValue(obj[key])) {
//           delete obj[key];
//         }
//       });
  
//       return obj;
//     }
//   }
  