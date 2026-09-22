/**
 * Validation de données JSON contre un schéma JSON (draft-07) via Ajv.
 *
 * Utilisé pour la configuration, les scénarios et les manifestes : une
 * fixture malformée doit échouer bruyamment, jamais fausser un score.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Ajv } from 'ajv';

const ajv = new Ajv({ allErrors: true, strict: true });

/**
 * Un schéma est chargé une seule fois par processus : Ajv met en cache la
 * compilation par référence d'objet et refuse un second objet portant le
 * même `$id`. Sans ce cache, charger deux fois la config (ou deux fois les
 * scénarios) dans un même processus lèverait « schema ... already exists ».
 */
const schemasCharges = new Map<string, Promise<object>>();

export function chargerSchema(fichier: string): Promise<object> {
  const chemin = path.resolve(fichier);
  let schema = schemasCharges.get(chemin);
  if (schema === undefined) {
    schema = readFile(chemin, 'utf8').then((contenu) => JSON.parse(contenu) as object);
    schemasCharges.set(chemin, schema);
    // Un échec de lecture ne doit pas être mémorisé : on retente au prochain appel.
    schema.catch(() => schemasCharges.delete(chemin));
  }
  return schema;
}

/**
 * Valide `donnees` contre `schema` et les renvoie typées, ou lève une erreur
 * listant chaque violation. `nomObjet` sert uniquement au message d'erreur.
 */
export function valider<T>(schema: object, donnees: unknown, nomObjet: string): T {
  const validateur = ajv.compile(schema);
  if (!validateur(donnees)) {
    const details = ajv.errorsText(validateur.errors, { separator: '\n  - ', dataVar: nomObjet });
    throw new Error(`${nomObjet} invalide :\n  - ${details}`);
  }
  return donnees as T;
}
