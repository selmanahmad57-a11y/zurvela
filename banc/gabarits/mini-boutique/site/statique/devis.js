// Envoi du formulaire de demande de devis en JSON, sans rechargement de page.
// Aucun texte ici : les messages visibles sont pré-rendus dans la page.
(function () {
  const formulaire = document.querySelector('form[data-role="formulaire-devis"]');
  if (!formulaire) {
    return;
  }
  const bouton = formulaire.querySelector('[data-role="devis-envoyer"]');
  if (!bouton) {
    return;
  }

  function afficher(formulaire, role) {
    const zone = formulaire.querySelector('[data-role="' + role + '"]');
    if (zone) {
      zone.hidden = false;
    }
  }

  function afficherErreur(formulaire, bouton) {
    /* @bloc:gestion-erreur */
    afficher(formulaire, 'message-erreur');
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
          afficher(formulaire, 'message-confirmation');
          bouton.removeAttribute('aria-busy');
          return;
        }
        afficherErreur(formulaire, bouton);
      })
      .catch(function () {
        afficherErreur(formulaire, bouton);
      });
  });
})();
