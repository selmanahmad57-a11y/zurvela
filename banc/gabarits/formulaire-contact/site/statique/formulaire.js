// Envoi du formulaire de contact en JSON, sans rechargement de page.
// Aucun texte ici : les messages visibles sont pré-rendus dans la page.
(function () {
  const formulaire = document.querySelector('form[data-role="formulaire-contact"]');
  if (!formulaire) {
    return;
  }
  const bouton = formulaire.querySelector('[data-role="envoyer"]');
  if (!bouton) {
    return;
  }

  function afficherErreur(formulaire, bouton) {
    /* @bloc:gestion-erreur */
    const zone = formulaire.querySelector('[data-role="message-erreur"]');
    if (zone) {
      zone.hidden = false;
    }
    bouton.disabled = false;
    bouton.removeAttribute('aria-busy');
    /* @fin-bloc:gestion-erreur */
  }

  formulaire.addEventListener('submit', function (evenement) {
    evenement.preventDefault();
    bouton.disabled = true;
    bouton.setAttribute('aria-busy', 'true');
    const donnees = Object.fromEntries(new FormData(formulaire));
    fetch(formulaire.action, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(donnees),
    })
      .then(function (reponse) {
        if (reponse.ok) {
          window.location.assign(formulaire.dataset.urlConfirmation);
          return;
        }
        afficherErreur(formulaire, bouton);
      })
      .catch(function () {
        afficherErreur(formulaire, bouton);
      });
  });
})();
