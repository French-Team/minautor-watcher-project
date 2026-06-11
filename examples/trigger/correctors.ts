// Exemple : src/trigger/correctors.ts
// Corrections automatiques avec ESLint

import { ESLint } from 'eslint';

export class CodeCorrector {
  private eslint: ESLint;

  constructor() {
    this.eslint = new ESLint({
      fix: true, // Active la correction automatique
    });
  }

  async correct(filePath: string): Promise<void> {
    await this.eslint.lintFiles([filePath]);
    console.log(`Corrections appliquées à ${filePath}`);
  }
}

// Utilisation :
const corrector = new CodeCorrector();
await corrector.correct('./project/file.ts');
