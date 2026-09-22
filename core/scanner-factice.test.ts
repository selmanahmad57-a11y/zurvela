import { describe, expect, it } from 'vitest';
import { scanner } from './index.js';
import { scannerFactice } from './scanner-factice.js';

describe('scannerFactice', () => {
  it('est le scanner exposé par core/index tant que le moteur n’existe pas', () => {
    expect(scanner).toBe(scannerFactice);
  });

  it('rend un rapport vide qui respecte le contrat : URL reprise, aucune anomalie, coût nul, journal structuré', async () => {
    const url = 'http://127.0.0.1:4800';
    const options = { timeoutMs: 1234 };
    const rapport = await scannerFactice(url, options);

    expect(rapport.url).toBe(url);
    expect(rapport.anomalies).toEqual([]);
    expect(rapport.coutApi).toBe(0);
    expect(rapport.dureeMs).toBeGreaterThanOrEqual(0);
    expect(rapport.journal).toHaveLength(1);
    expect(rapport.journal[0]).toMatchObject({ type: 'scan.factice', details: { timeoutMs: options.timeoutMs } });
    expect(rapport.journal[0]?.horodatage).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(JSON.parse(JSON.stringify(rapport))).toEqual(rapport);
  });
});
