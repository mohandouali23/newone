// document.addEventListener('DOMContentLoaded', function () {

//   document.querySelectorAll('.question-block').forEach(block => {

//     const checkboxes = block.querySelectorAll('input[type=checkbox]');
//     if (!checkboxes.length) return;

//     const name = checkboxes[0].name.replace(/\[\]$/, '');

//     function hidePrecision(value) {
//       const input = block.querySelector(
//         `input[name="precision_${name}_${value}"]`
//       );
//       if (input) input.style.display = 'none';
//     }

//     checkboxes.forEach(cb => {

//       cb.addEventListener('change', function () {

//         const isExclusive = this.dataset.exclusive === 'true';

//         /* ---------- Sous-questions ---------- */
//         const subQ = block.querySelector(
//           `.sub-questions[data-parent="${this.value}"]`
//         );
//         if (subQ) {
//           subQ.style.display = this.checked ? 'block' : 'none';
//         }

//         /* ---------- option exclusive cochée ---------- */
//         if (isExclusive && this.checked) {
//           checkboxes.forEach(other => {
//             if (other === this) return;

//             other.checked = false;
//             other.disabled = true;

//             hidePrecision(other.value);

//             const otherSub = block.querySelector(
//               `.sub-questions[data-parent="${other.value}"]`
//             );
//             if (otherSub) otherSub.style.display = 'none';
//           });
//         }

//         /* ---------- option exclusive décochée ---------- */
//         if (isExclusive && !this.checked) {
//           checkboxes.forEach(other => {
//             if (other !== this) {
//               other.disabled = false;
//             }
//           });
//         }

//         /* ---------- option NON exclusive cochée ---------- */
//         if (!isExclusive && this.checked) {
//           checkboxes.forEach(other => {
//             if (other.dataset.exclusive === 'true') {
//               other.checked = false;
//               other.disabled = true;
//               hidePrecision(other.value);
//             }
//           });
//         }

//         /* ---------- aucune option exclusive sélectionnée ---------- */
//         const hasExclusiveChecked = [...checkboxes].some(
//           c => c.dataset.exclusive === 'true' && c.checked
//         );

//         if (!hasExclusiveChecked) {
//           checkboxes.forEach(c => c.disabled = false);
//         }
//       });

//       /* ---------- Initialisation (reload page) ---------- */
//       if (cb.checked) {
//         const subQ = block.querySelector(
//           `.sub-questions[data-parent="${cb.value}"]`
//         );
//         if (subQ) subQ.style.display = 'block';
//       }
//     });

//     /* ---------- Réinitialisation exclusive au chargement ---------- */
//     const exclusiveChecked = [...checkboxes].find(
//       cb => cb.dataset.exclusive === 'true' && cb.checked
//     );

//     if (exclusiveChecked) {
//       checkboxes.forEach(other => {
//         if (other === exclusiveChecked) return;

//         other.checked = false;
//         other.disabled = true;
//         hidePrecision(other.value);

//         const otherSub = block.querySelector(
//           `.sub-questions[data-parent="${other.value}"]`
//         );
//         if (otherSub) otherSub.style.display = 'none';
//       });
//     }

//   });
// });
