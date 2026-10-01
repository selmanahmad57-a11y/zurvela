/**
 * Le gabarit du cahier P2-3 — « recouvrement ». Ces tests ne notent pas le
 * moteur (le banc le fait) : ils garantissent que la page sert bien ce que
 * le gabarit promet, et SURTOUT qu'un geste n'est pas servi par deux
 * chemins. Un calque que deux gestes lèveraient ne mesurerait plus le
 * sien : la face « un geste par gabarit » perdrait son sens.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { chargerConfigScanner } from '../../core/scanner/config.js';
import { GESTES_FERMETURE } from '../../core/scanner/exploration/ecarter-recouvrement.js';
import { chargerConfig } from '../config.js';
import { demarrerServeur } from '../serveur.js';
import type { ConfigBanc, ServeurScenario } from '../types.js';
import { bugs } from './recouvrement/bugs/index.js';
import { recouvrement } from './recouvrement/index.js';
import { PAGE_ACCUEIL, PAGE_PANIER } from './recouvrement/structure.js';

let config: ConfigBanc;
const serveurs: ServeurScenario[] = [];

beforeAll(async () => {
  config = await chargerConfig();
});

afterAll(async () => {
  await Promise.all(serveurs.map((serveur) => serveur.arreter()));
});

async function servir(bugsActifs: string[], langue = 'fr'): Promise<ServeurScenario> {
  const serveur = await demarrerServeur({ id: `test--recouvrement--${bugsActifs.join('-')}--${langue}`, gabarit: recouvrement.nom, langue, bugsActifs }, recouvrement, config);
  serveurs.push(serveur);
  return serveur;
}

describe('recouvrement — les deux faces du contrat 1, et un geste par gabarit', () => {
  it('sain : rien ne recouvre rien', async () => {
    const serveur = await servir([]);
    const accueil = await (await fetch(serveur.url + PAGE_ACCUEIL)).text();
    expect(accueil).not.toContain('data-role="calque"');
    expect(accueil).toContain('data-role="zone-produits"');
  });

  it('Q01 ne cède qu’à Échap : aucun autre moyen de fermeture n’est servi', async () => {
    const accueil = await (await fetch((await servir(['Q01'])).url + PAGE_ACCUEIL)).text();
    expect(accueil).toContain("e.key==='Escape'");
    // Les contrôles qui peuvent échouer : un `<dialog>` ou une croix DANS le
    // calque rendraient le gabarit franchissable par un AUTRE geste. Le
    // `aria-label` de la navigation, lui, appartient à la page saine : c'est
    // le CALQUE qui ne doit offrir aucune prise, pas la page.
    expect(accueil).not.toContain('<dialog');
    expect(accueil).toMatch(/id="calque-echap"[^>]*><\/div>/);
  });

  it('Q02 ne cède qu’à la fermeture native, et sa taille est POSÉE', async () => {
    const accueil = await (await fetch((await servir(['Q02'])).url + PAGE_ACCUEIL)).text();
    expect(accueil).toContain('<dialog');
    expect(accueil).toContain('open');
    // La feuille par défaut d'un `<dialog>` dit `fit-content` : sans taille
    // explicite, un dialogue vide mesure zéro pixel et ne recouvre rien. Le
    // gabarit ne mesurerait alors plus son geste.
    expect(accueil).toContain('width:100%;height:100%');
    // Échap est NEUTRALISÉ : sinon il suffirait, et le geste mesuré ne serait
    // pas celui qu'on croit.
    expect(accueil).toContain("addEventListener('cancel'");
  });

  it('Q03 ne cède qu’à sa croix, trouvée par sa FORME et jamais par son texte', async () => {
    const accueil = await (await fetch((await servir(['Q03'])).url + PAGE_ACCUEIL)).text();
    expect(accueil).toContain('aria-label="zzqx"');
    // Le libellé ne veut rien dire dans aucune langue : si quelqu'un se
    // mettait un jour à LIRE le texte du bouton pour le reconnaître, ce
    // gabarit cesserait de passer. C'est la règle maîtresse §2, posée en
    // piège plutôt qu'en commentaire.
    expect(accueil).not.toContain('<dialog');
  });

  it('Q04 ne cède qu’au clic hors zone, et la page garde des points vides', async () => {
    const accueil = await (await fetch((await servir(['Q04'])).url + PAGE_ACCUEIL)).text();
    expect(accueil).toContain("!c.contains(e.target)");
    // Le calque vit DANS la zone positionnée : sans l'enveloppe, son
    // `inset:0` couvrirait la fenêtre entière et il n'existerait plus un seul
    // point vide — le geste deviendrait indisponible pour une raison
    // étrangère à ce qu'on mesure.
    expect(accueil.indexOf('data-role="zone-produits"')).toBeLessThan(accueil.indexOf('id="calque-hors"'));
  });

  it('Q05 et Q06 sont le MÊME calque, sur deux cibles de nature différente', async () => {
    // C'est le cœur du contrat 2 : deux recouvrements identiques, deux
    // gravités, parce que ce qui est masqué diffère.
    const panier = await (await fetch((await servir(['Q05'])).url + PAGE_PANIER)).text();
    const accueil = await (await fetch((await servir(['Q06'])).url + PAGE_ACCUEIL)).text();
    expect(panier).toContain('class="mur-commande"');
    expect(accueil).toContain('class="mur-pied"');
    // Aucun des deux n'offre de prise : ni dialogue, ni croix, ni écouteur.
    for (const page of [panier, accueil]) {
      expect(page).not.toContain('<dialog');
      expect(page).not.toContain('aria-label="zzqx"');
      expect(page).not.toContain('addEventListener');
    }
  });

  it('Q07 pose N calques de MÊME construction : mêmes classes, rangs différents', async () => {
    const accueil = await (await fetch((await servir(['Q07'])).url + PAGE_ACCUEIL)).text();
    const classes = [...accueil.matchAll(/class="voile carte-voile"/g)];
    expect(classes.length).toBeGreaterThan(1);
  });

  it('Q08 n’offre AUCUNE sémantique : ni bouton, ni lien, ni rôle, ni aria — seulement un `<p>` pleine largeur', async () => {
    // LE CAS the-internet, reproduit. Si ce gabarit gagnait un jour un
    // `<button>` ou un `aria-label`, la croix ARIA le fermerait et la voie
    // C cesserait d'être mesurée sans que rien ne rougisse.
    const accueil = await (await fetch((await servir(['Q08'])).url + PAGE_ACCUEIL)).text();
    const calque = accueil.slice(accueil.indexOf('id="modal-nu"'), accueil.indexOf('</script>'));
    expect(calque).toContain('<p id="prise-nue">');
    // LE VOILE EST VIDE, et la prise est dans son FRÈRE : la structure
    // conventionnelle d'un modal, et celle de the-internet. Si la prise
    // revenait DANS le voile, le gabarit cesserait d'éprouver la remontée
    // d'un cran — il passerait au vert en mesurant autre chose.
    expect(calque).toContain('id="voile-nu" style="position:absolute;inset:0;background:transparent"></div>');
    expect(calque.indexOf('id="voile-nu"')).toBeLessThan(calque.indexOf('id="boite-nue"'));
    expect(calque).not.toContain('<button');
    expect(calque).not.toContain('<a ');
    expect(calque).not.toContain('aria-');
    //  avec son espace :  est un repère du gabarit, pas un rôle ARIA.
    expect(calque).not.toContain(' role=');
    expect(calque).not.toContain('<dialog');
    // Le libellé ne veut rien dire dans aucune langue : un code qui se
    // mettrait à LIRE le texte ne trouverait rien ici.
    expect(accueil).toContain('qwzx');
    // La prise occupe toute la largeur : hors de tout « coin ».
    expect(calque).toContain('width:100%');
  });

  it('chaque geste de la liste a SON gabarit, et chaque gabarit a SON geste', async () => {
    // L'invariant de couverture : si un geste était ajouté au code sans son
    // gabarit, la face « un geste par gabarit » aurait un trou silencieux.
    const nomsGestes = bugs.filter((bug) => bug.ecartementAttendu === true).map((bug) => bug.nom);
    const gabaritDuGeste: Record<string, string> = {
      echap: 'modal-echap',
      'dialog-natif': 'dialog-natif',
      'controle-ferme': 'croix-aria',
      'clic-hors-zone': 'clic-hors-zone',
      'descendant-essaye': 'ferme-sans-semantique',
    };
    expect([...nomsGestes].sort()).toEqual([...GESTES_FERMETURE].map((geste) => gabaritDuGeste[geste]).sort());
  });

  it('les gestes du gabarit sont ceux que la CONFIG active : un geste désactivé n’aurait plus de mesure', async () => {
    const scanner = await chargerConfigScanner();
    expect([...scanner.detecteurs.recouvrement.fermeture.gestes].sort()).toEqual([...GESTES_FERMETURE].sort());
  });
});
