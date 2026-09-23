/**
 * TEST DE FORME des listes de `config/actions-interdites.json`, langue par
 * langue (APPRENTISSAGES n°5 : une configuration que rien n'exécute n'est pas
 * vérifiée — et une liste que rien ne confronte à ses voisines n'est pas
 * comparée).
 *
 * Il ne teste pas le CODE du filtre (c'est le rôle de `filtre-actions.test.ts`
 * et de ses motifs factices) : il teste la COUVERTURE des listes réelles. La
 * revue de la brique 4b a montré pourquoi c'était nécessaire — un bouton
 * « Valider la commande » passait en français alors que son équivalent
 * « Confirm order » était arrêté en anglais, parce que le motif français
 * « commander » est un mot unique apparié en PRÉFIXE de token et que le token
 * de la page, « commande », est plus court. L'asymétrie a vécu deux briques
 * sans que rien ne la dise : aucun test ne confrontait les langues entre elles.
 *
 * La règle qu'il impose : pour chaque SITUATION du marché (valider une
 * commande, supprimer un compte, se désabonner…), toutes les langues déclarées
 * doivent arrêter leurs libellés équivalents, avec la MÊME catégorie. Une
 * langue qui laisse passer ce qu'une autre arrête est un trou, pas une nuance.
 *
 * Les libellés ci-dessous sont des DONNÉES DE TEST, pas des motifs : ils
 * n'entrent dans aucune détection (constitution §2, qui interdit les motifs de
 * langue naturelle dans le CODE, pas les jeux d'épreuve d'une liste de config).
 */
import { beforeAll, describe, expect, it } from 'vitest';
import { chargerActionsInterdites, type ActionsInterdites } from '../config.js';
import { apparier } from './filtre-actions.js';

/** Une situation du marché, et le libellé qu'elle porte dans chaque langue de la config. */
interface Situation {
  nom: string;
  categorie: string;
  libelles: Record<string, string[]>;
}

/**
 * Jeu de libellés ÉQUIVALENTS. Chaque entrée dit la même chose dans les six
 * langues des marchés de lancement, dans les formulations les plus banales du
 * commerce en ligne — celles qu'un site écrit sans y penser.
 */
const SITUATIONS: Situation[] = [
  {
    nom: 'valider une commande',
    categorie: 'paiement',
    libelles: {
      fr: ['Valider la commande', 'Valider ma commande', 'Passer commande', 'Finaliser ma commande', 'Valider mon panier'],
      en: ['Confirm order', 'Place order', 'Submit order', 'Complete order', 'Confirm my order'],
      es: ['Confirmar pedido', 'Realizar pedido', 'Validar pedido', 'Enviar pedido', 'Finalizar el pedido'],
      de: ['Jetzt bestellen', 'Bestellung abschicken', 'Bestellung bestätigen', 'Bestellung aufgeben', 'Kostenpflichtig bestellen'],
      it: ['Conferma ordine', "Conferma l'ordine", 'Invia ordine', 'Ordina ora', "Completa l'ordine"],
      pt: ['Confirmar pedido', 'Fazer pedido', 'Enviar pedido', 'Concluir pedido', 'Finalizar o pedido'],
    },
  },
  {
    nom: 'payer',
    categorie: 'paiement',
    libelles: {
      fr: ['Payer', 'Payer maintenant', 'Procéder au paiement', 'Finaliser le paiement'],
      en: ['Pay', 'Pay now', 'Checkout', 'Proceed to payment'],
      es: ['Pagar', 'Pagar ahora', 'Proceder al pago', 'Confirmar el pago'],
      de: ['Bezahlen', 'Jetzt bezahlen', 'Zur Kasse', 'Zahlung bestätigen'],
      it: ['Paga', 'Paga ora', 'Procedi al pagamento', 'Conferma il pagamento'],
      pt: ['Pagar', 'Pagar agora', 'Confirmar pagamento', 'Ir para o pagamento'],
    },
  },
  {
    nom: 'supprimer un compte',
    categorie: 'destruction',
    libelles: {
      fr: ['Supprimer mon compte', 'Supprimer le compte', 'Fermer mon compte'],
      en: ['Delete my account', 'Delete account', 'Close account'],
      es: ['Eliminar mi cuenta', 'Cerrar cuenta', 'Desactivar cuenta'],
      de: ['Konto löschen', 'Konto schließen', 'Konto deaktivieren'],
      it: ['Elimina account', 'Chiudi account', 'Disattiva account'],
      pt: ['Excluir conta', 'Encerrar conta', 'Desativar conta'],
    },
  },
  {
    nom: 'se désabonner',
    categorie: 'engagement',
    libelles: {
      fr: ["Annuler l'abonnement", 'Se désabonner', 'Résilier'],
      en: ['Cancel subscription', 'Unsubscribe', 'Terminate'],
      es: ['Cancelar suscripción', 'Darse de baja', 'Suscribirse'],
      de: ['Abo kündigen', 'Abbestellen', 'Kündigen'],
      it: ['Annulla abbonamento', 'Disiscriviti', 'Disdici'],
      pt: ['Cancelar assinatura', 'Cancelar inscrição', 'Assinar'],
    },
  },
];

