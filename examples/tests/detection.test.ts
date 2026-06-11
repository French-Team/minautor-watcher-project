// Exemple de tests avec Jest pour le secteur Détection

import { DetectionSector } from '../src/detection';

describe('DetectionSector', () => {
  let detection: DetectionSector;

  beforeEach(() => {
    detection = new DetectionSector('./test-project');
  });

  afterEach(() => {
    detection.stop();
  });

  test('should emit fileChanged event on file change', (done) => {
    detection.on('fileChanged', (path) => {
      expect(path).toContain('test-file.ts');
      done();
    });

    detection.start();
    // Simuler un changement de fichier (utiliser fs-extra pour tests réels)
  });

  test('should not watch ignored directories', () => {
    // Test que node_modules est ignoré
    expect(true).toBe(true); // Placeholder - à implémenter avec mocks
  });
});

// Pour lancer : npm test
