/**
 * L'ANALYSE D'UN `robots.txt`, cas par cas.
 *
 * Ce module décide si nous avons le droit de regarder une page. Une erreur
 * dans un sens nous fait visiter ce qu'on nous interdit ; dans l'autre, elle
 * nous fait rendre un rapport amputé en silence. Les deux comptent.
 */
import { describe, expect, it } from 'vitest';
import { analyserRobots, jetonAgent, ROBOTS_PERMISSIF } from './robots.js';

const NOTRE_AGENT = 'ZurvelaBot/0.1 (+https://zurvela.com)';
const analyser = (texte: string) => analyserRobots(texte, NOTRE_AGENT);

describe('jetonAgent', () => {
  it('retient le jeton PRODUIT, sans version ni commentaire', () => {
    expect(jetonAgent(NOTRE_AGENT)).toBe('zurvelabot');
  });
});

describe('analyserRobots', () => {
  it('un fichier vide n’interdit rien', () => {
    expect(analyser('').estAutorise('/prive')).toBe(true);
  });

  it('interdit ce que le groupe générique interdit', () => {
    const robots = analyser('User-agent: *\nDisallow: /prive\n');
    expect(robots.estAutorise('/prive')).toBe(false);
    expect(robots.estAutorise('/prive/dossier')).toBe(false);
    expect(robots.estAutorise('/public')).toBe(true);
  });

  it('le groupe qui NOUS NOMME l’emporte, et éteint le générique', () => {
    // La norme est explicite : on ne cumule pas les groupes, on choisit le
    // plus spécifique. Cumuler nous interdirait des chemins que le site nous
    // a expressément ouverts.
    const robots = analyser('User-agent: *\nDisallow: /\n\nUser-agent: ZurvelaBot\nDisallow: /admin\n');
    expect(robots.estAutorise('/')).toBe(true);
    expect(robots.estAutorise('/contact')).toBe(true);
    expect(robots.estAutorise('/admin')).toBe(false);
  });

  it('« Disallow: » VIDE autorise tout : c’est la façon canonique de nous ouvrir le site', () => {
    const robots = analyser('User-agent: ZurvelaBot\nDisallow:\n');
    expect(robots.estAutorise('/quoi-que-ce-soit')).toBe(true);
  });

  it('« Disallow: / » nous ferme le site en entier', () => {
    const robots = analyser('User-agent: ZurvelaBot\nDisallow: /\n');
    expect(robots.estAutorise('/')).toBe(false);
    expect(robots.estAutorise('/contact')).toBe(false);
  });

  it('la règle au motif le plus LONG gagne, et à longueur égale « Allow » l’emporte', () => {
    const robots = analyser('User-agent: *\nDisallow: /dossier\nAllow: /dossier/public\n');
    expect(robots.estAutorise('/dossier/prive')).toBe(false);
    expect(robots.estAutorise('/dossier/public')).toBe(true);

    const egalite = analyser('User-agent: *\nDisallow: /page\nAllow: /page\n');
    expect(egalite.estAutorise('/page')).toBe(true);
  });

  it('comprend les jokers « * » et l’ancre « $ »', () => {
    const robots = analyser('User-agent: *\nDisallow: /*.pdf$\nDisallow: /tmp/*/cache\n');
    expect(robots.estAutorise('/documents/rapport.pdf')).toBe(false);
    expect(robots.estAutorise('/documents/rapport.pdf.html')).toBe(true);
    expect(robots.estAutorise('/tmp/a/cache')).toBe(false);
    expect(robots.estAutorise('/tmp/cache')).toBe(true);
  });

  it('ignore les commentaires, la casse des champs et les lignes qu’il ne connaît pas', () => {
    const robots = analyser('# bonjour\nUSER-AGENT: *\nCrawl-delay: 30\nSitemap: https://x.invalid/s.xml\nDISALLOW: /prive # note\n');
    expect(robots.estAutorise('/prive')).toBe(false);
    expect(robots.estAutorise('/public')).toBe(true);
  });

  it('des « User-agent » CONSÉCUTIFS ouvrent un seul groupe', () => {
    const robots = analyser('User-agent: AutreBot\nUser-agent: ZurvelaBot\nDisallow: /partage\n');
    expect(robots.estAutorise('/partage')).toBe(false);
  });

  it('un groupe qui ne nous concerne pas ne nous interdit rien', () => {
    const robots = analyser('User-agent: AutreBot\nDisallow: /\n');
    expect(robots.estAutorise('/')).toBe(true);
  });

  it('le permissif est permissif, et il DIT qu’il n’a rien trouvé', () => {
    // La distinction compte au journal : « rien ne nous interdit » n'est pas
    // la même information que « nous n'avons pas pu lire ».
    expect(ROBOTS_PERMISSIF.estAutorise('/prive')).toBe(true);
    expect(ROBOTS_PERMISSIF.trouve).toBe(false);
    expect(analyser('User-agent: *\nDisallow: /prive\n').trouve).toBe(true);
  });
});