let actionsInterdites: ActionsInterdites;

beforeAll(async () => {
  actionsInterdites = await chargerActionsInterdites();
});

/** Le seul canal éprouvé ici est le LANGAGE HUMAIN : ni URL ni identifiant ne doivent sauver le libellé. */
function verdictTexte(libelle: string): ReturnType<typeof apparier> {
  return apparier({ texte: [libelle], url: [], identifiant: [] }, actionsInterdites);
}

describe('couverture des listes d’actions interdites, langue par langue', () => {
  it('déclare les mêmes langues dans toutes les catégories de motifs de texte', () => {
    const parCategorie = Object.entries(actionsInterdites.motifsTexte).map(
      ([categorie, parLangue]) => [categorie, Object.keys(parLangue).sort()] as const,
    );
    const reference = parCategorie[0]?.[1] ?? [];
    expect(reference.length).toBeGreaterThan(1);
    for (const [categorie, langues] of parCategorie) {
      expect(langues, `catégorie « ${categorie} »`).toEqual(reference);
    }
  });

  it('couvre toutes les langues déclarées par le jeu de libellés équivalents', () => {
    const declarees = Object.keys(actionsInterdites.motifsTexte.paiement ?? {}).sort();
    for (const situation of SITUATIONS) {
      expect(Object.keys(situation.libelles).sort(), `situation « ${situation.nom} »`).toEqual(declarees);
    }
  });

  for (const situation of SITUATIONS) {
    describe(`situation « ${situation.nom} »`, () => {
      for (const [langue, libelles] of Object.entries(situation.libelles)) {
        for (const libelle of libelles) {
          it(`arrête « ${libelle} » (${langue})`, () => {
            const verdict = verdictTexte(libelle);
            expect(verdict.autorisee, `« ${libelle} » (${langue}) n'est arrêté par aucun motif`).toBe(false);
            expect(verdict.autorisee === false ? verdict.categorie : undefined).toBe(situation.categorie);
          });
        }
      }
    });
  }

  /**
   * CONTRE-ÉPREUVE, sans laquelle la première moitié inviterait à tout
   * bloquer : combler un trou ne doit pas fermer la navigation ordinaire
   * (APPRENTISSAGES n°2 — une correction se juge aussi par le défaut qu'elle
   * réintroduit). Un suivi de commande, un panier consulté ou une page de
   * livraison sont des pages à EXPLORER, pas des actes à interdire.
   */
  const NAVIGATIONS_ORDINAIRES: Record<string, string[]> = {
    fr: ['Suivre ma commande', 'Voir le panier', 'Livraison et retours', 'Mon compte', 'Catalogue', 'Nos commandes en atelier'],
    en: ['Track my order', 'View cart', 'Shipping and returns', 'My account', 'Catalogue'],
    es: ['Seguir mi pedido', 'Ver la cesta', 'Envíos y devoluciones', 'Mi cuenta'],
    de: ['Bestellung verfolgen', 'Warenkorb ansehen', 'Versand und Rückgabe', 'Mein Konto'],
    it: ['Traccia il mio ordine', 'Vedi il carrello', 'Spedizioni e resi', 'Il mio account'],
    pt: ['Acompanhar meu pedido', 'Ver o carrinho', 'Envios e devoluções', 'Minha conta'],
  };

  for (const [langue, libelles] of Object.entries(NAVIGATIONS_ORDINAIRES)) {
    for (const libelle of libelles) {
      it(`laisse passer « ${libelle} » (${langue}) : c'est une page à explorer, pas un acte`, () => {
        expect(verdictTexte(libelle), `« ${libelle} » (${langue})`).toEqual({ autorisee: true });
      });
    }
  }
});
